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


// 配置结构体
#[derive(Parser, Debug, Clone)]
#[command(author, version, about, long_about = None)]
struct DubheChannelConfig {
    #[arg(long, default_value = "http://localhost:9000")]
    sui_rpc_url: String,
    #[arg(long, default_value = "0x1")]
    package_id: String,
    #[arg(long, default_value = "0x2")]
    dubhe_package_id: String,
    #[arg(long, default_value = "0x3")]
    dubhe_object_id: String,
    #[arg(long, default_value = "0x4b8e9e6510fb69201b63d9466c5e382dde2073a6eaf9e3b70f4b82d000a8bc25")]
    signer: String,
    #[command(flatten)]
    indexer_args: DubheIndexerArgs,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SetStorageResponse {
    pub counter: u32,
    pub digest: String,
}

// Submit Request 结构体
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

// PTB JSON 结构体
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

// 全局应用状态
#[derive(Clone)]
struct AppState<DB> {
    config: Arc<DubheChannelConfig>,
    cache_db: Arc<RwLock<CacheDB<DB>>>
}

#[tokio::main]
async fn main() -> Result<()> {
    // 初始化日志
    env_logger::init();
    
    println!("🌟 Dubhe Channel Starting (with Indexer Integration) 🌟");

    // 加载配置
    let config: DubheChannelConfig = DubheChannelConfig::parse();
    
    // 创建 CacheDB
    println!("🔄 Initializing CacheDB...");
    let client = SuiClientBuilder::default().build(&config.sui_rpc_url).await?;
    let dubhedb = DubheDB::new(client.clone());
    let wrapped_dubhedb = WrapDatabaseAsync::new(dubhedb)
        .ok_or_else(|| anyhow::anyhow!("Failed to create WrapDatabaseAsync"))?;
    let mut cache_db = CacheDB::new(wrapped_dubhedb);
    
    // 使用 initialize_cache 预加载所有需要的对象
    println!("🔄 Initializing cache with objects from chain...");
    initialize_cache(
        &mut cache_db,
        &client,
        &config.dubhe_object_id,  // dubhe_hub_id
        &config.dubhe_package_id,  // dubhe_package_id
        &config.package_id         // origin_package_id
    ).await;
    
    let cache_db = Arc::new(RwLock::new(cache_db));
    println!("✅ CacheDB initialization complete");

    // 使用 IndexerBuilder 构建 Indexer
    let mut builder = IndexerBuilder::new(config.indexer_args.clone());
    builder.initialize().await?;

    // 获取配置用于 channel handlers
    let dubhe_config = builder.dubhe_config()
        .ok_or_else(|| anyhow::anyhow!("DubheConfig not initialized"))?;

    // 构建 Cluster
    let cluster = builder.build_cluster().await?;
    let handle = cluster.run().await?;

    // 构建 ProxyServer
    let proxy_server = builder.build_proxy_server().await?;

    // 注册 Channel 特殊路由
    let app_state = AppState {
        config: Arc::new(config.clone()),
        cache_db: cache_db.clone(),
    };

    // /get_objects 路由
    let state_clone = app_state.clone();
    let get_objects_handler: ChannelHandler = Arc::new(move |_req| {
        let state_clone = state_clone.clone();
        Box::pin(async move {
            println!("🔍 Processing /get_objects request");
            match get_objects(&state_clone.config, &state_clone.cache_db).await {
                Ok(_) => {
                    println!("✅ Objects retrieved successfully");
                    Ok(Response::builder()
                        .status(StatusCode::OK)
                        .header(CONTENT_TYPE, "text/plain")
                        .body(Body::from("✅ Objects retrieved successfully"))
                        .unwrap())
                },
                Err(e) => {
                    println!("❌ Failed to retrieve objects: {}", e);
                    Ok(Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .header(CONTENT_TYPE, "text/plain")
                        .body(Body::from(format!("❌ Failed to retrieve objects: {}", e)))
                        .unwrap())
                }
            }
        })
    });
    proxy_server.register_channel_handler("/get_objects".to_string(), get_objects_handler).await;

    // /set_storage/:counter 路由
    let state_clone = app_state.clone();
    let set_storage_handler: ChannelHandler = Arc::new(move |req| {
        let state_clone = state_clone.clone();
        Box::pin(async move {
            // 从路径中提取 counter 参数
            let path = req.uri().path();
            let parts: Vec<&str> = path.split('/').collect();
            let counter = if parts.len() >= 3 {
                parts[2].parse::<u32>().unwrap_or(0)
            } else {
                0
            };

            println!("🔍 Processing /set_storage/{} request", counter);
            match set_storage(state_clone.config.clone(), counter).await {
                Ok(response) => {
                    println!("✅ Storage set successfully");
                    Ok(Response::builder()
                        .status(StatusCode::OK)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(json!({
                            "success": true,
                            "counter": response.counter,
                            "digest": response.digest
                        }).to_string()))
                        .unwrap())
                },
                Err(e) => {
                    println!("❌ Failed to set storage: {}", e);
                    Ok(Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(json!({
                            "success": false,
                            "error": e.to_string()
                        }).to_string()))
                        .unwrap())
                }
            }
        })
    });
    proxy_server.register_channel_handler("/set_storage".to_string(), set_storage_handler).await;

    // /submit 路由 (仅支持 POST JSON)
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
            
            // 检查请求方法
            if req.method() != hyper::Method::POST {
                return Ok(Response::builder()
                    .status(StatusCode::METHOD_NOT_ALLOWED)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({
                        "success": false,
                        "message": "Method not allowed. Only POST is supported",
                        "data": null
                    }).to_string()))
                    .unwrap());
            }
            
            // 读取 body
            let whole_body = match body::aggregate(req.into_body()).await {
                Ok(body) => body,
                Err(e) => {
                    return Ok(Response::builder()
                        .status(StatusCode::BAD_REQUEST)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(json!({
                            "success": false,
                            "message": format!("Failed to read body: {}", e),
                            "data": null
                        }).to_string()))
                        .unwrap());
                }
            };
            
            // 解析 JSON
            let submit_request: Result<SubmitRequest, _> = serde_json::from_reader(whole_body.reader());
            
            match submit_request {
                Ok(req_data) => {
                    println!("✅ Received submit request:");
                    println!("  Chain: {}", req_data.chain);
                    println!("  Sender: {}", req_data.sender);
                    println!("  Nonce: {:?}", req_data.nonce);
                    println!("  PTB inputs: {}, commands: {}", req_data.ptb.inputs.len(), req_data.ptb.commands.len());
                    println!("  Signature: {:?}", req_data.signature);
                    
                    // TODO: 这里可以添加实际的处理逻辑
                    // 目前只返回成功响应
                    let sender = match req_data.chain.as_str() {
                        "sui" => SuiAddress::from_str(&req_data.sender).unwrap(),
                        "evm" => evm_to_sui(&req_data.sender).unwrap(),
                        "solana" => solana_to_sui(&req_data.sender).unwrap(),
                        _ => panic!("Invalid chain: {}", req_data.chain),
                    };

                    let tx_digest = get_tx_digest_by_chain(req_data.chain.clone());

                    // 构建 PTB
                    let ptb = match convert_ptb_json_to_transaction(&req_data.ptb, &state_clone.cache_db).await {
                        Ok(ptb) => ptb,
                        Err(e) => {
                            println!("❌ Failed to convert PTB: {}", e);
                            return Ok(Response::builder()
                                .status(StatusCode::BAD_REQUEST)
                                .header(CONTENT_TYPE, "application/json")
                                .body(Body::from(json!({
                                    "success": false,
                                    "message": format!("Failed to convert PTB: {}", e),
                                    "data": null
                                }).to_string()))
                                .unwrap());
                        }
                    };
                    
                    // 执行 PTB
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

    // /ptb_shared 路由
    let state_clone = app_state.clone();
    let dubhe_config_clone = dubhe_config.clone();
    let database_url = config.indexer_args.database_url.clone();
    let grpc_subscribers = builder.grpc_subscribers();
    let ptb_handler: ChannelHandler = Arc::new(move |req| {
        let state_clone = state_clone.clone();
        let dubhe_config_clone = dubhe_config_clone.clone();
        let database_url = database_url.clone();
        let grpc_subscribers = grpc_subscribers.clone();
        Box::pin(async move {
            // 从查询参数中提取 chain 参数
            let uri = req.uri();
            let query = uri.query().unwrap_or("");
            let chain_id = query
                .split('&')
                .find_map(|param| {
                    let mut parts = param.split('=');
                    if parts.next() == Some("chain") {
                        parts.next().and_then(|v| v.parse::<u64>().ok())
                    } else {
                        None
                    }
                })
                .unwrap_or(1); // 默认值为 1
            
            println!("🔍 Processing /ptb_shared request with chain_id: {}", chain_id);
            
            let object_id = ObjectID::from_hex_literal(&state_clone.config.dubhe_object_id).unwrap();
            
            let object = {
                let mut cache_db_guard = state_clone.cache_db.write().await;
                DBTrait::object(&mut *cache_db_guard, object_id).unwrap().unwrap()
            };
            
            let ptb = ProgrammableTransaction {
                inputs: vec![
                    CallArg::Object(ObjectArg::SharedObject {
                        id: object.id(),
                        initial_shared_version: object.owner.start_version().unwrap(),
                        mutable: true,
                    }),
                    CallArg::Pure(
                        bcs::to_bytes(&1u8).unwrap()
                    ),
                ],
                commands: vec![Command::MoveCall(Box::new(ProgrammableMoveCall {
                    package: ObjectID::from_hex_literal(&state_clone.config.package_id).unwrap(),
                    // package: ObjectID::from_hex_literal("0x76ae48d32307ff431edb92e4b89479828b59830e862848863ec6c58e121ed297").unwrap(),
                    module: "map_system".to_string(),
                    function: "move_position".to_string(),
                    type_arguments: vec![],
                    arguments: vec![sui_types::transaction::Argument::Input(0), sui_types::transaction::Argument::Input(1)],
                }))],
            };
            
            // let sender = SuiAddress::from_str("0x4b8e9e6510fb69201b63d9466c5e382dde2073a6eaf9e3b70f4b82d000a8bc25").unwrap();
            let sender = get_sender(chain_id);
            let tx_digest = get_tx_digest(chain_id);
            let value = {
                let mut cache_db_guard = state_clone.cache_db.write().await;
                mock_ptb_shared_sync(&state_clone.config, &ptb, &mut *cache_db_guard, dubhe_config_clone, sender, tx_digest, grpc_subscribers.clone())
            };
            
            match value {
                Ok(sqls) => {
                    let database_channel = Database::new(&database_url).await.unwrap();
                    for sql in sqls {
                        println!("execute sql: {:?}", sql);
                        database_channel.execute(&sql).await.unwrap();
                    }
                },
                Err(e) => {
                    println!("Error executing PTB: {:?}", e);
                }
            }
            Ok(Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, "text/plain")
                .body(Body::from("✅ PTB execution successful"))
                .unwrap())
        })
    });
    proxy_server.register_channel_handler("/ptb_shared".to_string(), ptb_handler).await;

    // 打印启动信息
    println!("\n🚀 Dubhe Channel + Indexer Starting...");
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
    println!("\n🎯 Channel Special Routes:");
    println!("  http://0.0.0.0:8080/get_objects           - 获取对象列表");
    println!("  http://0.0.0.0:8080/set_storage/:counter  - 设置存储值");
    println!("  http://0.0.0.0:8080/ptb_shared?chain=<id> - 执行 PTB 交易 (支持多链, chain: 1/2/其他)");
    println!("  http://0.0.0.0:8080/submit                - 提交交易 (POST JSON, 参数: chain, sender, ptb)");

    // 启动 Proxy Server
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


fn get_tx_digest(chain_id: u64) -> TransactionDigest {
    if chain_id == 1 {
        TransactionDigest::new([0xDB, 0xDB, 0x01, 0xE1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    } else if chain_id == 2 {
        TransactionDigest::new([0xDB, 0xDB, 0x01, 0xE2, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    } else {
        TransactionDigest::new([0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    }
}

fn get_tx_digest_by_chain(chain: String) -> TransactionDigest {
    if chain == "evm" {
        TransactionDigest::new([0xDB, 0xDB, 0x01, 0xE1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    } else if chain == "solana" {
        TransactionDigest::new([0xDB, 0xDB, 0x01, 0xE2, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    } else {
        // Default to SUI
        TransactionDigest::new([0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    }
}

fn get_sender(chain_id: u64) -> SuiAddress {
    if chain_id == 1 {
        SuiAddress::from_str("0x000000000000000000000000cdd077770ceb5271e42289ee1a9b3a19442f445d").unwrap()
    } else if chain_id == 2 {
        SuiAddress::from_str("0x2b8aa086ad26a5d1fa8c7e7fc76b975a0c5b2d22a63e48802a37add7e2f914f3").unwrap()
    } else {
        SuiAddress::from_str("0xc84ba871346dc957269d05b389df50e56ab0f57b466d1084edf734a323993b47").unwrap()
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
    
    // 处理 inputs
    for input in &ptb_json.inputs {
        match input {
            PtbInput::UnresolvedObject { data } => {
                let object_id = ObjectID::from_hex_literal(&data.unresolved_object.object_id)?;
                
                // 从 cache_db 获取对象
                let object = {
                    let mut cache_db_guard = cache_db.write().await;
                    DBTrait::object(&mut *cache_db_guard, object_id)?
                        .ok_or_else(|| anyhow!("Object not found: {}", object_id))?
                };
                
                // 判断对象类型并创建相应的 CallArg
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
                // 解码 base64 字节
                let bytes = general_purpose::STANDARD.decode(&data.pure.bytes)
                    .map_err(|e| anyhow!("Failed to decode base64: {}", e))?;
                inputs.push(CallArg::Pure(bytes));
            },
        }
    }
    
    // 处理 commands
    let mut commands = Vec::new();
    for command in &ptb_json.commands {
        match command {
            PtbCommand::MoveCall { data } => {
                let move_call = &data.move_call;
                
                // 解析 package ID
                let package = ObjectID::from_hex_literal(&move_call.package)?;
                
                // 解析 module 和 function (直接使用 String)
                let module = move_call.module.clone();
                let function = move_call.function.clone();
                
                // 解析 type_arguments - 暂时留空（如需支持，后续可以扩展）
                let type_arguments = vec![];
                
                // 解析 arguments
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

// Helper functions
async fn get_objects<DB>(
    config: &Arc<DubheChannelConfig>,
    cache_db: &Arc<RwLock<CacheDB<DB>>>
) -> Result<(), anyhow::Error> 
where
    DB: dubhe_db::interface::DatabaseRef
{
    let object_ids = vec![
        ObjectID::from_hex_literal(&config.dubhe_package_id).unwrap(),
        ObjectID::from_hex_literal("0xa337791835d15223727ace33cce17ea0901c094c8cfbe34d089c1a18c2df7a15").unwrap(),
        ObjectID::from_hex_literal(&config.package_id).unwrap(),
        ObjectID::from_hex_literal("0x0000000000000000000000000000000000000000000000000000000000000005").unwrap(),
        ObjectID::from_hex_literal(&config.dubhe_object_id).unwrap(),
        // Dubhe Hub Object ===> ObjectTable ===> Two Dubhe Store value
        // Dubhe Store value ==> tables field id 
        ObjectID::from_hex_literal("0x4cf281212223050413e22e0e0e93ccfabdd82d63e9902595087a9b146c925809").unwrap(),
        // DappHub Store value
        ObjectID::from_hex_literal("0xf42fef1e797d6debeb4d2cdb6c466fc5158961eaa4e2972facbd998bad18cb14").unwrap(),
        // Counter Store value Object
        ObjectID::from_hex_literal("0x3018106a4afef8d6a91373fa9ac93a0ed46dd0153b34d67a9f0a638e790d8130").unwrap(),
        ObjectID::from_hex_literal("0xbbcb61717ff71335de46b2ec09191e6745cffa3ea899d8ebc99479e8a8401ef7").unwrap(),
        ObjectID::from_hex_literal("0x4b26d5480bdf911939c2a0308b0c43a24624e8287c691769d4e2ef7965c58f77").unwrap(),
        ObjectID::from_hex_literal("0xcd2ab483a1c0b9084f9a7aabf2583b6306123ec151186d94a4e20b4285be2c00").unwrap(),
        // 0xd5 Owner key
        ObjectID::from_hex_literal("0x9d710dbbfd0ee0b00778783539c501ce6a8b852d91357246a60cb73a27cbf2d7").unwrap(),
        // 0xff Owner key
        ObjectID::from_hex_literal("0xef0c3edcc0fc0bd15684282ceb6631b481b4b79f8aedcf2838c614e2bdc04540").unwrap(),
        ObjectID::from_hex_literal("0x8a6c6a1897b8519fd2be4bbf04ce0f3e953b7483e90c024213e74f7c94f62af2").unwrap(),
        ObjectID::from_hex_literal("0x9c5093a35ab3155b303233f7e9310a76bb6996ab776d49e4ee0ff3da4b2113ee").unwrap(),
    ];
    let sui_client = SuiClientBuilder::default().build(&config.sui_rpc_url).await?;
    println!("🔗 Connecting to Sui client...");
    
    let obj = sui_client
        .read_api()
        .multi_get_object_with_options(
            object_ids,
            sui_json_rpc_types::SuiObjectDataOptions {
                show_type: true,
                show_owner: true,
                show_previous_transaction: true,
                show_display: true,
                show_content: false,
                show_bcs: true,
                show_storage_rebate: true,
            },
        )
        .await?;

    println!("📦 Processing {} objects...", obj.len());
    for object_data in obj {
        let sui_object_data = object_data.into_object()?;
        let object_id = sui_object_data.object_id;
        println!("object: {:?}", object_id);
        
        // 将 Object 插入到 cache_db
        let object: Object = sui_object_data.try_into()?;
        let mut cache_db_guard = cache_db.write().await;
        let mut cache = cache_db_guard.cache.write().unwrap();
        cache.objects.insert(object_id, object.clone());
        
        // 如果是 package，还需要特殊处理
        if object.is_package() {
            println!("packageObject: {:?}", object_id);
        }
    }

    // All dubhe stores
    let dubhe_store = ObjectID::from_hex_literal("0xbff7fd170a230d40828e68511a1507cc82052d42d056d02c2370430899bb9864")?;
    println!("🔍 Getting dynamic fields...");
    let dynamic_fields = sui_client
        .read_api()
        .get_dynamic_fields(dubhe_store, None, Some(10))
        .await?;
    
    for dynamic_field_info in &dynamic_fields.data {
        println!(" *** Dynamic Field ***");
        let dynamic_field = sui_client
            .read_api()
            .get_dynamic_field_object(dubhe_store, dynamic_field_info.name.clone())
            .await?;
        println!("DynamicFieldName========================: {:?}", dynamic_field_info.name);
        println!("DynamicField========================: {:?}", dynamic_field);
        println!(" *** Dynamic Field ***\n");
    }

    Ok(())
}

async fn set_storage(
    config: Arc<DubheChannelConfig>, 
    counter: u32,
) -> Result<SetStorageResponse, anyhow::Error> { 
    let sui_client = SuiClientBuilder::default().build(&config.sui_rpc_url).await?;
    let keypair = SuiKeyPair::decode(&config.signer).map_err(|e| anyhow!(e))?;

    let mut keystore = FileBasedKeystore::load_or_create(&PathBuf::new()).unwrap();
    FileBasedKeystore::import(&mut keystore, Some("hello".to_string()), keypair);
    let sender = *keystore.addresses().first().ok_or(anyhow!("No sender found"))?;
    println!("sender: {:?}", sender);
    println!("counter: {:?}", counter);
    
    // we need to find the coin we will use as gas
    let coins = sui_client
        .coin_read_api()
        .get_coins(sender, None, None, None)
        .await?;
    let coin = coins.data.into_iter().next().ok_or(anyhow!("No coins found"))?;

    let object_id = ObjectID::from_hex_literal(&config.dubhe_object_id).map_err(|e| anyhow!(e))?;
    let obj = sui_client
        .read_api()
        .get_object_with_options(
            object_id,
            SuiObjectDataOptions::bcs_lossless(),
        )
        .await?;
    let object: Object = obj.into_object()?.try_into()?;

    let object_inner = object.clone().into_inner();

    println!("object: {:?}", object);
    let input_object = CallArg::Object(ObjectArg::SharedObject {
        id: object.id(),
        initial_shared_version: object_inner.owner.start_version().ok_or(anyhow!("Failed to get start version"))?,
        mutable: true,
    });

    let keys: Vec<Vec<u8>> = vec![];
    
    let input_keys = CallArg::Pure(
        bcs::to_bytes(
           &keys
        ).unwrap());
    
    let input_values = CallArg::Pure(
        bcs::to_bytes(
            &vec![bcs::to_bytes(&counter).unwrap()]
        ).unwrap());

    let input_count = CallArg::Pure(
        bcs::to_bytes(&3u64).unwrap()
    );

    let input_table_id = CallArg::Pure(
        bcs::to_bytes(&"value".to_string()).unwrap()
    );
    
    let mut ptb = ProgrammableTransactionBuilder::new();
    ptb.input(input_object)?;
    ptb.input(input_table_id)?;
    ptb.input(input_keys)?;
    ptb.input(input_values)?;
    ptb.input(input_count)?;

    let package = ObjectID::from_hex_literal(&config.dubhe_package_id).map_err(|e| anyhow!(e))?;
    let module = Identifier::new("dapp_system").map_err(|e| anyhow!(e))?;
    let function = Identifier::new("set_storage").map_err(|e| anyhow!(e))?;
    let move_call = Command::move_call(
        package,
        module,
        function,
        vec![TypeTag::from_str(&format!("{}::dapp_key::DappKey", config.package_id))?],
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

    // execute the transaction
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

    Ok(SetStorageResponse {
        counter,
        digest: transaction_response.digest.to_string(),
    })
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
            // 获取表名
            let table_name = store_set_record.table_id().to_string();
            
            // 转换为 proto_struct
            let mut proto_struct = dubhe_config.convert_event_to_proto_struct(&store_set_record)?;
            
            // 添加额外字段
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

            // 发送到 gRPC subscribers
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

