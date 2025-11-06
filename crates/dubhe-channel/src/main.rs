// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::{Result, anyhow};
use dubhe_indexer::{IndexerBuilder, DubheIndexerArgs};
use dubhe_indexer::proxy::ChannelHandler;
use dubhe_common::Database;
use dubhe_common::DubheConfig;
use dubhe_db::{DubheDB, initialize_cache};
use dubhe_db::{CacheDB, WrapDatabaseAsync};
use dubhe_db::interface::Database as DBTrait;
use hyper::{Body, Response, StatusCode};
use http::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::str::FromStr;
use std::sync::Arc;
use std::path::PathBuf;
use sui_types::base_types::{ObjectID, SuiAddress};
use sui_types::storage::{PackageObject, ObjectStore};
use sui_types::transaction::{CallArg, Command, ObjectArg, ProgrammableTransaction, ProgrammableMoveCall, Argument, Transaction, TransactionData};
use sui_types::move_package::MovePackage;
use sui_types::object::Object;
use sui_protocol_config::ProtocolConfig;
use tokio::sync::RwLock;
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
use sui_keys::keystore::{AccountKeystore, FileBasedKeystore};
use sui_move_build;
use clap::Parser;
use sui_types::base_types::TransactionDigest;
use hyper::body;
use bytes::Buf;
use bs58;
use base64::{Engine as _, engine::general_purpose};


// Configuration struct
#[derive(Parser, Debug, Clone)]
#[command(author, version, about, long_about = None)]
struct DubheChannelConfig {
    #[command(flatten)]
    indexer_args: DubheIndexerArgs,
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

// Global application state
#[derive(Clone)]
struct AppState<DB> {
    config: Arc<DubheChannelConfig>,
    cache_db: Arc<RwLock<CacheDB<DB>>>
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logger
    env_logger::init();
    
    println!("🌟 Dubhe Channel Starting (with Indexer Integration) 🌟");

    // Load configuration
    let config: DubheChannelConfig = DubheChannelConfig::parse();

    // Build Indexer using IndexerBuilder
    let mut builder = IndexerBuilder::new(config.indexer_args.clone());
    builder.initialize().await?;

    // Get config for channel handlers
    let dubhe_config = builder.dubhe_config()
        .ok_or_else(|| anyhow::anyhow!("DubheConfig not initialized"))?;
    
    // Create CacheDB
    println!("🔄 Initializing CacheDB...");
    let client = SuiClientBuilder::default().build(&config.indexer_args.rpc_url).await?;
    let dubhedb = DubheDB::new(client.clone());
    let wrapped_dubhedb = WrapDatabaseAsync::new(dubhedb)
        .ok_or_else(|| anyhow::anyhow!("Failed to create WrapDatabaseAsync"))?;
    let mut cache_db = CacheDB::new(wrapped_dubhedb);
    
    // Preload all required objects using initialize_cache
    println!("🔄 Initializing cache with objects from chain...");
    initialize_cache(
        &mut cache_db,
        &client,
        &dubhe_config.dubhe_object_id,  // dubhe_hub_id
        &dubhe_config.original_dubhe_package_id,  // dubhe_package_id
        &dubhe_config.original_package_id         // origin_package_id
    ).await;
    
    let cache_db = Arc::new(RwLock::new(cache_db));
    println!("✅ CacheDB initialization complete");

    // Build Cluster
    let cluster = builder.build_cluster().await?;
    let handle = cluster.run().await?;

    // Build ProxyServer
    let proxy_server = builder.build_proxy_server().await?;

    // Register channel special routes
    let app_state = AppState {
        config: Arc::new(config.clone()),
        cache_db: cache_db.clone(),
    };

    // /submit route (only supports POST JSON)
    let state_clone = app_state.clone();
    let dubhe_config_clone = dubhe_config.clone();
    let database_url_clone = config.indexer_args.database_url.clone();
    let grpc_subscribers_clone = builder.grpc_subscribers();
    let submit_handler: ChannelHandler = Arc::new(move |req| {
        let state_clone = state_clone.clone();
        let dubhe_config_clone = dubhe_config_clone.clone();
        let database_url = database_url_clone.clone();
        let grpc_subscribers = grpc_subscribers_clone.clone();
        Box::pin(async move {
            println!("🔍 Processing /submit request");
            
            // Handle OPTIONS preflight request (CORS)
            if req.method() == hyper::Method::OPTIONS {
                return Ok(Response::builder()
                    .status(StatusCode::OK)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Allow-Methods", "POST, OPTIONS")
                    .header("Access-Control-Allow-Headers", "Content-Type, Authorization")
                    .header("Access-Control-Max-Age", "3600")
                    .body(Body::empty())
                    .unwrap());
            }
            
            // Check request method
            if req.method() != hyper::Method::POST {
                return Ok(Response::builder()
                    .status(StatusCode::METHOD_NOT_ALLOWED)
                    .header(CONTENT_TYPE, "application/json")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Body::from(json!({
                        "success": false,
                        "message": "Method not allowed. Only POST is supported",
                        "data": null
                    }).to_string()))
                    .unwrap());
            }
            
            // Read body
            let whole_body = match body::aggregate(req.into_body()).await {
                Ok(body) => body,
                Err(e) => {
                    return Ok(Response::builder()
                        .status(StatusCode::BAD_REQUEST)
                        .header(CONTENT_TYPE, "application/json")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Body::from(json!({
                            "success": false,
                            "message": format!("Failed to read body: {}", e),
                            "data": null
                        }).to_string()))
                        .unwrap());
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
                    
                    // TODO: Actual processing logic can be added here
                    // Currently only returns success response
                    let sender = match req_data.chain.as_str() {
                        "sui" => SuiAddress::from_str(&req_data.sender).unwrap(),
                        "evm" => evm_to_sui(&req_data.sender).unwrap(),
                        "solana" => solana_to_sui(&req_data.sender).unwrap(),
                        _ => panic!("Invalid chain: {}", req_data.chain),
                    };

                    let tx_digest = get_tx_digest_by_chain(req_data.chain.clone());

                    // Build PTB
                    let ptb = match convert_ptb_json_to_transaction(&req_data.ptb, &state_clone.cache_db).await {
                        Ok(ptb) => ptb,
                        Err(e) => {
                            println!("❌ Failed to convert PTB: {}", e);
                            return Ok(Response::builder()
                                .status(StatusCode::BAD_REQUEST)
                                .header(CONTENT_TYPE, "application/json")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(Body::from(json!({
                                    "success": false,
                                    "message": format!("Failed to convert PTB: {}", e),
                                    "data": null
                                }).to_string()))
                                .unwrap());
                        }
                    };
                    
                    // Execute PTB
                    println!("🔄 Executing PTB transaction...");
                    let value = {
                        let mut cache_db_guard = state_clone.cache_db.write().await;
                        mock_ptb_shared_sync(
                            &state_clone.config, 
                            &ptb, 
                            &mut *cache_db_guard, 
                            dubhe_config_clone, 
                            sender, 
                            tx_digest, 
                            grpc_subscribers.clone()
                        )
                    };
                    
                    match value {
                        Ok(sqls) => {
                            let database_channel = Database::new(&database_url).await.unwrap();
                            for sql in &sqls {
                                println!("📝 Executing SQL: {:?}", sql);
                                database_channel.execute(&sql).await.unwrap();
                            }
                            
                            println!("✅ PTB executed successfully, {} SQL statements", sqls.len());
                            Ok(Response::builder()
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
                                .unwrap())
                        },
                        Err(e) => {
                            println!("❌ Failed to execute PTB: {}", e);
                            Ok(Response::builder()
                                .status(StatusCode::INTERNAL_SERVER_ERROR)
                                .header(CONTENT_TYPE, "application/json")
                                .header("Access-Control-Allow-Origin", "*")
                                .body(Body::from(json!({
                                    "success": false,
                                    "message": format!("Failed to execute PTB: {}", e),
                                    "data": null
                                }).to_string()))
                                .unwrap())
                        }
                    }
                },
                Err(e) => {
                    println!("❌ Failed to parse submit request: {}", e);
                    Ok(Response::builder()
                        .status(StatusCode::BAD_REQUEST)
                        .header(CONTENT_TYPE, "application/json")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Body::from(json!({
                            "success": false,
                            "message": format!("Invalid JSON body: {}", e),
                            "data": null
                        }).to_string()))
                        .unwrap())
                }
            }
        })
    });
    proxy_server.register_channel_handler("/submit".to_string(), submit_handler).await;

    // Print startup information
    println!("\n🚀 Dubhe Channel Starting...");
    println!("================================");
    println!("🔌 gRPC Endpoint:     http://0.0.0.0:{}", config.indexer_args.port);
    println!("📊 GraphQL Endpoint: http://0.0.0.0:{}/graphql", config.indexer_args.port);
    println!("🏠 Welcome Page:     http://0.0.0.0:{}/welcome", config.indexer_args.port);
    println!(
        "🎮 Playground:       http://0.0.0.0:{}/playground",
        config.indexer_args.port
    );
    println!("💚 Health Check:     http://0.0.0.0:{}/health", config.indexer_args.port);
    println!("📋 Metadata:         http://0.0.0.0:{}/metadata", config.indexer_args.port);
    println!("🔍 Submit:           http://0.0.0.0:{}/submit", config.indexer_args.port);

    // Start Proxy Server
    let database = builder.database()
        .ok_or_else(|| anyhow::anyhow!("Database not initialized"))?;
    
    let proxy_handle = tokio::spawn(async move {
        if let Err(e) = proxy_server.start(database).await {
            eprintln!("❌ Proxy server failed: {}", e);
            std::process::exit(1);
        }
    });

    tokio::select! {
        result = proxy_handle => {
            match result {
                Ok(_) => println!("✅ Proxy server completed successfully"),
                Err(e) => println!("❌ Proxy server task failed: {}", e),
            }
        }
        result = handle => {
            match result {
                Ok(_) => println!("✅ Indexer executor completed successfully"),
                Err(e) => println!("❌ Indexer executor task failed: {}", e),
            }
        }
    }

    Ok(())
}


fn get_tx_digest_by_chain(chain: String) -> TransactionDigest {
    if chain == "evm" {
        let mut tx_digest = TransactionDigest::random();
        let mut tx_digest_inner = tx_digest.into_inner();
        tx_digest_inner[0] = 0xDB;
        tx_digest_inner[1] = 0xDB;
        tx_digest_inner[2] = 0x01;
        tx_digest_inner[3] = 0xE1;
        TransactionDigest::new(tx_digest_inner)
    } else if chain == "solana" {
        let mut tx_digest = TransactionDigest::random();
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

fn mock_ptb_shared_sync<DB>(
    _config: &Arc<DubheChannelConfig>, 
    ptb: &ProgrammableTransaction, 
    cache_db: &mut CacheDB<DB>,
    dubhe_config: DubheConfig,
    sender: SuiAddress,
    tx_digest: TransactionDigest,
    grpc_subscribers: Arc<RwLock<std::collections::HashMap<String, Vec<tokio::sync::mpsc::UnboundedSender<dubhe_indexer_grpc::types::TableChange>>>>>
) -> Result<Vec<String>, anyhow::Error>
where
    DB: dubhe_db::interface::DatabaseRef
{
    println!("🔄 Starting PTB execution...");
    println!("📝 Executing PTB transaction...");
    let (store_set_records, current_checkpoint_timestamp_ms, current_digest) = dubhe_vm::execute_single_ptb_with_store_set_record(ptb, cache_db, sender, tx_digest)?;
    println!("store_set_records: {:?}", store_set_records);
    let mut sql_list = Vec::new();
    for store_set_record in store_set_records {
        if dubhe_config
                            .can_convert_event_to_sql(&store_set_record)
                            .is_ok() {
            // Get table name
            let table_name = store_set_record.table_id().to_string();
            
            // Convert to proto_struct
            let mut proto_struct = dubhe_config.convert_event_to_proto_struct(&store_set_record)?;
            
            // Add extra fields
            proto_struct.fields.insert(
                "updated_at_timestamp_ms".to_string(),
                prost_types::Value {
                    kind: Some(prost_types::value::Kind::StringValue(
                        current_checkpoint_timestamp_ms.to_string(),
                    )),
                },
            );
            proto_struct.fields.insert(
                "last_update_digest".to_string(),
                prost_types::Value {
                    kind: Some(prost_types::value::Kind::StringValue(
                        current_digest.clone(),
                    )),
                },
            );
            proto_struct.fields.insert(
                "is_deleted".to_string(),
                prost_types::Value {
                    kind: Some(prost_types::value::Kind::BoolValue(false)),
                },
            );

            println!("proto_struct: {:?}", proto_struct);

            // Send to gRPC subscribers
            let subscribers = grpc_subscribers.clone();
            tokio::spawn(async move {
                let table_change = dubhe_indexer_grpc::types::TableChange {
                    table_id: table_name.clone(),
                    data: Some(proto_struct),
                };

                // Send to GRPC subscribers
                let subscribers = subscribers.read().await;
                println!("📤 Subscribers: {:?}", subscribers);
                if let Some(senders) = subscribers.get(&table_name) {
                    for sender in senders {
                        println!(
                            "📤 Sending table change to GRPC subscriber: {:?}",
                            table_name
                        );
                        let _ = sender.send(table_change.clone());
                    }
                }
            });

            let sql = dubhe_config.convert_event_to_sql(store_set_record, current_checkpoint_timestamp_ms, current_digest.clone())?;
            println!("sql: {:?}", sql);
            sql_list.push(sql);
        }
    }
    Ok(sql_list)
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
}

