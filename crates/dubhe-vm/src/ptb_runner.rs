use anyhow;
use bcs;
use dubhe_common::StoreSetRecord;
use dubhe_db::interface::Database;
use dubhe_db::interface::DatabaseRef;
use dubhe_db::CacheDB;
use dubhe_db::DubheDB;
use dubhe_db::WrapDatabaseAsync;
use move_core_types::language_storage::StructTag;
use move_core_types::u256::U256;
use move_trace_format::format::MoveTraceBuilder;
use move_trace_format::format::MoveTraceReader;
use move_vm_runtime::move_vm::MoveVM;
use serde::{Deserialize, Serialize};
use serde_json::Number;
use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::BTreeMap;
use std::collections::HashSet;
use std::rc::Rc;
use std::str::FromStr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use sui_adapter_latest::adapter::new_move_vm;
use sui_adapter_latest::execution_engine::execute_transaction_to_effects;
use sui_adapter_latest::execution_mode::DevInspect;
use sui_adapter_latest::execution_mode::Normal;
use sui_json_rpc_types::SuiObjectData;
use sui_json_rpc_types::SuiObjectDataOptions;
use sui_json_rpc_types::SuiObjectResponse;
use sui_json_rpc_types::SuiRawData::MoveObject;
use sui_json_rpc_types::SuiRawMoveObject;
use sui_move_build::CompiledPackage;
use sui_move_natives_latest::all_natives;
use sui_protocol_config::ProtocolConfig;
use sui_sdk::{SuiClient, SuiClientBuilder};
use sui_types::base_types::MoveObjectType;
use sui_types::base_types::MoveObjectType_::Other;
use sui_types::base_types::ObjectID;
use sui_types::base_types::ObjectType::Struct;
use sui_types::base_types::SequenceNumber;
use sui_types::base_types::{SuiAddress, TransactionDigest, TxContext};
use sui_types::committee::EpochId;
use sui_types::digests::ObjectDigest;
use sui_types::gas::SuiGasStatus;
use sui_types::metrics::LimitsMetrics;
use sui_types::move_package::MovePackage;
use sui_types::object::Object;
use sui_types::object::Owner::Shared;
use sui_types::storage::{BackingPackageStore, ObjectStore};
use sui_types::storage::{ChildObjectResolver, ParentSync};
use sui_types::transaction::Argument;
use sui_types::transaction::CallArg;
use sui_types::transaction::Command;
use sui_types::transaction::ObjectArg;
use sui_types::transaction::ProgrammableMoveCall;
use sui_types::transaction::{
    CheckedInputObjects, GasData, ProgrammableTransaction, TransactionKind,
};
use sui_types::transaction::{InputObjectKind, ObjectReadResult, ObjectReadResultKind};
use sui_types::Identifier;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct Balance {
    id: SuiAddress,
    name: Vec<u8>,
    amount: U256,
    asset_id: SuiAddress,
    x: u128,
    y: u64,
    z: u32,
    p: u16,
    q: u8,
    s: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct AssetAccount {
    id: SuiAddress,
    name: Vec<u8>,
    balance: U256,
    status: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct AssetSupply {
    id: SuiAddress,
    name: Vec<u8>,
    supply: U256,
    holder: U256,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct SetRecord {
    dapp_key: String,
    account: String,
    key: Vec<Vec<u8>>,
    value: Vec<Vec<u8>>,
}

pub fn test_execute_single_ptb<
    DB: Database + DatabaseRef + ObjectStore + BackingPackageStore + ChildObjectResolver + ParentSync,
>(
    ptb: &ProgrammableTransaction,
    db: &mut DB,
    sender: SuiAddress,
) -> anyhow::Result<(Vec<sui_types::event::Event>, u64, String)> {
    println!("      🔧 开始执行 PTB...");

    // 创建 Move VM
    let protocol_config = ProtocolConfig::get_for_max_version_UNSAFE();
    let vm = Arc::new(new_move_vm(
        all_natives(true, &protocol_config),
        &protocol_config,
    )?);

    // 创建 gas status（无计量模式）
    let gas_status = SuiGasStatus::new(1000000000, 1, 0, &protocol_config).unwrap();

    // 创建 metrics
    let metrics = Arc::new(LimitsMetrics::new(&prometheus::Registry::new()));

    // 创建交易上下文相关
    // 创建一个随机交易摘要
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let mut digest_bytes = [0u8; 32];
    rng.fill(&mut digest_bytes);
    let tx_digest = TransactionDigest::new(digest_bytes);

    let epoch_id = EpochId::default();
    // 现在的毫秒时间戳
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let epoch_timestamp_ms = now as u64;

    // 🔑 关键修复：从 PTB inputs 中构建真正的输入对象列表
    println!("        📦 构建输入对象列表...");
    let mut input_objects_vec = Vec::new();

    let input_objects = ptb.input_objects().unwrap();
    let first_input_object_kind = input_objects.get(0).unwrap();
    let object_id = first_input_object_kind.object_id();
    let object: Object = ObjectStore::get_object(db, &object_id).unwrap();
    let input_obj = ObjectReadResult::new(
        first_input_object_kind.clone(),
        ObjectReadResultKind::Object(object),
    );

    input_objects_vec.push(input_obj);

    let input_count = input_objects_vec.len();
    let input_objects = CheckedInputObjects::new_for_genesis(input_objects_vec);
    println!("        ✅ 构建了 {} 个输入对象", input_count);

    // 准备 gas 数据（空）
    let gas_data = GasData {
        payment: vec![],
        owner: sender,
        price: 1,
        budget: 1000000000,
    };

    // 创建交易类型
    let transaction_kind = TransactionKind::ProgrammableTransaction(ptb.clone());

    // certificate_deny_set（空）
    let certificate_deny_set = Ok(());

    // trace_builder（空）
    let mut trace_builder_opt = Some(MoveTraceBuilder::new());

    // 执行 PTB
    println!("        🚀 调用 Sui PTB 执行引擎...");
    let (_temp_store, _final_gas_status, _effects, _timings, execution_result) =
        execute_transaction_to_effects::<DevInspect<true>>(
            db,                     // store: &dyn BackingStore
            input_objects,          // input_objects: CheckedInputObjects
            gas_data,               // gas_data: GasData
            gas_status,             // gas_status: SuiGasStatus
            transaction_kind,       // transaction_kind: TransactionKind
            sender,                 // transaction_signer: SuiAddress
            tx_digest,              // transaction_digest: TransactionDigest
            &vm,                    // move_vm: &Arc<MoveVM>
            &epoch_id,              // epoch_id: &EpochId
            epoch_timestamp_ms,     // epoch_timestamp_ms: u64
            &protocol_config,       // protocol_config: &ProtocolConfig
            metrics,                // metrics: Arc<LimitsMetrics>
            false,                  // enable_expensive_checks: bool
            certificate_deny_set,   // certificate_deny_set: &HashSet<TransactionDigest>
            &mut trace_builder_opt, // trace_builder_opt: &mut Option<MoveTraceBuilder>
        );

    let bytes = trace_builder_opt
        .unwrap()
        .into_trace()
        .into_compressed_json_bytes();
    let reader = MoveTraceReader::new(std::io::Cursor::new(bytes)).unwrap();

    for (i, event) in reader.enumerate() {
        let event = event.unwrap();
        println!("event: {:?}", event);
    }

    match execution_result {
        Ok(_execution_results) => {
            // println!("execution_result: {:?}", _execution_results.clone());
            // println!("trace_builder_opt: {:?}", trace_builder_opt.as_ref().unwrap().into_trace());
            // println!("_effects: {:?}", _effects);
            // println!("execution_result: {:?}", _temp_store.written);
            _temp_store.written.iter().for_each(|(id, object)| {
                println!("id: {:?}", id);
                println!("object: {:?}", object.as_inner().version());
                println!("object: {:?}", object.as_inner().owner);
                println!("object: {:?}", object.as_inner().type_());
                println!("object: {:?}", object.is_child_object());
                // if object.is_child_object() {
                //     println!("object: {:?}", object.as_inner().data.try_as_move().unwrap().contents());
                //     println!("object: {:?}", object.as_inner().data.try_as_move().unwrap().type_());
                // }
                let _ = db.insert_object(object.clone());
            });
            _temp_store.events.data.iter().for_each(|event| {
                match bcs::from_bytes::<SetRecord>(event.contents.as_slice()) {
                    Ok(record) => {
                        println!("record: {:?}", record);
                        println!("record: {:?}", unsafe {
                            String::from_utf8_unchecked(record.key[0].clone())
                        });
                    }
                    Err(e) => {}
                }
            });

            Ok((
                _temp_store.events.data,
                epoch_timestamp_ms,
                tx_digest.to_string(),
            ))
        }
        Err(e) => {
            println!("          ❌ PTB 执行失败: {}", e);
            Err(anyhow::anyhow!("PTB execution failed: {}", e))
        }
    }
}

/// 执行单个 PTB
pub fn execute_single_ptb<
    DB: Database + DatabaseRef + ObjectStore + BackingPackageStore + ChildObjectResolver + ParentSync,
>(
    ptb: &ProgrammableTransaction,
    state: &mut DB,
    sender: SuiAddress,
    tx_digest: TransactionDigest,
) -> anyhow::Result<(Vec<sui_types::event::Event>, u64, String)> {
    println!("      🔧 开始执行 PTB...");

    // 创建 Move VM
    let protocol_config = ProtocolConfig::get_for_max_version_UNSAFE();
    let vm = Arc::new(new_move_vm(
        all_natives(true, &protocol_config),
        &protocol_config,
    )?);

    // 创建 gas status（无计量模式）
    let gas_status = SuiGasStatus::new(1000000000, 1, 0, &protocol_config).unwrap();

    // 创建 metrics
    let metrics = Arc::new(LimitsMetrics::new(&prometheus::Registry::new()));

    // 创建交易上下文相关
    // let tx_digest = TransactionDigest::genesis_marker();
    // 创建一个随机交易摘要
    // 0x0300000000000000000000000000000000000000000000000000000000000000
    // let tx_digest = TransactionDigest::new([0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    let epoch_id = EpochId::default();
    // 现在的毫秒时间戳
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let epoch_timestamp_ms = now as u64;

    // 🔑 关键修复：从 PTB inputs 中构建真正的输入对象列表
    println!("        📦 构建输入对象列表...");
    let mut input_objects_vec = Vec::new();

    let input_objects = ptb.input_objects().unwrap();
    let first_input_object_kind = input_objects.get(0).unwrap();
    let object_id = first_input_object_kind.object_id();
    let object: Object = ObjectStore::get_object(state, &object_id).unwrap();
    let input_obj = ObjectReadResult::new(
        first_input_object_kind.clone(),
        ObjectReadResultKind::Object(object),
    );

    input_objects_vec.push(input_obj);

    let input_count = input_objects_vec.len();
    let input_objects = CheckedInputObjects::new_for_genesis(input_objects_vec);
    println!("        ✅ 构建了 {} 个输入对象", input_count);

    // 准备 gas 数据（空）
    let gas_data = GasData {
        payment: vec![],
        owner: sender,
        price: 1,
        budget: 1000000000,
    };

    // 创建交易类型
    let transaction_kind = TransactionKind::ProgrammableTransaction(ptb.clone());

    // certificate_deny_set（空）
    let certificate_deny_set = Ok(());

    // trace_builder（空）
    let mut trace_builder_opt = None;

    // 执行 PTB
    println!("        🚀 调用 Sui PTB 执行引擎...");
    let (_temp_store, _final_gas_status, _effects, _timings, execution_result) =
        execute_transaction_to_effects::<DevInspect<true>>(
            state,                  // store: &dyn BackingStore
            input_objects,          // input_objects: CheckedInputObjects
            gas_data,               // gas_data: GasData
            gas_status,             // gas_status: SuiGasStatus
            transaction_kind,       // transaction_kind: TransactionKind
            sender,                 // transaction_signer: SuiAddress
            tx_digest,              // transaction_digest: TransactionDigest
            &vm,                    // move_vm: &Arc<MoveVM>
            &epoch_id,              // epoch_id: &EpochId
            epoch_timestamp_ms,     // epoch_timestamp_ms: u64
            &protocol_config,       // protocol_config: &ProtocolConfig
            metrics,                // metrics: Arc<LimitsMetrics>
            false,                  // enable_expensive_checks: bool
            certificate_deny_set,   // certificate_deny_set: &HashSet<TransactionDigest>
            &mut trace_builder_opt, // trace_builder_opt: &mut Option<MoveTraceBuilder>
        );

    match execution_result {
        Ok(_execution_results) => {
            println!("execution_result: {:?}", _execution_results.clone());
            println!("_effects: {:?}", _effects);
            println!("execution_result: {:?}", _temp_store.written);
            _temp_store.written.iter().for_each(|(_id, object)| {
                println!("id: {:?}", _id);
                println!("object: {:?}", object);

                // Now insert_object accepts Object directly
                let _ = state.insert_object(object.clone());
            });

            Ok((
                _temp_store.events.data,
                epoch_timestamp_ms,
                tx_digest.to_string(),
            ))
        }
        Err(e) => {
            println!("          ❌ PTB 执行失败: {}", e);
            Err(anyhow::anyhow!("PTB execution failed: {}", e))
        }
    }
}

pub fn execute_single_ptb_with_store_set_record<
    DB: Database + DatabaseRef + ObjectStore + BackingPackageStore + ChildObjectResolver + ParentSync,
>(
    ptb: &ProgrammableTransaction,
    state: &mut DB,
    sender: SuiAddress,
    tx_digest: TransactionDigest,
) -> anyhow::Result<(Vec<dubhe_common::Event>, u64, String)> {
    let (events, current_checkpoint_timestamp_ms, current_digest) =
        execute_single_ptb(ptb, state, sender, tx_digest)?;
    // Only parse the StoreSetRecord event
    let mut store_set_records = Vec::new();
    events
        .iter()
        .filter(|event| event.type_.name.to_string() == "Dubhe_Store_SetRecord")
        .for_each(
            |event| match bcs::from_bytes::<StoreSetRecord>(event.contents.as_slice()) {
                Ok(record) => {
                    store_set_records.push(dubhe_common::Event::StoreSetRecord(record.clone()));
                }
                Err(e) => {}
            },
        );
    Ok((
        store_set_records,
        current_checkpoint_timestamp_ms,
        current_digest,
    ))
}

fn dapp_dapp_key(dapp_key: &str, table_name: &[u8]) -> Vec<u8> {
    let mut vec = vec![];
    vec.extend_from_slice(dapp_key.as_bytes());
    vec.extend_from_slice(table_name);
    vec
}

fn dapp_data_key_serde_value(dapp_key: &[u8], table_name: &[u8]) -> serde_json::Value {
    let mut vec = vec![];
    vec.extend_from_slice(dapp_key);
    vec.extend_from_slice(table_name);
    serde_json::Value::Array(
        vec.iter()
            .map(|v| serde_json::Value::Number(Number::from_u128(u128::from(*v)).unwrap()))
            .collect(),
    )
}

/// 从 SuiObjectResponse 中提取 value 字段信息，返回 JSON 格式
///
/// 这个函数专门用于处理 dynamic_field::Field 类型的对象
///
/// # Example
/// ```json
/// {
///   "type": "0xd4351c3440713ed24e247aea7b00250cf617ea1bacd2f1fe412500d81c6c65ed::map_system::Position",
///   "fields": {
///     "x": "1",
///     "y": "0"
///   }
/// }
/// ```
pub fn extract_value_from_sui_object_response(
    response: &SuiObjectResponse,
) -> anyhow::Result<Value> {
    use sui_json_rpc_types::{SuiMoveValue, SuiParsedData};

    // 1. 获取 data 字段
    let data = response
        .data
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("SuiObjectResponse.data is None"))?;

    // 2. 获取 content 字段
    let content = data
        .content
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("SuiObjectData.content is None"))?;

    // 3. 从 content 中提取 MoveObject
    let move_object = match content {
        SuiParsedData::MoveObject(obj) => obj,
        _ => return Err(anyhow::anyhow!("Content is not a MoveObject")),
    };

    // 4. 从 fields 中获取 "value" 字段
    let value_field = move_object
        .fields
        .field_value("value")
        .ok_or_else(|| anyhow::anyhow!("Field 'value' not found in MoveObject.fields"))?;

    // 5. 从对象类型中提取 value 的类型信息
    // 对于 dynamic_field::Field<K, V>，V 的类型是第二个类型参数
    let value_type = if move_object.type_.type_params.len() >= 2 {
        &move_object.type_.type_params[1]
    } else {
        return Err(anyhow::anyhow!(
            "Expected at least 2 type parameters for dynamic_field::Field"
        ));
    };

    // 6. 将 TypeTag 转换为字符串形式
    let value_type_str = match value_type {
        sui_types::TypeTag::Struct(s) => format_struct_tag(s),
        _ => value_type.to_string(),
    };

    // 7. 从 value_field 中提取结构体信息
    match value_field {
        SuiMoveValue::Struct(struct_value) => {
            // 将结构体字段转换为 JSON Map
            let mut fields_map = serde_json::Map::new();

            // 遍历结构体的所有字段
            extract_struct_fields(&struct_value, &mut fields_map);

            // 构造返回的 JSON
            Ok(json!({
                "type": value_type_str,
                "fields": fields_map
            }))
        }
        _ => Err(anyhow::anyhow!("Value field is not a Struct")),
    }
}

/// 递归提取结构体字段到 JSON Map
fn extract_struct_fields(
    struct_value: &sui_json_rpc_types::SuiMoveStruct,
    map: &mut serde_json::Map<String, Value>,
) {
    use sui_json_rpc_types::SuiMoveValue;

    // 尝试将 SuiMoveStruct 转换为 JSON 格式
    // SuiMoveStruct 是一个枚举，我们需要根据其变体来处理
    match struct_value {
        sui_json_rpc_types::SuiMoveStruct::WithFields(fields) => {
            for (field_name, field_value) in fields {
                let json_value = sui_move_value_to_json(field_value);
                map.insert(field_name.clone(), json_value);
            }
        }
        sui_json_rpc_types::SuiMoveStruct::WithTypes { type_, fields } => {
            for (field_name, field_value) in fields {
                let json_value = sui_move_value_to_json(field_value);
                map.insert(field_name.clone(), json_value);
            }
        }
        _ => {
            // 其他变体暂不处理
        }
    }
}

/// 将 SuiMoveValue 转换为 serde_json::Value
fn sui_move_value_to_json(value: &sui_json_rpc_types::SuiMoveValue) -> Value {
    use sui_json_rpc_types::SuiMoveValue;

    match value {
        SuiMoveValue::Number(n) => {
            // SuiMoveValue::Number 是 u32，需要转换为 serde_json::Number
            Value::Number(serde_json::Number::from(*n))
        }
        SuiMoveValue::Bool(b) => Value::Bool(*b),
        SuiMoveValue::Address(addr) => Value::String(addr.to_string()),
        SuiMoveValue::String(s) => Value::String(s.clone()),
        SuiMoveValue::UID { id } => Value::String(id.to_string()),
        SuiMoveValue::Struct(nested_struct) => {
            let mut nested_map = serde_json::Map::new();
            extract_struct_fields(&nested_struct, &mut nested_map);
            Value::Object(nested_map)
        }
        SuiMoveValue::Vector(vec) => {
            let vec_values: Vec<Value> = vec.iter().map(sui_move_value_to_json).collect();
            Value::Array(vec_values)
        }
        SuiMoveValue::Option(opt) => match opt.as_ref() {
            Some(v) => sui_move_value_to_json(v),
            None => Value::Null,
        },
        SuiMoveValue::Variant(variant) => {
            let variant_fields: Vec<Value> = variant
                .fields
                .values()
                .map(sui_move_value_to_json)
                .collect();
            json!({
                "variant": variant.type_.clone(),
                "fields": variant_fields
            })
        }
    }
}

/// 格式化 StructTag 为字符串形式: "0xaddress::module::name"
fn format_struct_tag(tag: &StructTag) -> String {
    format!("0x{}::{}::{}", tag.address, tag.module, tag.name)
}

/// 判断对象是否为 dynamic_field::Field，且 value 类型匹配指定的结构体名称
///
/// # Arguments
/// * `object` - 要检查的对象
/// * `value_struct_name` - 可选的目标结构体名称（例如 "AssetSupply" 或 "AssetAccount"）。如果为 None，则只检查是否为 Field。
pub fn is_dynamic_field(object: &Object, value_struct_name: Option<&str>) -> bool {
    use std::str::FromStr;

    // 尝试获取 Move 对象
    if let Some(move_obj) = object.data.try_as_move() {
        // 获取类型标签
        if let Some(struct_tag) = move_obj.type_().other() {
            // 检查是否为 0x2::dynamic_field::Field
            // 0x2 地址
            let dynamic_field_addr = SuiAddress::from_str(
                "0000000000000000000000000000000000000000000000000000000000000002",
            )
            .unwrap();

            if struct_tag.address == dynamic_field_addr.into()
                && struct_tag.module.as_str() == "dynamic_field"
                && struct_tag.name.as_str() == "Field"
            {
                // 如果指定了 value 类型名称，则进一步检查
                if let Some(target_name) = value_struct_name {
                    // Field<Name, Value>，Value 是第二个类型参数
                    if struct_tag.type_params.len() >= 2 {
                        if let sui_types::TypeTag::Struct(value_tag) = &struct_tag.type_params[1] {
                            return value_tag.name.as_str() == target_name;
                        }
                    }
                    return false;
                }
                return true;
            }
        }
    }
    false
}

async fn mock_ptb_shared<DB: DatabaseRef>(
    sender: SuiAddress,
    package: ObjectID,
    dapp_hub: ObjectID,
    module: String,
    function: String,
    arguments: Vec<Vec<u8>>,
    cache_db: &mut CacheDB<DB>,
) {
    let object = cache_db.load_object(dapp_hub).unwrap();
    println!("object: {:?}", object.clone().into_inner());

    let client = SuiClientBuilder::default().build_localnet().await.unwrap();
    let mut inputs: Vec<CallArg> = arguments
        .iter()
        .map(|arg| CallArg::Pure(arg.clone()))
        .collect();
    // push the dapp_hub as the first input
    inputs.insert(
        0,
        CallArg::Object(ObjectArg::SharedObject {
            id: dapp_hub,
            initial_shared_version: object.owner.start_version().unwrap(),
            mutable: true,
        }),
    );

    let ptb = ProgrammableTransaction {
        inputs: inputs.clone(),
        commands: vec![Command::MoveCall(Box::new(ProgrammableMoveCall {
            package,
            module,
            function,
            type_arguments: vec![],
            arguments: (0..inputs.len())
                .map(|i| sui_types::transaction::Argument::Input(i as u16))
                .collect(),
        }))],
    };
    test_execute_single_ptb(&ptb, cache_db, sender);
}

#[cfg(test)]
mod tests {
    use super::*;
    use dubhe_db::in_memory_db::CacheDB;
    use dubhe_db::initialize_cache;
    use dubhe_db::interface::WrapDatabaseAsync;
    use dubhe_db::DubheDB;
    use hex::ToHex;
    use move_core_types::u256::U256;
    use sui_json_rpc_types::SuiData;
    use sui_types::dynamic_field::DynamicFieldName;
    use sui_types::effects::ObjectIn;
    use sui_types::transaction::Command;

    // dubhe hub: 0x86c8925b708ecd5570d70f3ccbc30035f9fa65480b546a563afdc046da98d103
    // dubhe package: 0xa337791835d15223727ace33cce17ea0901c094c8cfbe34d089c1a18c2df7a15
    // dapp package: 0x76ae48d32307ff431edb92e4b89479828b59830e862848863ec6c58e121ed297
    // origin dapp package: 0x4c3f65fa8562679d00076350b51c1c3f2d966d83a4a6609a13f4fb04561d1140
    #[tokio::test(flavor = "multi_thread")]
    async fn before_mock_ptb_shared() {
        let client = SuiClientBuilder::default().build_localnet().await.unwrap();
        let dubhedb = DubheDB::new(client);
        let wrapped_dubhedb = WrapDatabaseAsync::new(dubhedb).unwrap();
        let mut cache_db = CacheDB::new(wrapped_dubhedb);

        let dapp_id = ObjectID::from_str(
            "0xfb336afc0f0454e6026d1d793a183cc09c0f7daec2dd8b2ed836adcf4dd2b233",
        )
        .unwrap();
        let object = cache_db.load_object(dapp_id).unwrap();
        println!("object: {:?}", object.into_inner());

        let client = SuiClientBuilder::default().build_localnet().await.unwrap();
        // let fields_id = ObjectID::from_str("0x7b19c17d22a15f31d5f63c8bb411ba8ec7fe51bca32565da0ebb9f15f0ac2371").unwrap();
        // let dynamic_fields = client.read_api().get_dynamic_fields(fields_id, None, Some(50)).await.unwrap();
        // println!("dynamic_fields: {:?}", dynamic_fields);

        let parent_object_id = ObjectID::from_hex_literal(
            "0xef5f0a7e6f18fe3d8154ba023e5e17b36bc026dc853372a451a1f358708000db",
        )
        .unwrap();
        let name = DynamicFieldName {
            type_: sui_types::TypeTag::Vector(Box::new(sui_types::TypeTag::U8)),
            value: dapp_data_key_serde_value(
                b"ffae791c3b063c623f507d1339ba8e15796dc62f0d42765cfaa221c645a34aa4",
                b"",
            ),
        };
        //  let dynamic_field_object = client.read_api().get_dynamic_field_object(parent_object_id, name).await.unwrap();
        //  println!("dynamic_field_object: {:?}", dynamic_field_object);

        // let fields_id = ObjectID::from_str("0x8da26e6c1eb47461ef3efadff3c611d38918230607aa9db56e01f5ec7cc8d9d8").unwrap();
        // let dynamic_fields = client.read_api().get_dynamic_fields(fields_id, None, Some(50)).await.unwrap();
        // println!("dynamic_fields: {:?}", dynamic_fields);
        // for d in dynamic_fields.data {
        //     let object_id = d.object_id;
        //     let object = client.read_api().get_object_with_options(object_id, sui_json_rpc_types::SuiObjectDataOptions {
        //         show_type: true,
        //         show_owner: true,
        //         show_previous_transaction: true,
        //         show_display: true,
        //         show_content: true,
        //         show_bcs: true,
        //         show_storage_rebate: true,
        //     }).await.unwrap();
        //     println!("object: {:?}", object);
        // }

        let object = cache_db.load_object(dapp_id).unwrap();

        let ptb = ProgrammableTransaction {
            inputs: vec![
                CallArg::Object(ObjectArg::SharedObject {
                    id: object.id(),
                    initial_shared_version: object.owner.start_version().unwrap(),
                    mutable: true,
                }),
                CallArg::Pure(
                    bcs::to_bytes(
                        &SuiAddress::from_str(
                            "0xffae791c3b063c623f507d1339ba8e15796dc62f0d42765cfaa221c645a34aa4",
                        )
                        .unwrap(),
                    )
                    .unwrap(),
                ),
                CallArg::Pure(bcs::to_bytes(&1u128).unwrap()),
                CallArg::Pure(bcs::to_bytes(&1u64).unwrap()),
            ],
            commands: vec![Command::MoveCall(Box::new(ProgrammableMoveCall {
                package: ObjectID::from_hex_literal(
                    "0x56804ec97ed74e12fa3d4dbc4c32831107c64484ae7f7b3cc775d814672be9de",
                )
                .unwrap(),
                module: "map_system".to_string(),
                function: "set_position".to_string(),
                type_arguments: vec![],
                arguments: vec![
                    sui_types::transaction::Argument::Input(0),
                    sui_types::transaction::Argument::Input(1),
                    sui_types::transaction::Argument::Input(2),
                    sui_types::transaction::Argument::Input(3),
                ],
            }))],
        };

        // let sender = SuiAddress::from_str("0x4b8e9e6510fb69201b63d9466c5e382dde2073a6eaf9e3b70f4b82d000a8bc25").unwrap();
        let sender = SuiAddress::from_str(
            "0xcdD077770ceb5271e42289Ee1A9b3a19442F445d000000000000000000000000",
        )
        .unwrap();

        test_execute_single_ptb(&ptb, &mut cache_db, sender);

        test_execute_single_ptb(&ptb, &mut cache_db, sender);

        // test_execute_single_ptb(&ptb, &mut cache_db, sender);

        // println!("objects in cache ===================================");
        // cache_db.cache.read().unwrap().objects.iter().for_each( |(id, object)| {
        //     if object.is_child_object() {
        //         println!("==================================================");
        //         println!("id: {:?}", id);
        //         println!("object: {:?}", object.as_inner().data.try_as_move().unwrap().contents());
        //         println!("==================================================");
        //     }

        // });
    }

    // dubhe hub: 0x86c8925b708ecd5570d70f3ccbc30035f9fa65480b546a563afdc046da98d103
    // dubhe package: 0xa337791835d15223727ace33cce17ea0901c094c8cfbe34d089c1a18c2df7a15
    // dapp package: 0x76ae48d32307ff431edb92e4b89479828b59830e862848863ec6c58e121ed297
    // origin dapp package: 0x4c3f65fa8562679d00076350b51c1c3f2d966d83a4a6609a13f4fb04561d1140
    #[tokio::test(flavor = "multi_thread")]
    async fn get_object() {
        let client = SuiClientBuilder::default().build_localnet().await.unwrap();
        let object_id = ObjectID::from_hex_literal(
            "0x85a27b64db0339e31d0d8f3f7a18b50a384797584fa9f9c1732d74a4692312b7",
        )
        .unwrap();
        let object = client
            .read_api()
            .get_object_with_options(
                object_id,
                sui_json_rpc_types::SuiObjectDataOptions {
                    show_type: true,
                    show_owner: true,
                    show_previous_transaction: true,
                    show_display: true,
                    show_content: true,
                    show_bcs: true,
                    show_storage_rebate: true,
                },
            )
            .await
            .unwrap();

        //
        // pub object_id: ObjectID,
        // pub version: SequenceNumber,
        // pub digest: ObjectDigest,
        // pub type_: Option<ObjectType>,
        // pub owner: Option<Owner>,
        // pub previous_transaction: Option<TransactionDigest>,
        // pub storage_rebate: Option<u64>,
        // pub display: Option<DisplayFieldsResponse>,
        // pub content: Option<SuiParsedData>,
        // pub bcs: Option<SuiRawData>,

        let sui_object_data = object.clone().into_object().unwrap();
        println!("sui_object_data object_id: {:?}", sui_object_data.object_id);
        println!("sui_object_data version: {:?}", sui_object_data.version);
        println!("sui_object_data digest: {:?}", sui_object_data.digest);
        println!("sui_object_data type_: {:?}", sui_object_data.type_);
        println!("sui_object_data owner: {:?}", sui_object_data.owner);
        println!(
            "sui_object_data previous_transaction: {:?}",
            sui_object_data.previous_transaction
        );
        println!(
            "sui_object_data storage_rebate: {:?}",
            sui_object_data.storage_rebate
        );
        println!("sui_object_data display: {:?}", sui_object_data.display);
        println!("sui_object_data content: {:?}", sui_object_data.content);
        println!("sui_object_data bcs: {:?}", sui_object_data.bcs);

        let object: Object = sui_object_data.try_into().unwrap();
        println!("object: {:?}", object);
        println!("object inner: {:?}", object.into_inner());

        let mut map = serde_json::Map::new();

        map.insert(
            "account".to_string(),
            serde_json::Value::String(
                "090035fe80abad17e6f7dbfc933a5f73736043fed333d32250725275ef63d7b6".to_string(),
            ),
        );
        map.insert("dapp_key".to_string(), serde_json::Value::String("090035fe80abad17e6f7dbfc933a5f73736043fed333d32250725275ef63d7b6::dapp_key::DappKey".to_string()));

        let parent_object_id = ObjectID::from_hex_literal(
            "0x7e3c82754d86a5d355ddd166c8bbed507ae17e7897f4e9b833d94873bb0c0af4",
        )
        .unwrap();
        let name = DynamicFieldName {    
            type_: sui_types::TypeTag::from_str("0x090035fe80abad17e6f7dbfc933a5f73736043fed333d32250725275ef63d7b6::dapp_service::AccountKey").unwrap(),
            value: serde_json::Value::Object(map.clone()), 
        };
        let dynamic_field_object = client
            .read_api()
            .get_dynamic_field_object(parent_object_id, name)
            .await
            .unwrap();
        println!("dynamic_field_object: {:?}", dynamic_field_object);

        //  let object_id = ObjectID::from_hex_literal("0x8a6af40acf216672afa3501bb67f77f29a0c66a026e4efd926b1a7a0a754714a").unwrap();
        // let dynamic_fields = client.read_api().get_dynamic_fields(object_id, None, Some(50)).await.unwrap();
        // for d in dynamic_fields.data {
        //     println!("d: {:?}", d);
        // }

        let table_name = b"asset_supply".to_vec();
        let key = vec![vec![
            179u8, 70, 160, 55, 249, 57, 93, 202, 125, 152, 53, 90, 23, 192, 160, 101, 40, 201, 94,
            119, 158, 118, 10, 220, 55, 200, 159, 158, 250, 139, 130, 10,
        ]];

        let mut value = vec![];
        value.push(table_name);
        value.extend(key);
        println!("value=============: {:?}", value);
        let parent_object_id = ObjectID::from_hex_literal(
            "0x8a6af40acf216672afa3501bb67f77f29a0c66a026e4efd926b1a7a0a754714a",
        )
        .unwrap();
        let name = DynamicFieldName {
            type_: sui_types::TypeTag::Vector(Box::new(sui_types::TypeTag::Vector(Box::new(
                sui_types::TypeTag::U8,
            )))),
            value: serde_json::Value::Array(
                value
                    .iter()
                    .map(|v| {
                        serde_json::Value::Array(
                            v.iter()
                                .map(|v| {
                                    serde_json::Value::Number(
                                        Number::from_u128(u128::from(*v)).unwrap(),
                                    )
                                })
                                .collect(),
                        )
                    })
                    .collect(),
            ),
        };
        let dynamic_field_object = client
            .read_api()
            .get_dynamic_field_object(parent_object_id, name)
            .await
            .unwrap();
        println!(
            "dynamic_field_object=============: {:?}",
            dynamic_field_object
                .clone()
                .into_object()
                .unwrap()
                .content
                .unwrap()
                .try_into_move()
                .unwrap()
        );
        let parsed_move_object = dynamic_field_object
            .clone()
            .into_object()
            .unwrap()
            .content
            .unwrap()
            .try_into_move()
            .unwrap();
        let parsed_move_object_value = parsed_move_object.fields.field_value("value").unwrap();
        // println!("parsed_move_object_value=============: {:?}", parsed_move_object_value.to_json_value());
        let result: Vec<Vec<u8>> = serde_json::from_str(
            parsed_move_object_value
                .to_json_value()
                .to_string()
                .as_str(),
        )
        .unwrap();
        println!("result=============: {:?}", result);
    }

    #[test]
    fn test_type_tag() {
        // Number(102), Number(102), Number(97), Number(101), Number(55), Number(57),
        // Number(49), Number(99), Number(51), Number(98), Number(48), Number(54),
        // Number(51), Number(99), Number(54), Number(50), Number(51), Number(102),
        // Number(53), Number(48), Number(55), Number(100), Number(49), Number(51),
        // Number(51), Number(57), Number(98), Number(97), Number(56), Number(101),
        // Number(49), Number(53), Number(55), Number(57), Number(54), Number(100),
        // Number(99), Number(54), Number(50), Number(102), Number(48), Number(100),
        // Number(52), Number(50), Number(55), Number(54), Number(53), Number(99), Number(102),
        // Number(97), Number(97), Number(50), Number(50), Number(49), Number(99), Number(54),
        // Number(52), Number(53), Number(97), Number(51), Number(52), Number(97), Number(97), Number(52)
        let str = b"ffae791c3b063c623f507d1339ba8e15796dc62f0d42765cfaa221c645a34aa4";
        let table_name = b"";
        let mut dapp_key = dapp_data_key_serde_value(str, table_name);
        println!("dapp_key: {:?}", dapp_key);

        let bcs_bytes = vec![
            122, 52, 104, 228, 226, 2, 39, 189, 214, 224, 246, 5, 221, 215, 46, 4, 107, 221, 109,
            53, 181, 40, 93, 172, 239, 55, 223, 185, 158, 17, 143, 103, 71, 53, 49, 54, 53, 97, 97,
            97, 54, 56, 54, 56, 52, 51, 52, 57, 54, 50, 53, 51, 53, 52, 48, 53, 102, 101, 100, 48,
            54, 99, 49, 97, 98, 51, 50, 99, 52, 48, 101, 49, 57, 99, 100, 52, 48, 97, 53, 102, 97,
            57, 55, 48, 97, 53, 52, 48, 54, 50, 99, 97, 52, 101, 56, 48, 53, 98, 97, 108, 97, 110,
            99, 101, 0, 0, 100, 167, 179, 182, 224, 13, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 116, 101, 115, 116,
        ];
        let hex_string = hex::encode(&bcs_bytes);
        println!("hex_string: {:?}", hex_string);
        let balance: Balance = bcs::from_bytes(&bcs_bytes).unwrap();
        println!("balance: {:?}", balance);
    }

    #[tokio::test]
    async fn test_extract_value_from_sui_object_response() {
        let client = SuiClientBuilder::default().build_localnet().await.unwrap();

        // 使用用户提供的 object_id
        let object_id = ObjectID::from_hex_literal(
            "0x7a3468e4e20227bdd6e0f605ddd72e046bdd6d35b5285dacef37dfb99e118f67",
        )
        .unwrap();

        let object = client
            .read_api()
            .get_object_with_options(
                object_id,
                SuiObjectDataOptions {
                    show_type: false,
                    show_owner: true,
                    show_previous_transaction: true,
                    show_display: false,
                    show_content: true,
                    show_bcs: true,
                    show_storage_rebate: true,
                },
            )
            .await
            .unwrap();

        println!("完整对象信息: {:?}", object);

        let s = object.clone().into_object().unwrap();
        let s_o: Object = s.try_into().unwrap();
        println!("s: {:?}", s_o);

        // 提取 value 信息
        match extract_value_from_sui_object_response(&object) {
            Ok(value_json) => {
                println!("\n提取的 value 信息:");
                println!("{}", serde_json::to_string_pretty(&value_json).unwrap());
            }
            Err(e) => {
                println!("提取失败: {}", e);
            }
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn test_mock_ptb_shared() {
        let client = SuiClientBuilder::default().build_localnet().await.unwrap();
        let dubhedb = DubheDB::new(client);
        let wrapped_dubhedb = WrapDatabaseAsync::new(dubhedb).unwrap();
        let mut cache_db = CacheDB::new(wrapped_dubhedb);

        let sender = SuiAddress::from_str(
            "0xffae791c3b063c623f507d1339ba8e15796dc62f0d42765cfaa221c645a34aa4",
        )
        .unwrap();
        let package = ObjectID::from_hex_literal(
            "0xe478b4710f0a3bc4654613150d60adf3a4b92d60ab76459671d2ceb23f264a33",
        )
        .unwrap();
        let dapp_hub = ObjectID::from_hex_literal(
            "0x5e4a6e0d451ecddcc17a59e46ef2d2bf541049b5615019182523f44d08dbfcbe",
        )
        .unwrap();
        let module = "assets_functions".to_string();
        let function = "do_mint".to_string();
        let arguments = vec![
            bcs::to_bytes(
                &SuiAddress::from_str(
                    "0xb346a037f9395dca7d98355a17c0a06528c95e779e760adc37c89f9efa8b820a",
                )
                .unwrap(),
            )
            .unwrap(),
            bcs::to_bytes(
                &"ffae791c3b063c623f507d1339ba8e15796dc62f0d42765cfaa221c645a34aa4".to_string(),
            )
            .unwrap(),
            bcs::to_bytes(&U256::from(100u128)).unwrap(),
        ];
        mock_ptb_shared(
            sender,
            package,
            dapp_hub,
            module,
            function,
            arguments,
            &mut cache_db,
        )
        .await;

        println!("objects in cache ===================================");

        cache_db
            .cache
            .read()
            .unwrap()
            .objects
            .iter()
            .for_each(|(id, object)| {
                println!("id: {:?}", id);
                println!("object: {:?}", object.as_inner().version());
                println!("object: {:?}", object.as_inner().owner);
                println!("object: {:?}", object.as_inner().type_());
            });

        // let sender = SuiAddress::from_str("0xffae791c3b063c623f507d1339ba8e15796dc62f0d42765cfaa221c645a34aa4").unwrap();
        // let package = ObjectID::from_hex_literal("0xb1ddddf3bfa65d1654e3533761466c6b02df647f92327b3c7adb4e41c54c5847").unwrap();
        // let dapp_hub = ObjectID::from_hex_literal("0xf5bde459c7b6b288d69c62f7e97a428f3114b057dcaddcabb241d73e55d3ae3a").unwrap();
        // let module = "assets_functions".to_string();
        // let function = "do_mint".to_string();
        // let arguments = vec![
        //     bcs::to_bytes(&SuiAddress::from_str("0xb346a037f9395dca7d98355a17c0a06528c95e779e760adc37c89f9efa8b820a").unwrap()).unwrap(),
        //     bcs::to_bytes(&"cdD077770ceb5271e42289Ee1A9b3a19442F445d000000000000000000000000".to_string()).unwrap(),
        //     bcs::to_bytes(&U256::from(100u128)).unwrap(),
        // ];
        // mock_ptb_shared(sender, package, dapp_hub, module, function, arguments, &mut cache_db).await;

        // println!("objects in cache ===================================");

        // cache_db.cache.read().unwrap().objects.iter().for_each( |(id, object)| {
        //     println!("id: {:?}", id);
        //     println!("object: {:?}", object.as_inner().version());
        //     println!("object: {:?}", object.as_inner().owner);
        //     println!("object: {:?}", object.as_inner().type_());
        // });

        //     let module = "assets_functions".to_string();
        //     let function = "do_transfer".to_string();
        //     let arguments = vec![
        //         bcs::to_bytes(&SuiAddress::from_str("0xb346a037f9395dca7d98355a17c0a06528c95e779e760adc37c89f9efa8b820a").unwrap()).unwrap(),
        //         bcs::to_bytes(&"ffae791c3b063c623f507d1339ba8e15796dc62f0d42765cfaa221c645a34aa4".to_string()).unwrap(),
        //         bcs::to_bytes(&"cdD077770ceb5271e42289Ee1A9b3a19442F445d000000000000000000000000".to_string()).unwrap(),
        //         bcs::to_bytes(&U256::from(20u128)).unwrap(),
        //     ];
        //     mock_ptb_shared(sender, package, dapp_hub, module, function, arguments, &mut cache_db).await;

        //     println!("objects in cache ===================================");

        // cache_db.cache.read().unwrap().objects.iter().for_each( |(id, object)| {
        //         if is_dynamic_field(object, Some("AssetAccount")) {
        //             let asset_account: AssetAccount = bcs::from_bytes(object.data.try_as_move().unwrap().contents()).unwrap();
        //             println!("asset_account: {:?}", asset_account);
        //         } else if is_dynamic_field(object, Some("AssetSupply")) {
        //         let asset_supply: AssetSupply = bcs::from_bytes(object.data.try_as_move().unwrap().contents()).unwrap();
        //         println!("asset_supply: {:?}", asset_supply);
        //     }
        // });
    }
}
