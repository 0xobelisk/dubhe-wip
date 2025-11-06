use anyhow;
use std::cell::RefCell;
use std::time::{SystemTime, UNIX_EPOCH};
use std::rc::Rc;
use std::sync::Arc;
use std::collections::HashSet;
use sui_adapter_latest::execution_engine::execute_transaction_to_effects;
use sui_adapter_latest::execution_mode::Normal;
use sui_adapter_latest::execution_mode::DevInspect;
use sui_adapter_latest::adapter::new_move_vm;
use sui_types::gas::SuiGasStatus;
use sui_move_natives_latest::all_natives;
use sui_protocol_config::ProtocolConfig;
use sui_types::base_types::{SuiAddress, TransactionDigest, TxContext};
use sui_types::committee::EpochId;
use sui_types::metrics::LimitsMetrics;
use sui_types::storage::{BackingPackageStore, ObjectStore};
use sui_types::transaction::{ProgrammableTransaction, CheckedInputObjects, GasData, TransactionKind};
use move_vm_runtime::move_vm::MoveVM;
use sui_types::transaction::{ObjectReadResult, ObjectReadResultKind, InputObjectKind};
use sui_types::object::Object;
use std::collections::BTreeMap;
use sui_types::base_types::ObjectID;
use sui_sdk::{SuiClient, SuiClientBuilder};
use sui_types::transaction::Argument;
use sui_types::transaction::ProgrammableMoveCall;
use sui_types::transaction::ObjectArg;
use sui_types::transaction::CallArg;
use sui_types::move_package::MovePackage;
use sui_move_build::CompiledPackage;
use sui_json_rpc_types::SuiObjectDataOptions;
use std::str::FromStr;
use sui_types::base_types::SequenceNumber;
use sui_json_rpc_types::SuiObjectData;
use sui_types::digests::ObjectDigest;
use sui_json_rpc_types::SuiRawMoveObject;
use move_core_types::language_storage::StructTag;
use sui_types::base_types::MoveObjectType;
use sui_types::base_types::MoveObjectType_::Other;
use sui_types::base_types::ObjectType::Struct;
use sui_types::object::Owner::Shared;
use sui_json_rpc_types::SuiRawData::MoveObject;
use sui_types::Identifier;
use dubhe_common::StoreSetRecord;
use dubhe_db::interface::DatabaseRef;
use sui_types::storage::{ChildObjectResolver, ParentSync};
use dubhe_db::interface::Database;

pub fn test_execute_single_ptb<DB: DatabaseRef + ObjectStore + BackingPackageStore + ChildObjectResolver + ParentSync>(
    ptb: &ProgrammableTransaction,
    db: &mut DB,
    sender: SuiAddress,
) -> anyhow::Result<(Vec<sui_types::event::Event>, u64, String)> {
    println!("      🔧 开始执行 PTB...");
    
    // 创建 Move VM
    let protocol_config = ProtocolConfig::get_for_max_version_UNSAFE();
    let vm = Arc::new(new_move_vm(all_natives(true, &protocol_config), &protocol_config)?);
    
    // 创建 gas status（无计量模式）
    let gas_status = SuiGasStatus::new(1000000000, 1, 0, &protocol_config).unwrap();
    
    // 创建 metrics
    let metrics = Arc::new(LimitsMetrics::new(&prometheus::Registry::new()));
    
    // 创建交易上下文相关
    // 创建一个随机交易摘要
    // 0x0300000000000000000000000000000000000000000000000000000000000000
    let tx_digest = TransactionDigest::new([0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    let epoch_id = EpochId::default();
    // 现在的毫秒时间戳
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
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
    let mut trace_builder_opt = None;
    
    // 执行 PTB
    println!("        🚀 调用 Sui PTB 执行引擎...");
    let (_temp_store, _final_gas_status, _effects, _timings, execution_result) = execute_transaction_to_effects::<DevInspect<true>>(
        db,                      // store: &dyn BackingStore
        input_objects,              // input_objects: CheckedInputObjects
        gas_data,                   // gas_data: GasData
        gas_status,                 // gas_status: SuiGasStatus
        transaction_kind,           // transaction_kind: TransactionKind
        sender,                     // transaction_signer: SuiAddress
        tx_digest,                  // transaction_digest: TransactionDigest
        &vm,                        // move_vm: &Arc<MoveVM>
        &epoch_id,                  // epoch_id: &EpochId
        epoch_timestamp_ms,         // epoch_timestamp_ms: u64
        &protocol_config,           // protocol_config: &ProtocolConfig
        metrics,                    // metrics: Arc<LimitsMetrics>
        false,                      // enable_expensive_checks: bool
        certificate_deny_set,      // certificate_deny_set: &HashSet<TransactionDigest>
        &mut trace_builder_opt,     // trace_builder_opt: &mut Option<MoveTraceBuilder>
    );
    
    match execution_result {
        Ok(_execution_results) => {
            println!("execution_result: {:?}", _execution_results.clone());
            println!("_effects: {:?}", _effects);
            println!("execution_result: {:?}", _temp_store.written);
            _temp_store.written.iter().for_each(|(id, object)| {
                println!("id: {:?}", id);
                println!("object: {:?}", object);
                // state.objects.insert(id.clone(), object.clone());
            });

            Ok((_temp_store.events.data, epoch_timestamp_ms, tx_digest.to_string()))
        }
        Err(e) => {
            println!("          ❌ PTB 执行失败: {}", e);
            Err(anyhow::anyhow!("PTB execution failed: {}", e))
        }
}
}


/// 执行单个 PTB
pub fn execute_single_ptb<DB: Database + DatabaseRef + ObjectStore + BackingPackageStore + ChildObjectResolver + ParentSync>(
    ptb: &ProgrammableTransaction,
    state: &mut DB,
    sender: SuiAddress,
    tx_digest: TransactionDigest,
) -> anyhow::Result<(Vec<sui_types::event::Event>, u64, String)> {
    println!("      🔧 开始执行 PTB...");
    
    // 创建 Move VM
    let protocol_config = ProtocolConfig::get_for_max_version_UNSAFE();
    let vm = Arc::new(new_move_vm(all_natives(true, &protocol_config), &protocol_config)?);
    
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
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
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
    let (_temp_store, _final_gas_status, _effects, _timings, execution_result) = execute_transaction_to_effects::<DevInspect<true>>(
        state,                      // store: &dyn BackingStore
        input_objects,              // input_objects: CheckedInputObjects
        gas_data,                   // gas_data: GasData
        gas_status,                 // gas_status: SuiGasStatus
        transaction_kind,           // transaction_kind: TransactionKind
        sender,                     // transaction_signer: SuiAddress
        tx_digest,                  // transaction_digest: TransactionDigest
        &vm,                        // move_vm: &Arc<MoveVM>
        &epoch_id,                  // epoch_id: &EpochId
        epoch_timestamp_ms,         // epoch_timestamp_ms: u64
        &protocol_config,           // protocol_config: &ProtocolConfig
        metrics,                    // metrics: Arc<LimitsMetrics>
        false,                      // enable_expensive_checks: bool
        certificate_deny_set,      // certificate_deny_set: &HashSet<TransactionDigest>
        &mut trace_builder_opt,     // trace_builder_opt: &mut Option<MoveTraceBuilder>
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

            Ok((_temp_store.events.data, epoch_timestamp_ms, tx_digest.to_string()))
        }
        Err(e) => {
            println!("          ❌ PTB 执行失败: {}", e);
            Err(anyhow::anyhow!("PTB execution failed: {}", e))
        }
}
}

pub fn execute_single_ptb_with_store_set_record<DB: Database + DatabaseRef + ObjectStore + BackingPackageStore + ChildObjectResolver + ParentSync>(
    ptb: &ProgrammableTransaction,
    state: &mut DB,
    sender: SuiAddress,
    tx_digest: TransactionDigest,
) -> anyhow::Result<(Vec<dubhe_common::Event>, u64, String)> {
    let (events, current_checkpoint_timestamp_ms, current_digest) = execute_single_ptb(ptb, state, sender, tx_digest)?;
    // Only parse the StoreSetRecord event
    let mut store_set_records = Vec::new();
    events.iter().filter(|event| event.type_.name.to_string() == "Dubhe_Store_SetRecord").for_each(|event| {
        match bcs::from_bytes::<StoreSetRecord>(event.contents.as_slice()) {
            Ok(record) => {
                store_set_records.push(dubhe_common::Event::StoreSetRecord(record.clone()));
            },
            Err(e) => { }
        }
    });
    Ok((store_set_records, current_checkpoint_timestamp_ms, current_digest))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sui_types::transaction::Command;
    use dubhe_db::in_memory_db::CacheDB;
    use dubhe_db::interface::WrapDatabaseAsync;
    use dubhe_db::DubheDB;
    use dubhe_db::initialize_cache;
    use sui_types::dynamic_field::DynamicFieldName;


    // dubhe hub: 0x86c8925b708ecd5570d70f3ccbc30035f9fa65480b546a563afdc046da98d103
    // dubhe package: 0xa337791835d15223727ace33cce17ea0901c094c8cfbe34d089c1a18c2df7a15
    // dapp package: 0x76ae48d32307ff431edb92e4b89479828b59830e862848863ec6c58e121ed297
    // origin dapp package: 0x4c3f65fa8562679d00076350b51c1c3f2d966d83a4a6609a13f4fb04561d1140
    #[tokio::test(flavor = "multi_thread")] 
    async fn mock_ptb_shared() {
        let client = SuiClientBuilder::default().build_testnet().await.unwrap();
        let dubhedb = DubheDB::new(client);
        let wrapped_dubhedb = WrapDatabaseAsync::new(dubhedb).unwrap();
        let mut cache_db = CacheDB::new(wrapped_dubhedb);

        let client = SuiClientBuilder::default().build_testnet().await.unwrap();

        initialize_cache(
            &mut cache_db, 
            &client, 
            "0x86c8925b708ecd5570d70f3ccbc30035f9fa65480b546a563afdc046da98d103", 
            "0xa337791835d15223727ace33cce17ea0901c094c8cfbe34d089c1a18c2df7a15", 
            "0x4c3f65fa8562679d00076350b51c1c3f2d966d83a4a6609a13f4fb04561d1140"
        ).await;

        // cache hash map length
        println!("cache hash map length: {:?}", cache_db.cache.read().unwrap().sui_object_data.len());
    
        let object_id = ObjectID::from_hex_literal("0x86c8925b708ecd5570d70f3ccbc30035f9fa65480b546a563afdc046da98d103").unwrap();
            
        let object= cache_db.get_object(&object_id).unwrap();
        
        let ptb = ProgrammableTransaction {
            inputs: vec![
                CallArg::Object(ObjectArg::SharedObject {
                    id: object.id(),
                    initial_shared_version: object.owner.start_version().unwrap(),
                    mutable: true,
                }),
            ],
            commands: vec![Command::MoveCall(Box::new(ProgrammableMoveCall {
                package: ObjectID::from_hex_literal("0x76ae48d32307ff431edb92e4b89479828b59830e862848863ec6c58e121ed297").unwrap(),
                module: "counter_system".to_string(),
                function: "inc".to_string(),
                type_arguments: vec![],
                arguments: vec![sui_types::transaction::Argument::Input(0)],
            }))],
        };
        
        // let sender = SuiAddress::from_str("0x4b8e9e6510fb69201b63d9466c5e382dde2073a6eaf9e3b70f4b82d000a8bc25").unwrap();
        let sender = SuiAddress::from_str("0xcdD077770ceb5271e42289Ee1A9b3a19442F445d000000000000000000000000").unwrap();

        test_execute_single_ptb(&ptb, &mut cache_db, sender);
    }


     // dubhe hub: 0x86c8925b708ecd5570d70f3ccbc30035f9fa65480b546a563afdc046da98d103
    // dubhe package: 0xa337791835d15223727ace33cce17ea0901c094c8cfbe34d089c1a18c2df7a15
    // dapp package: 0x76ae48d32307ff431edb92e4b89479828b59830e862848863ec6c58e121ed297
    // origin dapp package: 0x4c3f65fa8562679d00076350b51c1c3f2d966d83a4a6609a13f4fb04561d1140
    #[tokio::test(flavor = "multi_thread")] 
    async fn get_object() {
        let client = SuiClientBuilder::default().build_testnet().await.unwrap();
        //  let object_id = ObjectID::from_hex_literal("0xbbcb61717ff71335de46b2ec09191e6745cffa3ea899d8ebc99479e8a8401ef7").unwrap();
        //  let object = client.read_api().get_object_with_options(object_id, sui_json_rpc_types::SuiObjectDataOptions {
        //     show_type: true,
        //     show_owner: true,
        //     show_previous_transaction: true,
        //     show_display: true,
        //     show_content: true,
        //     show_bcs: true,
        //     show_storage_rebate: true,
        //  }).await.unwrap();
        //  println!("object: {:?}", object);


         let parent_object_id = ObjectID::from_hex_literal("0xbff7fd170a230d40828e68511a1507cc82052d42d056d02c2370430899bb9864").unwrap();
         let name = DynamicFieldName {    
            type_: sui_types::TypeTag::from_str("0x0000000000000000000000000000000000000000000000000000000000000001::ascii::String").unwrap(),
            value: serde_json::Value::String("4c3f65fa8562679d00076350b51c1c3f2d966d83a4a6609a13f4fb04561d1140::dapp_key::DappKey".to_string()), 
        };
         let dynamic_field_object = client.read_api().get_dynamic_field_object(parent_object_id, name).await.unwrap();
         println!("dynamic_field_object: {:?}", dynamic_field_object);
    }
}
