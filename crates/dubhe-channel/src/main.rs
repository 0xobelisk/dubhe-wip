// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::{Result, anyhow};
use dubhe_common::Database;
use dubhe_common::DubheConfig;
use dubhe_common::{Event, StoreSetRecord};
use dubhe_db::{DubheDB, initialize_cache};
use dubhe_db::{CacheDB, WrapDatabaseAsync};
use dubhe_db::interface::Database as DBTrait;
use hyper::{Body, Request, Response, Server, StatusCode};
use hyper::service::{make_service_fn, service_fn};
use http::header::{CONTENT_TYPE, CACHE_CONTROL};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::str::FromStr;
use std::sync::Arc;
use std::path::PathBuf;
use std::convert::Infallible;
use sui_types::base_types::{ObjectID, SuiAddress};
use sui_types::transaction::{CallArg, Command, ObjectArg, ProgrammableTransaction, ProgrammableMoveCall, Argument, Transaction, TransactionData};
use sui_types::object::Object;
use tokio::sync::{RwLock, broadcast};
use tokio::time::{interval, Duration};
use bcs;
use sui_sdk::SuiClientBuilder;
use sui_sdk::rpc_types::SuiTransactionBlockResponseOptions;
use sui_sdk::types::{
    programmable_transaction_builder::ProgrammableTransactionBuilder,
    quorum_driver_types::ExecuteTransactionRequestType,
    Identifier, TypeTag
};
use sui_json_rpc_types::SuiObjectDataOptions;
use shared_crypto::intent::Intent;
use sui_types::crypto::SuiKeyPair;
use sui_keys::keystore::{AccountKeystore, FileBasedKeystore, InMemKeystore};
use clap::Parser;
use sui_types::base_types::TransactionDigest;
use hyper::body;
use bytes::Buf;
use bs58;
use base64::{Engine as _, engine::general_purpose};
use std::fs;
use std::collections::HashMap;
use sui_types::dynamic_field::DynamicFieldName;
use serde_json::Number;
use sui_json_rpc_types::SuiData;

// Configuration struct
#[derive(Parser, Debug, Clone)]
#[command(author, version, about, long_about = None)]
struct DubheChannelConfig {
    #[arg(long, default_value = "5")]
    pub sync_time: u64,
    #[arg(long, default_value = "http://localhost:9000")]
    pub rpc_url: String,
    #[arg(long, default_value = "8080")]
    pub port: u16,
}

// Submit Request struct
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubmitRequest {
    pub chain: String,  // "sui" | "evm" | "solana"
    pub sender: String,
    #[serde(default)]
    pub nonce: Option<u64>,
    pub ptb: PtbJson,
    #[serde(default)]
    pub signature: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

// Get Table Request struct
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GetTableRequest {
    pub dapp_key: String,
    pub account: String,
    pub table: String,
    pub key: Vec<Vec<u8>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetTableResponse {
    pub message: bool,
    pub data: Vec<Vec<u8>>,
}

// Subscribe Table Request struct - supports optional fields for fuzzy matching
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubscribeTableRequest {
    #[serde(default)]
    pub dapp_key: Option<String>,
    #[serde(default)]
    pub account: Option<String>,
    #[serde(default)]
    pub table: Option<String>,
    #[serde(default)]
    pub key: Option<Vec<Vec<u8>>>,
}

// Subscribe Table Response - contains DataKey and value
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubscribeTableResponse {
    pub data_key: DataKey,
    pub value: Vec<Vec<u8>>,
}


#[derive(Debug, Eq, Hash, PartialEq, Clone, Serialize, Deserialize)]
pub struct DataKey {
    pub dapp_key: String,
    pub account: String,
    pub table: String,
    pub key: Vec<Vec<u8>>,
}

#[derive(Debug, Eq, Hash, PartialEq, Clone, Serialize, Deserialize)]
pub struct AccountKey {
    pub dapp_key: String,
    pub account: String,
}

// PTB JSON struct
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PtbJson {
    pub version: u32,
    #[serde(default)]
    pub sender: Option<String>,
    #[serde(default)]
    pub expiration: Option<serde_json::Value>,
    #[serde(default, rename = "gasData")]
    pub gas_data: Option<serde_json::Value>,
    pub inputs: Vec<PtbInput>,
    pub commands: Vec<PtbCommand>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "$kind")]
pub enum PtbInput {
    UnresolvedObject { 
        #[serde(flatten)]
        data: UnresolvedObjectData 
    },
    Pure { 
        #[serde(flatten)]
        data: PureData 
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UnresolvedObjectData {
    #[serde(rename = "UnresolvedObject")]
    pub unresolved_object: UnresolvedObjectInner,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UnresolvedObjectInner {
    #[serde(rename = "objectId")]
    pub object_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PureData {
    #[serde(rename = "Pure")]
    pub pure: PureInner,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PureInner {
    pub bytes: String,  // Base64 encoded
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "$kind")]
pub enum PtbCommand {
    MoveCall { 
        #[serde(flatten)]
        data: MoveCallData 
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MoveCallData {
    #[serde(rename = "MoveCall")]
    pub move_call: MoveCallInner,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MoveCallInner {
    pub package: String,
    pub module: String,
    pub function: String,
    #[serde(rename = "typeArguments")]
    pub type_arguments: Vec<String>,
    pub arguments: Vec<ArgumentJson>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "$kind")]
pub enum ArgumentJson {
    Input {
        #[serde(rename = "Input")]
        index: u16,
        #[serde(rename = "type")]
        arg_type: String,
    },
}

// Storage state with FIFO queue and deduplication by key
#[derive(Debug)]
struct StorageState {
    // HashMap for quick lookup and update
    map: std::collections::HashMap<Vec<Vec<u8>>, Vec<Vec<u8>>>,
    // VecDeque to maintain insertion order
    order: std::collections::VecDeque<Vec<Vec<u8>>>,
    counter: u64,
}

impl StorageState {
    fn new() -> Self {
        Self {
            map: std::collections::HashMap::new(),
            order: std::collections::VecDeque::new(),
            counter: 1,
        }
    }

    fn push(&mut self, key: Vec<Vec<u8>>, value: Vec<Vec<u8>>) {
        if self.map.contains_key(&key) {
            // Key already exists, just update the value
            self.map.insert(key, value);
            println!("🔄 Updated existing key in queue");
        } else {
            // New key, add to both map and order queue
            self.map.insert(key.clone(), value);
            self.order.push_back(key);
            println!("➕ Added new key to queue");
        }
        self.counter += 1;
    }

    fn pop_front(&mut self) -> Option<(Vec<Vec<u8>>, Vec<Vec<u8>>)> {
        // Get the oldest key from order queue
        if let Some(key) = self.order.pop_front() {
            // Get and remove the corresponding value from map
            if let Some(value) = self.map.remove(&key) {
                return Some((key, value));
            }
        }
        None
    }

    fn reset_counter(&mut self) {
        self.counter = 1;
    }

    fn len(&self) -> usize {
        self.order.len()
    }

    fn is_empty(&self) -> bool {
        self.order.is_empty()
    }
}

// Global application state
#[derive(Clone)]
struct AppState<DB> {
    config: Arc<DubheChannelConfig>,
    cache_db: Arc<RwLock<CacheDB<DB>>>,
    data: Arc<RwLock<HashMap<DataKey, Vec<Vec<u8>>>>>,
    temp_storage_state: Arc<RwLock<StorageState>>,
    // Subscription management: use broadcast channel to push matched data
    subscription_tx: broadcast::Sender<SubscribeTableResponse>,
    account_nonce: Arc<RwLock<HashMap<String, u64>>>,
    dapp_data: Arc<RwLock<HashMap<AccountKey, ObjectID>>>,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logger
    env_logger::init();

    dotenvy::dotenv().ok();
    println!("🌟 Dubhe Channel Starting (Standalone) 🌟");

    // Load configuration
    let config: DubheChannelConfig = DubheChannelConfig::parse();
    
    let temp_storage_state = Arc::new(RwLock::new(StorageState::new()));
    
    // Create CacheDB
    println!("🔄 Initializing CacheDB...");
    let client = SuiClientBuilder::default().build(&config.rpc_url).await?;
    let dubhedb = DubheDB::new(client.clone());
    let wrapped_dubhedb = WrapDatabaseAsync::new(dubhedb)
        .ok_or_else(|| anyhow::anyhow!("Failed to create WrapDatabaseAsync"))?;
    let cache_db = CacheDB::new(wrapped_dubhedb);
    
    let cache_db = Arc::new(RwLock::new(cache_db));
    println!("✅ CacheDB initialization complete");

    // Create subscription broadcast channel
    let (subscription_tx, _) = broadcast::channel::<SubscribeTableResponse>(1000);
    
    let app_state = AppState {
        config: Arc::new(config.clone()),
        cache_db: cache_db.clone(),
        data: Arc::new(RwLock::new(HashMap::new())),
        temp_storage_state: temp_storage_state.clone(),
        subscription_tx: subscription_tx.clone(),
        account_nonce: Arc::new(RwLock::new(HashMap::new())),
        dapp_data: Arc::new(RwLock::new(HashMap::new())),
    };

    // Start periodic storage queue monitoring task (FIFO - one at a time)
    let temp_storage_state_monitor = temp_storage_state.clone();
    let sync_time = config.sync_time;
    
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(sync_time));
        loop {
            interval.tick().await;
            let mut storage_state = temp_storage_state_monitor.write().await;
            
            // println!("\n📦 ========== Storage Queue Monitor ==========");
            // println!("⏰ Time: {:?}", std::time::SystemTime::now());
            // println!("📊 Queue length: {}", storage_state.len());
            // println!("🔢 Total processed counter: {}", storage_state.counter);
            
            if storage_state.is_empty() {
                // println!("✨ Queue is empty, waiting for next cycle...");
            } else {
                // Pop only the first (oldest) element from the queue
                if let Some((key, value)) = storage_state.pop_front() {
                    let counter = storage_state.counter;
                    let remaining = storage_state.len();
                    
                    println!("📝 Processing oldest entry from queue:");
                    println!("  🔑 Key: {:?}", key);
                    println!("  📄 Value: {:?}", value);
                    println!("  🔢 Current counter: {}", counter);
                    println!("  📊 Remaining in queue: {}", remaining);
                    
                    // Release the lock before executing set_storage
                    drop(storage_state);
                    
                    // Execute set_storage for this key-value pair
                    // match set_storage(&config_monitor, key.clone(), value.clone(), &dubhe_config_monitor, counter).await {
                    //     Ok(_) => {
                    //         println!("  ✅ Successfully executed set_storage");
                            
                    //         // Reset counter after successful transaction
                    //         let mut storage_state = temp_storage_state_monitor.write().await;
                    //         storage_state.reset_counter();
                    //         println!("  🔄 Counter reset to 1");
                    //     },
                    //     Err(e) => {
                    //         println!("  ❌ Failed to execute set_storage: {}", e);
                    //     }
                    // }
                } else {
                    println!("⚠️  Queue was empty when trying to pop");
                }
            }
            
            // println!("📦 ==========================================\n");
        }
    });

    // Start HTTP Server
    let addr = ([0, 0, 0, 0], config.port).into();
    let make_svc = make_service_fn(move |_conn| {
        let app_state = app_state.clone();
        async move {
            Ok::<_, Infallible>(service_fn(move |req| {
                handle_request(req, app_state.clone())
            }))
        }
    });

    println!("🚀 Dubhe Channel Server running on http://{}", addr);
    println!("🔗 http://localhost:8080/submit");
    println!("🔗 http://localhost:8080/subscribe_table");
    println!("🔗 http://localhost:8080/get_table");

    let server = Server::bind(&addr).serve(make_svc);

    if let Err(e) = server.await {
        eprintln!("server error: {}", e);
    }

    Ok(())
}

async fn handle_request<DB>(req: Request<Body>, state: AppState<DB>) -> Result<Response<Body>, Infallible> 
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static
{
    // Handle CORS preflight
            if req.method() == hyper::Method::OPTIONS {
                return Ok(Response::builder()
                    .status(StatusCode::OK)
                    .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            .header("Access-Control-Allow-Headers", "*")
                    .body(Body::empty())
                    .unwrap());
            }
            
    let path = req.uri().path();
    match (req.method(), path) {
        (&hyper::Method::POST, "/submit") => {
            Ok(handle_submit(req, state).await)
        },
        (&hyper::Method::POST, "/get_table") => {
             Ok(handle_get_table(req, state).await)
        },
        (&hyper::Method::POST, "/subscribe_table") => {
            Ok(handle_subscribe_table(req, state).await)
        },
        _ => {
            Ok(Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("Not Found"))
                .unwrap())
        }
    }
}

async fn handle_submit<DB>(req: Request<Body>, state: AppState<DB>) -> Response<Body>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static
{
    println!("🔍 Processing /submit request");
            
            // Read body
            let whole_body = match body::aggregate(req.into_body()).await {
                Ok(body) => body,
                Err(e) => {
            return Response::builder()
                        .status(StatusCode::BAD_REQUEST)
                        .header(CONTENT_TYPE, "application/json")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Body::from(json!({
                            "success": false,
                            "message": format!("Failed to read body: {}", e),
                            "data": null
                        }).to_string()))
                .unwrap();
                }
            };
            
            // Parse JSON
            let submit_request: Result<SubmitRequest, _> = serde_json::from_reader(whole_body.reader());
            
            match submit_request {
                Ok(req_data) => {
                    println!("✅ Received submit request:");
                    println!("  Chain: {}", req_data.chain);
                    println!("  Sender: {}", req_data.sender);
                    println!("  Nonce: {:?}", req_data.nonce);
                    println!("  PTB inputs: {}, commands: {}", req_data.ptb.inputs.len(), req_data.ptb.commands.len());
                    println!("  Signature: {:?}", req_data.signature);
                    
                    let sender = match req_data.chain.as_str() {
                        "sui" => SuiAddress::from_str(&req_data.sender).unwrap(),
                        "evm" => evm_to_sui(&req_data.sender).unwrap(),
                        "solana" => solana_to_sui(&req_data.sender).unwrap(),
                        _ => panic!("Invalid chain: {}", req_data.chain),
                    };

                    // Validate and update nonce
                    // Nonce must start from 1 and increment sequentially for each account
                    let account_key = req_data.sender.clone();
                    
                    // Get current nonce for this account (0 if account doesn't exist)
                    let current_nonce = {
                        let nonce_map = state.account_nonce.read().await;
                        nonce_map.get(&account_key).copied().unwrap_or(0)
                    };
                    
                    // Expected nonce is current_nonce + 1
                    let expected_nonce = current_nonce + 1;
                    
                    // Nonce is required and must match expected value
                    match req_data.nonce {
                        Some(submitted_nonce) => {
                            if submitted_nonce != expected_nonce {
                                println!("❌ Invalid nonce for account {}: expected {}, got {}", account_key, expected_nonce, submitted_nonce);
                                return Response::builder()
                                    .status(StatusCode::BAD_REQUEST)
                                    .header(CONTENT_TYPE, "application/json")
                                    .header("Access-Control-Allow-Origin", "*")
                                    .body(Body::from(json!({
                                        "success": false,
                                        "message": format!("Invalid nonce: expected {}, got {}", expected_nonce, submitted_nonce),
                                        "data": null
                                    }).to_string()))
                                    .unwrap();
                            }
                        },
                        None => {
                            // Nonce is required
                            println!("❌ Nonce is required for account {}: expected {}", account_key, expected_nonce);
                            return Response::builder()
                                .status(StatusCode::BAD_REQUEST)
                                .header(CONTENT_TYPE, "application/json")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(Body::from(json!({
                                    "success": false,
                                    "message": format!("Nonce is required: expected {}", expected_nonce),
                                    "data": null
                                }).to_string()))
                                .unwrap();
                        }
                    }
                    
                    // Update nonce after validation passes
                    {
                        let mut nonce_map = state.account_nonce.write().await;
                        nonce_map.insert(account_key.clone(), expected_nonce);
                        println!("✅ Updated nonce for account {} to {}", account_key, expected_nonce);
                    }

                    let tx_digest = get_tx_digest_by_chain(req_data.chain.clone());

                    // Build PTB
            let ptb = match convert_ptb_json_to_transaction(&req_data.ptb, &state.cache_db).await {
                        Ok(ptb) => ptb,
                        Err(e) => {
                            println!("❌ Failed to convert PTB: {}", e);
                    return Response::builder()
                                .status(StatusCode::BAD_REQUEST)
                                .header(CONTENT_TYPE, "application/json")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(Body::from(json!({
                                    "success": false,
                                    "message": format!("Failed to convert PTB: {}", e),
                                    "data": null
                                }).to_string()))
                        .unwrap();
                        }
                    };
                    
                    // Execute PTB
                    println!("🔄 Executing PTB transaction...");
            let value: Result<Vec<Vec<u8>>, anyhow::Error> = Ok(vec![]);
            let value = {
                let mut cache_db_guard = state.cache_db.write().await;
                mock_ptb_shared_sync(
                    &state.config, 
                    &ptb, 
                    &mut *cache_db_guard, 
                    sender, 
                    tx_digest, 
                    &state.temp_storage_state,
                    &state
                ).await
            };
                    
                    match value {
                        Ok(sqls) => {
                    Response::builder()
                                .status(StatusCode::OK)
                                .header(CONTENT_TYPE, "application/json")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(Body::from(json!({
                                    "success": true,
                                    "message": "Submit request processed successfully",
                                    "data": {
                                        "chain": req_data.chain,
                                        "sender": req_data.sender,
                                        "nonce": req_data.nonce,
                                        "tx_digest": format!("{:?}", tx_digest),
                                        "sql_count": sqls.len(),
                                    }
                                }).to_string()))
                        .unwrap()
                        },
                        Err(e) => {
                            println!("❌ Failed to execute PTB: {}", e);
                    Response::builder()
                                .status(StatusCode::INTERNAL_SERVER_ERROR)
                                .header(CONTENT_TYPE, "application/json")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(Body::from(json!({
                                    "success": false,
                                    "message": format!("Failed to execute PTB: {}", e),
                                    "data": null
                                }).to_string()))
                        .unwrap()
                        }
                    }
                },
                Err(e) => {
                    println!("❌ Failed to parse submit request: {}", e);
            Response::builder()
                        .status(StatusCode::BAD_REQUEST)
                        .header(CONTENT_TYPE, "application/json")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Body::from(json!({
                            "success": false,
                            "message": format!("Invalid JSON body: {}", e),
                            "data": null
                        }).to_string()))
                .unwrap()
        }
    }
}


async fn handle_get_table<DB>(req: Request<Body>, state: AppState<DB>) -> Response<Body>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static
{
    println!("🔍 Processing /get_table request");
    
    // Read body
    let whole_body = match body::aggregate(req.into_body()).await {
        Ok(body) => body,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(json!({
                    "message": false,
                    "data": []
                }).to_string()))
                .unwrap();
        }
    };
    
    // Parse JSON
    let req_data: Result<GetTableRequest, _> = serde_json::from_reader(whole_body.reader());
    
    match req_data {
        Ok(data) => {
            println!("✅ Received get_table request:");
            println!("  Dapp Key: {}", data.dapp_key);
            println!("  Account: {}", data.account);
            println!("  Table: {:?}", data.table);
            println!("  Key: {:?}", data.key);

            // TODO: Implement actual logic to fetch data
            // For now, return mock data as requested "implementation deferred"

            let data_key = DataKey {
                dapp_key: data.dapp_key,
                account: data.account,
                table: data.table,
                key: data.key,
            };

            let mut table_data = state.data.read().await.get(&data_key).cloned().unwrap_or_default();

            if table_data.is_empty() {
                let client = SuiClientBuilder::default().build(&state.config.rpc_url).await.unwrap();
                let parent_object_id = ObjectID::from_hex_literal("0x0b3baf7b3a0d822da137be8838bd729fce9ad411e590056d3f6d866ebcf049c3").unwrap();

                let account_key = AccountKey {
                    dapp_key: data_key.dapp_key.clone(),
                    account: data_key.account.clone(),
                };

                let dapp_data_key = state.dapp_data.read().await.get(&account_key).cloned();
                let parent_object_id = match dapp_data_key {
                    Some(dapp_data_key) => {
                        dapp_data_key
                    },
                    None => { 
                        let name = DynamicFieldName {    
                            type_: sui_types::TypeTag::from_str("0x8817b4976b6c607da01cea49d728f71d09274c82e9b163fa20c2382586f8aefc::dapp_service::AccountKey").unwrap(),
                            value: json!({
                                "account": data_key.account,
                                "dapp_key": data_key.dapp_key,
                            }) 
                           };
                           println!("name=============: {:?}", name);
                           let dynamic_field_object = client.read_api().get_dynamic_field_object(parent_object_id, name).await.unwrap();
                           println!("dynamic_field_object=============: {:?}", dynamic_field_object.clone().object_id().unwrap());
                           let parent_object_id = dynamic_field_object.clone().object_id().unwrap();
                           state.dapp_data.write().await.insert(account_key, parent_object_id);
                           parent_object_id
                    }
                };

           
                   // dapp data

                let mut value = vec![];
                value.push(data_key.table.as_bytes().to_vec());
                value.extend(data_key.key.clone());
                let name = DynamicFieldName {    
                type_: sui_types::TypeTag::Vector(Box::new(sui_types::TypeTag::Vector(Box::new(sui_types::TypeTag::U8)))),
                value: serde_json::Value::Array(
                   value.iter().map(|v| serde_json::Value::Array(v.iter().map(|v| serde_json::Value::Number(Number::from_u128(u128::from(*v)).unwrap())).collect())).collect()
                ), 
               };

                let dynamic_field_object = client.read_api().get_dynamic_field_object(parent_object_id, name).await.unwrap();
                println!("dynamic_field_object=============: {:?}", dynamic_field_object.clone().into_object().unwrap().content.unwrap().try_into_move().unwrap());
                let parsed_move_object = dynamic_field_object.clone().into_object().unwrap().content.unwrap().try_into_move().unwrap();
                let parsed_move_object_value = parsed_move_object.fields.field_value("value").unwrap();
                // println!("parsed_move_object_value=============: {:?}", parsed_move_object_value.to_json_value());
                table_data = serde_json::from_str(parsed_move_object_value.to_json_value().to_string().as_str()).unwrap();
                state.data.write().await.insert(data_key.clone(), table_data.clone());
            }


            
            let mock_response = GetTableResponse {
                message: true,
                data: table_data,
            };

            Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(serde_json::to_string(&mock_response).unwrap()))
                .unwrap()
        },
        Err(e) => {
            println!("❌ Failed to parse get_table request: {}", e);
            Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(json!({
                    "message": false,
                    "data": []
                }).to_string()))
                .unwrap()
        }
    }
}

// Check if DataKey matches subscription criteria
fn matches_subscription(data_key: &DataKey, subscription: &SubscribeTableRequest) -> bool {
    // 1. Match only dapp_key
    if let Some(ref dapp_key) = subscription.dapp_key {
        if data_key.dapp_key != *dapp_key {
            return false;
        }
    } else {
        // If dapp_key is not specified, no match
        return false;
    }
    
    // 2. Match dapp_key and account
    if let Some(ref account) = subscription.account {
        if data_key.account != *account {
            return false;
        }
    }
    
    // 3. Match dapp_key, account and table
    if let Some(ref table) = subscription.table {
        if data_key.table != *table {
            return false;
        }
    }
    
    // 4. Match dapp_key, account, table and key
    if let Some(ref key) = subscription.key {
        if data_key.key != *key {
            return false;
        }
    }
    
    true
}

async fn handle_subscribe_table<DB>(req: Request<Body>, state: AppState<DB>) -> Response<Body>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static
{
    println!("🔍 Processing /subscribe_table request");
    
    // Read body
    let whole_body = match body::aggregate(req.into_body()).await {
        Ok(body) => body,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(json!({
                    "error": format!("Failed to read body: {}", e)
                }).to_string()))
                .unwrap();
        }
    };
    
    // Parse JSON
    let subscription: Result<SubscribeTableRequest, _> = serde_json::from_reader(whole_body.reader());
    
    match subscription {
        Ok(sub) => {
            println!("✅ Received subscribe_table request:");
            println!("  Dapp Key: {:?}", sub.dapp_key);
            println!("  Account: {:?}", sub.account);
            println!("  Table: {:?}", sub.table);
            println!("  Key: {:?}", sub.key);
            
            // Create subscription receiver
            let mut rx = state.subscription_tx.subscribe();
            
            // Get currently matched data (initial data)
            let initial_data: Vec<SubscribeTableResponse> = {
                let data_map = state.data.read().await;
                let mut matched = Vec::new();
                for (data_key, value) in data_map.iter() {
                    if matches_subscription(data_key, &sub) {
                        matched.push(SubscribeTableResponse {
                            data_key: data_key.clone(),
                            value: value.clone(),
                        });
                    }
                }
                matched
            };
            
            // Create SSE stream: send initial data first, then continuously listen for new data
            let subscription_clone = sub.clone();
            let sse_stream = async_stream::stream! {
                // First send initial data
                for item in initial_data {
                    let json = match serde_json::to_string(&item) {
                        Ok(json) => json,
                        Err(_) => continue,
                    };
                    yield Ok::<_, Infallible>(format!("data: {}\n\n", json));
                }
                
                // Then continuously listen for new data
                loop {
                    match rx.recv().await {
                        Ok(response) => {
                            // Check if matches subscription criteria
                            if matches_subscription(&response.data_key, &subscription_clone) {
                                let json = match serde_json::to_string(&response) {
                                    Ok(json) => json,
                                    Err(_) => continue,
                                };
                                yield Ok(format!("data: {}\n\n", json));
                            }
                        },
                        Err(broadcast::error::RecvError::Closed) => {
                            // Channel closed, end stream
                            break;
                        },
                        Err(broadcast::error::RecvError::Lagged(_)) => {
                            // Skip lagged messages, continue receiving
                            continue;
                        }
                    }
                }
            };
            
            // Convert stream to hyper Body
            // hyper 0.14 uses Body::wrap_stream or directly uses Body::from()
            // If wrap_stream is not available, we need to use other methods
            use futures_util::StreamExt;
            let body_stream = sse_stream.map(|result| {
                result.map(|s| bytes::Bytes::from(s))
            });
            let body = Body::wrap_stream(body_stream);
            
            Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, "text/event-stream")
                .header("Cache-Control", "no-cache")
                .header("Connection", "keep-alive")
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Headers", "Cache-Control")
                .body(body)
                .unwrap()
        },
        Err(e) => {
            println!("❌ Failed to parse subscribe_table request: {}", e);
            Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(json!({
                    "error": format!("Invalid JSON body: {}", e)
                }).to_string()))
                .unwrap()
        }
    }
}


fn get_tx_digest_by_chain(chain: String) -> TransactionDigest {
    if chain == "evm" {
        let tx_digest = TransactionDigest::random();
        let mut tx_digest_inner = tx_digest.into_inner();
        tx_digest_inner[0] = 0xDB;
        tx_digest_inner[1] = 0xDB;
        tx_digest_inner[2] = 0x01;
        tx_digest_inner[3] = 0xE1;
        TransactionDigest::new(tx_digest_inner)
    } else if chain == "solana" {
        let tx_digest = TransactionDigest::random();
        let mut tx_digest_inner = tx_digest.into_inner();
        tx_digest_inner[0] = 0xDB;
        tx_digest_inner[1] = 0xDB;
        tx_digest_inner[2] = 0x01;
        tx_digest_inner[3] = 0xE2;
        TransactionDigest::new(tx_digest_inner)
    } else {
        // Default to SUI
        TransactionDigest::random()
    }
}

// ========== PTB Conversion Functions ==========

/// Convert PtbJson to ProgrammableTransaction
async fn convert_ptb_json_to_transaction<'a, DB>(
    ptb_json: &'a PtbJson,
    cache_db: &Arc<RwLock<CacheDB<DB>>>,
) -> Result<ProgrammableTransaction>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static
{
    let mut inputs = Vec::new();
    
    // Process inputs
    for input in &ptb_json.inputs {
        match input {
            PtbInput::UnresolvedObject { data } => {
                let object_id = ObjectID::from_hex_literal(&data.unresolved_object.object_id)?;
                
                // Get object from cache_db
                let object = {
                    let mut cache_db_guard = cache_db.write().await;
                    DBTrait::object(&mut *cache_db_guard, object_id)?
                        .ok_or_else(|| anyhow!("Object not found: {}", object_id))?
                };
                
                // Determine object type and create corresponding CallArg
                let call_arg = if let Some(initial_shared_version) = object.owner.start_version() {
                    // SharedObject
                    CallArg::Object(ObjectArg::SharedObject {
                        id: object.id(),
                        initial_shared_version,
                        mutable: true,
                    })
                } else {
                    // ImmOrOwnedObject
                    CallArg::Object(ObjectArg::ImmOrOwnedObject(object.compute_object_reference()))
                };
                
                inputs.push(call_arg);
            },
            PtbInput::Pure { data } => {
                // Decode base64 bytes
                let bytes = general_purpose::STANDARD.decode(&data.pure.bytes)
                    .map_err(|e| anyhow!("Failed to decode base64: {}", e))?;
                inputs.push(CallArg::Pure(bytes));
            },
        }
    }
    
    // Process commands
    let mut commands = Vec::new();
    for command in &ptb_json.commands {
        match command {
            PtbCommand::MoveCall { data } => {
                let move_call = &data.move_call;
                
                // Parse package ID
                let package = ObjectID::from_hex_literal(&move_call.package)?;
                
                // Parse module and function (directly use String)
                let module = move_call.module.clone();
                let function = move_call.function.clone();
                
                // Parse type_arguments - leave empty for now (can be extended later if needed)
                let type_arguments = vec![];
                
                // Parse arguments
                let arguments: Vec<Argument> = move_call.arguments
                    .iter()
                    .map(|arg| match arg {
                        ArgumentJson::Input { index, .. } => Argument::Input(*index),
                    })
                    .collect();
                
                commands.push(Command::MoveCall(Box::new(ProgrammableMoveCall {
                    package,
                    module,
                    function,
                    type_arguments,
                    arguments,
                })));
            },
        }
    }
    
    Ok(ProgrammableTransaction {
        inputs,
        commands,
    })
}

// ========== Address Conversion Functions ==========

/// Convert hex string to bytes
/// Supports both "0x..." and raw hex formats
fn hex_string_to_bytes(hex_str: &str) -> Result<Vec<u8>> {
    let hex_str = hex_str.trim();
    let hex_str = if hex_str.starts_with("0x") || hex_str.starts_with("0X") {
        &hex_str[2..]
    } else {
        hex_str
    };
    
    hex::decode(hex_str).map_err(|e| anyhow!("Invalid hex string: {}", e))
}

/// Convert EVM address to SUI address
/// EVM address is 20 bytes, SUI address is 32 bytes
/// Format: [12 zero bytes][20 bytes EVM address]
pub fn evm_to_sui(evm_address_str: &str) -> Result<SuiAddress> {
    let evm_bytes = hex_string_to_bytes(evm_address_str)?;
    
    if evm_bytes.len() != 20 {
        return Err(anyhow!("Invalid EVM address length: expected 20 bytes, got {}", evm_bytes.len()));
    }
    
    // Create 32-byte array: 12 zero bytes + 20 EVM address bytes
    let mut sui_bytes = vec![0u8; 12];
    sui_bytes.extend_from_slice(&evm_bytes);
    
    // Convert to SuiAddress
    SuiAddress::from_bytes(&sui_bytes).map_err(|e| anyhow!("Failed to create SuiAddress: {}", e))
}

/// Convert Solana address to SUI address
/// Solana address is Base58 encoded 32 bytes
/// Direct use of 32 bytes from Base58 decode
pub fn solana_to_sui(solana_address_str: &str) -> Result<SuiAddress> {
    // Decode Base58 string
    let solana_bytes = bs58::decode(solana_address_str)
        .into_vec()
        .map_err(|e| anyhow!("Invalid Solana Base58 address: {}", e))?;
    
    if solana_bytes.len() != 32 {
        return Err(anyhow!("Invalid Solana address length: expected 32 bytes, got {}", solana_bytes.len()));
    }
    
    // Convert to SuiAddress
    SuiAddress::from_bytes(&solana_bytes).map_err(|e| anyhow!("Failed to create SuiAddress: {}", e))
}

async fn mock_ptb_shared_sync<DB>(
    _config: &Arc<DubheChannelConfig>, 
    ptb: &ProgrammableTransaction, 
    cache_db: &mut CacheDB<DB>,
    sender: SuiAddress,
    tx_digest: TransactionDigest,
    temp_storage_state: &Arc<RwLock<StorageState>>,
    app_state: &AppState<DB>
) -> Result<Vec<String>, anyhow::Error>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static
{
    println!("🔄 Starting PTB execution...");
    println!("📝 Executing PTB transaction...");
    let (store_set_records, current_checkpoint_timestamp_ms, current_digest) = dubhe_vm::execute_single_ptb_with_store_set_record(ptb, cache_db, sender, tx_digest)?;
    println!("store_set_records: {:?}", store_set_records);
    let mut sql_list = Vec::new();
    
    // Parse store_set_records and insert into AppState.data
    for event in store_set_records {
        if let Event::StoreSetRecord(store_set_record) = event {
            println!("store_set_record: {:?}", store_set_record);
            
            // Build DataKey
            // account: extract from table_id, remove 0x prefix
            // table: use first element of key_tuple as UTF-8 string (table name)
            // key: use remaining elements of key_tuple after skipping the first one
            let account = if store_set_record.table_id.starts_with("0x") {
                store_set_record.table_id[2..].to_string()
            } else {
                store_set_record.table_id.clone()
            };
            let table = store_set_record.key_tuple.first()
                .map(|bytes| String::from_utf8_lossy(bytes).to_string())
                .unwrap_or_else(|| String::new());
            let key = store_set_record.key_tuple.iter()
                .skip(1)
                .cloned()
                .collect();
            
            let data_key = DataKey {
                dapp_key: store_set_record.dapp_key.clone(),
                account,
                table,
                key,
            };
            
            // Insert into AppState.data
            let mut data_map = app_state.data.write().await;
            let value = store_set_record.value_tuple.clone();
            println!("✅ Inserted data into AppState.data {:?}, {:?}", data_key, value);
            data_map.insert(data_key.clone(), value.clone());
            
            // Push subscription update
            let response = SubscribeTableResponse {
                data_key: data_key.clone(),
                value: value.clone(),
            };
            // Ignore send errors (if no subscribers)
            let _ = app_state.subscription_tx.send(response);
            
            
            // if dubhe_config
            //                     .can_convert_event_to_sql(&store_set_record)
            //                     .is_ok() {
            //     // Get table name
            //     let table_name = store_set_record.table_id().to_string();

            //     if table_name != "dapp_fee_state" {
            //         temp_storage_state.write().await.push(
            //             store_set_record.key_tuple().clone(), 
            //             store_set_record.value_tuple().clone()
            //         );
            //     }
            // }
        }
    }
    Ok(sql_list)
}


async fn set_storage(
    config: &Arc<DubheChannelConfig>, 
    key_tuple: Vec<Vec<u8>>,
    value_tuple: Vec<Vec<u8>>,
    dubhe_config: &DubheConfig,
    count: u64,
) -> Result<(), anyhow::Error> { 
    let sui_client = SuiClientBuilder::default().build(&config.rpc_url).await?;

    let private_key = dotenvy::var("PRIVATE_KEY").unwrap();
    let keypair = SuiKeyPair::decode(&private_key).map_err(|e| anyhow!(e))?;

    println!("private_key: {:?}", private_key);

    let mut keystore = InMemKeystore::default();
    InMemKeystore::import(&mut keystore, Some("hello".to_string()), keypair).await?;
    let sender = *keystore.addresses().first().ok_or(anyhow!("No sender found"))?;
    println!("sender: {:?}", sender);
    println!("count: {:?}", count);
    // we need to find the coin we will use as gas
    let coins = sui_client
    .coin_read_api()
    .get_coins(sender, None, None, None)
    .await?;
    let coin = coins.data.into_iter().next().ok_or(anyhow!("No coins found"))?;

    let object_id = ObjectID::from_hex_literal(&dubhe_config.dubhe_object_id).map_err(|e| anyhow!(e))?;
    let obj = sui_client
                .read_api()
                .get_object_with_options(
                    object_id,
                    SuiObjectDataOptions::bcs_lossless(),
                )
                .await?;
    let object: Object = obj.into_object()?.try_into()?;

    let object_inner = object.clone().into_inner();

    let input_object = CallArg::Object(ObjectArg::SharedObject {
        id: object.id(),
        initial_shared_version: object_inner.owner.start_version().ok_or(anyhow!("Failed to get start version"))?,
        mutable: true,
    });
        
        let input_keys = CallArg::Pure(
            bcs::to_bytes(
            &key_tuple
            ).unwrap());
        
        let input_values = CallArg::Pure(
            bcs::to_bytes(
                &value_tuple
        ).unwrap());

        let input_count = CallArg::Pure(
            bcs::to_bytes(&count).unwrap()
        );

    let input_table_id = if key_tuple.len() == 0 {CallArg::Pure(
        bcs::to_bytes(&"item_dropped".to_string()).unwrap()
    )} else {
        CallArg::Pure(
            bcs::to_bytes(&"position".to_string()).unwrap()
        )
    };
    let mut ptb = ProgrammableTransactionBuilder::new();
    ptb.input(input_object)?;
    ptb.input(input_table_id)?;
    ptb.input(input_keys)?;
    ptb.input(input_values)?;
    ptb.input(input_count)?;

        let package = ObjectID::from_hex_literal(&dubhe_config.original_dubhe_package_id).map_err(|e| anyhow!(e))?;
        let module = Identifier::new("dapp_system").map_err(|e| anyhow!(e))?;
        let function = Identifier::new("set_storage").map_err(|e| anyhow!(e))?;
        let move_call = Command::move_call(
            package,
            module,
            function,
            vec![TypeTag::from_str(&format!("{}::dapp_key::DappKey", dubhe_config.original_package_id))?],
            vec![
                Argument::Input(0),
                Argument::Input(1),
                Argument::Input(2),
                Argument::Input(3),
                Argument::Input(4),
            ],
        );
        ptb.command(move_call);

        // build the transaction block by calling finish on the ptb
        let builder = ptb.finish();

        let gas_budget = 1_000_000_000;
        let gas_price = sui_client.read_api().get_reference_gas_price().await?;
        // create the transaction data that will be sent to the network
        let tx_data = TransactionData::new_programmable(
            sender,
            vec![coin.object_ref()],
            builder,
            gas_budget,
            gas_price,
        );

        let signature = keystore.sign_secure(&sender, &tx_data, Intent::sui_transaction()).await?;

        println!("signature: {:?}", signature);

        // 5) execute the transaction
        print!("Executing the transaction...");
        let transaction_response = sui_client
            .quorum_driver_api()
            .execute_transaction_block(
                Transaction::from_data(tx_data, vec![signature]),
                SuiTransactionBlockResponseOptions::full_content(),
                Some(ExecuteTransactionRequestType::WaitForEffectsCert),
            )
            .await?;
        println!("Successfully executed transaction: {}", transaction_response.digest);

    Ok(())
}

// ========== Tests ==========

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evm_to_sui() {
        // Test EVM address conversion
        let evm_address = "0x9168765EE952de7C6f8fC6FaD5Ec209B960b7622";
        let result = evm_to_sui(evm_address);
        assert!(result.is_ok());
        
        let sui_address = result.unwrap();
        let sui_address_str = format!("{:?}", sui_address);
        println!("EVM {} -> SUI {}", evm_address, sui_address_str);
        
        // Verify it's 32 bytes (64 hex chars after 0x)
        assert!(sui_address_str.starts_with("0x"));
    }

    #[test]
    fn test_evm_to_sui_without_0x() {
        // Test without 0x prefix
        let evm_address = "9168765EE952de7C6f8fC6FaD5Ec209B960b7622";
        let result = evm_to_sui(evm_address);
        assert!(result.is_ok());
    }

    #[test]
    fn test_evm_to_sui_invalid_length() {
        // Test invalid length
        let evm_address = "0x91687";
        let result = evm_to_sui(evm_address);
        assert!(result.is_err());
    }

    #[test]
    fn test_solana_to_sui() {
        // Test Solana address conversion
        let solana_address = "3vy8k1NAc3Q9EPvqrAuS4DG4qwbgVqfxznEdtcrL743L";
        let result = solana_to_sui(solana_address);
        assert!(result.is_ok());
        
        let sui_address = result.unwrap();
        let sui_address_str = format!("{:?}", sui_address);
        println!("Solana {} -> SUI {}", solana_address, sui_address_str);
        
        // Verify it's 32 bytes
        assert!(sui_address_str.starts_with("0x"));
    }

    #[test]
    fn test_solana_to_sui_invalid() {
        // Test invalid Solana address
        let solana_address = "invalid_base58";
        let result = solana_to_sui(solana_address);
        assert!(result.is_err());
    }

    #[test]
    fn test_hex_string_to_bytes() {
        // Test with 0x prefix
        let hex_with_prefix = "0x1234";
        let result = hex_string_to_bytes(hex_with_prefix);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), vec![0x12, 0x34]);
        
        // Test without 0x prefix
        let hex_without_prefix = "1234";
        let result = hex_string_to_bytes(hex_without_prefix);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), vec![0x12, 0x34]);
        
        // Test invalid hex
        let invalid_hex = "0xGGGG";
        let result = hex_string_to_bytes(invalid_hex);
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_get_table_endpoint() {
        // Configure reqwest client to behave more like curl
        // Disable auto-compression, auto-redirect and other behaviors that may affect requests
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none()) // Don't auto-follow redirects
            .build()
            .expect("Failed to create HTTP client");
        
        let key_bytes: Vec<Vec<u8>> = vec![];
        
        let request = GetTableRequest {
            dapp_key: "a1c4e745cc1b345271cd4fa5ea37efd10d58be47c48cb29457a75695fd479365::dapp_key::DappKey".to_string(),
            account: "15fde77101778fafe8382743171294dfd8e7900a547711ee375379c27a85fd31".to_string(),
            table: "counter2".to_string(),
            key: key_bytes,
        };


        println!("📤 Sending request to http://localhost:8080/get_table");
        println!("📋 Request: {}", serde_json::to_string_pretty(&request).unwrap());

        // let response = client
        //     .post("http://localhost:8080/get_table")
        //     .header("Content-Type", "application/json")
        //     .header("Accept", "application/json")
        //     .json(&request)
        //     .send()
        //     .await;

        // match response {
        //     Ok(resp) => {
        //         let status = resp.status();
        //         println!("📥 Response status: {}", status);
                
        //         // Read response body text first for debugging
        //         let response_text = resp.text().await.unwrap_or_default();
        //         println!("📄 Response body (raw): {}", if response_text.is_empty() { "<empty>".to_string() } else { response_text.clone() });
                
        //         if status.is_success() {
        //             if response_text.is_empty() {
        //                 println!("⚠️  Warning: Response body is empty");
        //                 return;
        //             }
                    
        //             match serde_json::from_str::<serde_json::Value>(&response_text) {
        //                 Ok(response_json) => {
        //                     println!("✅ Test passed! Response: {}", serde_json::to_string_pretty(&response_json).unwrap());
        //                 },
        //                 Err(e) => {
        //                     println!("❌ Failed to parse response JSON: {}", e);
        //                     println!("📄 Response text was: {}", response_text);
        //                     panic!("Failed to parse response JSON: {}", e);
        //                 }
        //             }
        //         } else {
        //             println!("❌ Request failed with status {}: {}", status, response_text);
        //             panic!("Request failed with status: {}", status);
        //         }
        //     },
        //     Err(e) => {
        //         println!("❌ Failed to send request: {}", e);
        //         println!("💡 Please ensure the service is running on http://localhost:8080");
        //         println!("💡 You can run: cargo run --bin dubhe-channel -- --port 8080");
        //         panic!("Failed to send request: {}", e);
        //     }
        // }
    }
}
