// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use async_trait::async_trait;
use clap::Parser;
use diesel::QueryableByName;
use dotenvy::dotenv;
use std::env;
use std::net::SocketAddr;
use sui_sdk::SuiClientBuilder;
use sui_types::full_checkpoint_content::CheckpointData;
use tokio::sync::oneshot;
use std::net::TcpListener;
use rand::Rng;
use sui_indexer_alt_framework::cluster::{Args, IndexerCluster};
use sui_indexer_alt_framework::{IndexerArgs};
use crate::handlers::DubheEventHandler;
use sui_indexer_alt_framework::pipeline::sequential::SequentialConfig;
use sui_indexer_alt_framework::ingestion::ClientArgs;
use url::Url;

use prometheus::Registry;
use std::path::PathBuf;
use tempfile::TempDir;

mod args;
mod worker;
mod config;
mod proxy;
mod handlers;

use crate::args::DubheIndexerArgs;
// use crate::db::get_connection_pool;
use dubhe_common::{Database, Storage, TableMetadata};
use crate::worker::{DubheIndexerWorker, GrpcSubscribers};
use crate::config::DubheConfig;
use dubhe_common::SqliteStorage;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use dubhe_indexer_grpc::grpc::start_grpc_server;
use dubhe_indexer_graphql::{GraphQLServerManager, GraphQLConfig, TableChange};
use tokio::sync::mpsc;

#[tokio::main]
async fn main() -> Result<()> {
    // Parse command line arguments
    let args = DubheIndexerArgs::parse();

    let mut config = DubheConfig::new(&args)?;

    match &args.origin_package_id {
        Some(package_id) => {
            config.sui.origin_package_id = package_id.clone();
        }
        None => { }
    };

    // Initialize logging system based on configuration
    config.init_logging()?;


    log::debug!("Configuration loaded - RPC URL: {}, Package ID: {}, Database: {}, Server: {}", 
        config.sui.rpc_url, config.sui.origin_package_id, config.database.url, config.server.addr);

    let sui_client = config.get_sui_client().await?;
    let latest_checkpoint = sui_client
        .read_api()
        .get_latest_checkpoint_sequence_number()
        .await?;
    log::info!("Latest checkpoint: {:?}", latest_checkpoint);

    let config_json = args.get_config_json()?;
    let (package_id, start_checkpoint, tables) = TableMetadata::from_json(config_json)?;

    config.sui.origin_package_id = package_id.clone();

    let database = Database::new(&config.database.url).await?;

    // Initialize subscribers for GRPC
    let subscribers: GrpcSubscribers = Arc::new(RwLock::new(HashMap::new()));
    
    // Create GraphQL subscribers manager
    let graphql_subscribers: Arc<RwLock<HashMap<String, Vec<mpsc::UnboundedSender<TableChange>>>>> = 
        Arc::new(RwLock::new(HashMap::new()));

    if args.force{
         database.clear().await?; 
    }
    
    database.create_tables(&tables).await?;
    
    // Extract port from server.addr (format: "0.0.0.0:8080")
    let server_port = config.server.addr.split(':').last()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(8080);

    // Create GraphQL configuration
    let graphql_config = dubhe_indexer_graphql::GraphQLConfig {
        port: server_port,
        database_url: config.database.url.clone(),
        schema: "public".to_string(),
        endpoint: "/graphql".to_string(),
        cors: config.graphql.cors,
        subscriptions: config.graphql.subscriptions,
        env: "development".to_string(),
        debug: config.graphql.debug,
        query_timeout: config.graphql.query_timeout,
        max_connections: config.graphql.max_connections,
        heartbeat_interval: config.graphql.heartbeat_interval,
        enable_metrics: config.graphql.enable_metrics,
        enable_live_queries: config.graphql.enable_live_queries,
        enable_pg_subscriptions: config.graphql.enable_pg_subscriptions,
        enable_native_websocket: config.graphql.enable_native_websocket,
        realtime_port: config.graphql.realtime_port,
    };
    
    // Parse server address
    let server_addr: std::net::SocketAddr = config.server.addr.parse()
        .map_err(|e| anyhow::anyhow!("Invalid server address {}: {}", config.server.addr, e))?;

    // Print startup banner
    println!("\n🚀 Dubhe Indexer Starting...");
    println!("================================");
    println!("🔌 gRPC Endpoint:    http://{}", server_addr);
    println!("📊 GraphQL Endpoint: http://{}/graphql", server_addr);
    println!("🏠 Welcome Page:     http://{}/welcome", server_addr);
    println!("🎮 Playground:       http://{}/playground", server_addr);
    println!("💚 Health Check:     http://{}/health", server_addr);
    
    log::info!("🔧 Configuration loaded from: {}", args.config);
    log::info!("📊 Database URL: {}", config.database.url);
    log::info!("🌐 Server listening on: {}", server_addr);

    // Start unified proxy server with independent GraphQL and gRPC backends (torii-style architecture)
    // If the port is occupied, generate a new port
    let grpc_backend_addr: SocketAddr = loop {
        let port = rand::thread_rng().gen_range(8081..=8089);
        let addr = format!("0.0.0.0:{}", port);
        if TcpListener::bind(addr.parse::<SocketAddr>().unwrap()).is_ok() {
            break addr.parse::<SocketAddr>().unwrap();
        }
    };

    let graphql_backend_addr: SocketAddr = loop {
        let port = rand::thread_rng().gen_range(8081..=8089);
        let addr = format!("0.0.0.0:{}", port);
        if TcpListener::bind(addr.parse::<SocketAddr>().unwrap()).is_ok() {
            break addr.parse::<SocketAddr>().unwrap();
        }
    };
    
    log::info!("🏗️  Setting up torii-style architecture:");
    log::info!("   - Proxy Server:    {}", server_addr);
    log::info!("   - gRPC Backend:    {}", grpc_backend_addr);
    log::info!("   - GraphQL Backend: {}", graphql_backend_addr);
    
    let proxy_server = proxy::ProxyServer::new(
        server_addr,                  // Main proxy endpoint
        Some(grpc_backend_addr),      // Independent gRPC service
        Some(graphql_backend_addr),   // Independent GraphQL service
        subscribers.clone(),
        graphql_subscribers.clone(),
    );
    
    // Start proxy server in the main task (it will spawn backend services internally)
    let proxy_handle = tokio::spawn(async move {
        if let Err(e) = proxy_server.start(Arc::new(database)).await {
            log::error!("❌ Proxy server failed: {}", e);
            std::process::exit(1);
        }
    });
    let (local_ingestion_path, remote_store_url) = config.get_checkpoint_url()?;

    let client_args = ClientArgs {
        local_ingestion_path,
        remote_store_url,
        ..Default::default()
    };

     let indexer_args = IndexerArgs {
        first_checkpoint: Some(latest_checkpoint - 1),
        ..Default::default()
     };


    //  let mut args = Args::parse();
    //  args.indexer_args.first_checkpoint = Some(latest_checkpoint);
    let mut cluster = IndexerCluster::builder()
        // .with_args(args)                    
        .with_database_url(Url::parse(&config.database.url).unwrap())
        // .with_indexer_args(indexer_args)
        .with_client_args(client_args)
        .build()
        .await?;

    // println!("🔄 Indexer args: {:?}", cluster.indexer_args);

    let database = Database::new(&config.database.url).await?;
    let dubhe_event_handler = DubheEventHandler::new(
        config.sui.origin_package_id.clone(),
        database,
        tables.clone(),
        subscribers.clone(),
        graphql_subscribers.clone(),
    );

     // Register our custom sequential pipeline with the cluster
     cluster.sequential_pipeline(
        dubhe_event_handler,           // Our processor/handler implementation
        SequentialConfig::default(),        // Use default batch sizes and checkpoint lag
    ).await?;

      // Start the indexer and wait for completion
      let handle = cluster.run().await?;
    
    tokio::select! {
        result = proxy_handle => {
            match result {
                Ok(_) => log::info!("✅ Proxy server completed successfully"),
                Err(e) => log::error!("❌ Proxy server task failed: {}", e),
            }
        }
        result = handle => {
            match result {
                Ok(_) => log::info!("✅ Indexer executor completed successfully"),
                Err(e) => log::error!("❌ Indexer executor task failed: {}", e),
            }
        }
    }
    
    Ok(())
}
