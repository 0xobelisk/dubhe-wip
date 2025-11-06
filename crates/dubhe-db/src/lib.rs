pub mod interface;
pub mod in_memory_db;

pub use in_memory_db::*;
pub use interface::*;

use sui_sdk::SuiClient;
use sui_sdk::error::Error as SuiSdkError;
use sui_sdk::apis::ReadApi;
use sui_json_rpc_types::SuiObjectDataOptions;
use sui_json_rpc_types::SuiObjectData;
use sui_json_rpc_types::SuiParsedData;
use sui_json_rpc_types::SuiMoveStruct;
use sui_json_rpc_types::SuiMovePackage;
use sui_json_rpc_types::SuiParsedMoveObject;
use sui_json_rpc_types::SuiMoveValue;
use crate::interface::DatabaseAsyncRef;
use core::error::Error;
use core::fmt::Display;
use crate::interface::DBErrorMarker;
use sui_sdk::SuiClientBuilder;
use sui_types::base_types::ObjectID;
use sui_types::TypeTag;
use sui_types::dynamic_field::DynamicFieldName;
use serde_json::Value;
use std::{primitive, str::FromStr};


/// Error type for transport-related database operations.
#[derive(Debug)]
pub struct DBTransportError(pub SuiSdkError);

impl DBErrorMarker for DBTransportError {}

impl Display for DBTransportError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "Transport error: {}", self.0)
    }
}

impl Error for DBTransportError {}

impl From<SuiSdkError> for DBTransportError {
    fn from(e: SuiSdkError) -> Self {
        Self(e)
    }
}

/// An alloy-powered REVM [Database][database_interface::Database].
///
/// When accessing the database, it'll use the given provider to fetch the corresponding account's data.
#[derive(Clone)]
pub struct DubheDB {
    /// The provider to fetch the data from.
    provider: SuiClient,
}


impl DubheDB {
    pub fn new(provider: SuiClient) -> Self {
        Self { provider }
    }
}


impl DatabaseAsyncRef for DubheDB {
    type Error = DBTransportError;

    async fn object_async_ref(
            &self,
            address: sui_types::base_types::ObjectID,
        ) -> Result<Option<sui_types::object::Object>, Self::Error> {
            let sui_object_response = self.provider.read_api().get_object_with_options(address, sui_json_rpc_types::SuiObjectDataOptions {
                show_type: true,
                show_owner: true,
                show_previous_transaction: true,
                show_display: true,
                show_content: true,
                show_bcs: true,
                show_storage_rebate: true,
            }).await?;
            println!("sui_object_response: {:?}", sui_object_response);
            let sui_object_data = sui_object_response.into_object().map_err(|e| DBTransportError(SuiSdkError::DataError(e.to_string())))?;
            let object: sui_types::object::Object = sui_object_data.try_into().map_err(|e| DBTransportError(SuiSdkError::DataError(format!("Failed to convert SuiObjectData to Object: {:?}", e))))?;
            Ok(Some(object))
    }
}

pub fn get_field_id(sui_object_data: &SuiObjectData, field_name: &str) -> Option<ObjectID> {
    let sui_parsed_object = sui_object_data.content.clone().unwrap();
    if let SuiParsedData::MoveObject(SuiParsedMoveObject { fields, .. }) = sui_parsed_object {
        if let SuiMoveValue::Struct(fields) = fields.field_value(field_name).unwrap() {
            if let SuiMoveValue::UID { id } =  fields.field_value("id").unwrap() {
                return Some(id);
            }
        }
    }
    None
}

pub fn get_dapp_key_str(package_id: &str) -> String {
    // 0x86c8925b708ecd5570d70f3ccbc30035f9fa65480b546a563afdc046da98d103
    // ====> 86c8925b708ecd5570d70f3ccbc30035f9fa65480b546a563afdc046da98d103::dapp_key::DappKey
    format!("{}::dapp_key::DappKey", package_id.strip_prefix("0x").unwrap())
}

pub async fn initialize_cache<ExtDB: DatabaseRef>(
    cache_db: &mut CacheDB<ExtDB>, 
    client: &SuiClient, 
    dubhe_hub_id: &str, 
    orogin_dubhe_package_id: &str, 
    origin_package_id: &str
) {
    use std::collections::HashSet;
    
    let options = sui_json_rpc_types::SuiObjectDataOptions {
        show_type: true,
        show_owner: true,
        show_previous_transaction: true,
        show_display: true,
        show_content: true,
        show_bcs: true,
        show_storage_rebate: true,
    };

    println!("🚀 Step 1: Fetching Dubhe Hub object...");
    // Step 1: 获取 dubhe_hub 对象
    let hub_id = ObjectID::from_hex_literal(dubhe_hub_id).unwrap();
    let hub_response = client.read_api().get_object_with_options(hub_id, options.clone()).await.unwrap();
    let hub_data = hub_response.into_object().unwrap();
    let dapp_stores_field_id = get_field_id(&hub_data, "dapp_stores").unwrap();
    let hub_object: sui_types::object::Object = hub_data.try_into().unwrap();
    let _ = cache_db.insert_object(hub_object);
    println!("✅ Dubhe Hub cached, dapp_stores_field_id: {}", dapp_stores_field_id);

    println!("\n🚀 Step 2: Fetching dapp stores list...");
    // Step 2: 获取 dapp_stores 的动态字段列表（只调用一次）
    let dapp_stores_page = client.read_api()
        .get_dynamic_fields(dapp_stores_field_id, None, Some(50))
        .await.unwrap();
    
    // 找到两个需要的 dapp_store
    let origin_dapp_store_info = dapp_stores_page.data.iter()
        .find(|info| info.name.value.to_string().contains(&get_dapp_key_str(origin_package_id)))
        .unwrap();
    let dubhe_dapp_store_info = dapp_stores_page.data.iter()
        .find(|info| info.name.value.to_string().contains(&get_dapp_key_str(orogin_dubhe_package_id)))
        .unwrap();
    
    println!("✅ Found {} dapp stores", dapp_stores_page.data.len());
    println!("  - Origin dapp store: {}", origin_dapp_store_info.object_id);
    println!("  - Dubhe dapp store: {}", dubhe_dapp_store_info.object_id);

    println!("\n🚀 Step 3: Batch fetching 2 dapp store objects...");
    // Step 3: 批量获取两个 dapp_store 对象
    let dapp_store_ids = vec![origin_dapp_store_info.object_id, dubhe_dapp_store_info.object_id];
    let dapp_stores = client.read_api()
        .multi_get_object_with_options(dapp_store_ids.clone(), options.clone())
        .await.unwrap();
    
    let mut tables_field_ids = Vec::new();
    for store_response in dapp_stores {
        let store_data = store_response.into_object().unwrap();
        let tables_id = get_field_id(&store_data, "tables").unwrap();
        tables_field_ids.push(tables_id);
        let store_object: sui_types::object::Object = store_data.try_into().unwrap();
        let _ = cache_db.insert_object(store_object);
    }
    println!("✅ Cached 2 dapp store objects");
    println!("  - Origin tables field: {}", tables_field_ids[0]);
    println!("  - Dubhe tables field: {}", tables_field_ids[1]);

    println!("\n🚀 Step 4: Fetching dynamic fields for all tables...");
    // Step 4: 获取两个 tables 的动态字段列表
    let origin_tables_page = client.read_api()
        .get_dynamic_fields(tables_field_ids[0], None, Some(50))
        .await.unwrap();
    let dubhe_tables_page = client.read_api()
        .get_dynamic_fields(tables_field_ids[1], None, Some(50))
        .await.unwrap();
    
    println!("✅ Origin package has {} tables", origin_tables_page.data.len());
    println!("✅ Dubhe package has {} tables", dubhe_tables_page.data.len());

    println!("\n🚀 Step 5: Batch fetching all table objects...");
    // Step 5: 收集所有 table 对象的 ID
    let mut all_table_ids = Vec::new();
    all_table_ids.extend(origin_tables_page.data.iter().map(|info| info.object_id));
    
    // 只处理 dubhe 包的 dapp_fee_state 表
    if let Some(fee_state_info) = dubhe_tables_page.data.iter()
        .find(|info| info.name.value.to_string() == "\"dapp_fee_state\"") 
    {
        all_table_ids.push(fee_state_info.object_id);
        println!("  - Including dapp_fee_state table");
    }
    
    // 批量获取所有 table 对象
    let table_objects = client.read_api()
        .multi_get_object_with_options(all_table_ids.clone(), options.clone())
        .await.unwrap();
    
    let mut table_value_ids = Vec::new();
    for table_response in table_objects {
        let table_data = table_response.into_object().unwrap();
        if let Some(value_id) = get_field_id(&table_data, "value") {
            table_value_ids.push(value_id);
        }
        let table_object: sui_types::object::Object = table_data.try_into().unwrap();
        let _ = cache_db.insert_object(table_object);
    }
    println!("✅ Cached {} table objects", all_table_ids.len());

    println!("\n🚀 Step 6: Fetching all table records...");
    // Step 6: 获取所有 table 的动态字段列表并收集记录 ID
    let mut all_record_ids = HashSet::new();
    for table_id in &table_value_ids {
        let records_page = client.read_api()
            .get_dynamic_fields(*table_id, None, Some(50))
            .await.unwrap();
        
        for record_info in records_page.data {
            all_record_ids.insert(record_info.object_id);
        }
    }
    
    println!("✅ Found {} total records across all tables", all_record_ids.len());

    println!("\n🚀 Step 7: Batch fetching all record objects...");
    // Step 7: 批量获取所有记录对象（分批，每次最多50个）
    let record_ids: Vec<_> = all_record_ids.into_iter().collect();
    let mut total_cached = 0;
    
    for chunk in record_ids.chunks(50) {
        let records = client.read_api()
            .multi_get_object_with_options(chunk.to_vec(), options.clone())
            .await.unwrap();
        
        for record_response in records {
            if let Ok(record_data) = record_response.into_object() {
                let record_object: sui_types::object::Object = record_data.try_into().unwrap();
                let _ = cache_db.insert_object(record_object);
                total_cached += 1;
            }
        }
    }
    
    println!("✅ Cached {} record objects", total_cached);
    println!("\n🎉 Cache initialization complete!");
    println!("📊 Total objects in cache: {}", cache_db.cache.read().unwrap().objects.len());
}

#[cfg(test)]
mod tests {
    use super::*;


    // dubhe hub: 0x86c8925b708ecd5570d70f3ccbc30035f9fa65480b546a563afdc046da98d103
    // dubhe package: 0xa337791835d15223727ace33cce17ea0901c094c8cfbe34d089c1a18c2df7a15
    // dapp package: 0x76ae48d32307ff431edb92e4b89479828b59830e862848863ec6c58e121ed297
    // origin dapp package: 0x4c3f65fa8562679d00076350b51c1c3f2d966d83a4a6609a13f4fb04561d1140
    #[tokio::test(flavor = "multi_thread")] 
    async fn can_get_object() {
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
    
      //   let dubhedb = DubheDB::new(client);
      //   let wrapped_dubhedb = WrapDatabaseAsync::new(dubhedb).unwrap();

      //   let object_id = ObjectID::from_hex_literal("0x86c8925b708ecd5570d70f3ccbc30035f9fa65480b546a563afdc046da98d103").unwrap();
      //   let object_data = wrapped_dubhedb.object_ref(object_id).unwrap().unwrap();
      // //   assert!(object_data.is_some());
      //   println!("object_data: {:?}", object_data);
    }
}
