// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use diesel::QueryableByName;
use dotenvy::dotenv;
use std::env;
use crate::sui_data_ingestion_core::{setup_single_workflow, ProgressStore};
use sui_graphql_client::Client;
use clap::Parser;
use crate::sui_data_ingestion_core::PostgressProgressStore;
use tokio::sync::oneshot;
use async_trait::async_trait;
use sui_types::full_checkpoint_content::CheckpointData;
use crate::sui_data_ingestion_core as sdic;
use sdic::{Worker, WorkerPool, ReaderOptions};
use sdic::{DataIngestionMetrics, FileProgressStore, IndexerExecutor};

use prometheus::Registry;
use std::path::PathBuf;

mod config;
mod events;
mod sql;
mod table;
mod worker;
mod db;
mod tls;
mod notify;
mod simple_notify;
mod sui_data_ingestion_core;

use crate::worker::DubheIndexerWorker;
use crate::db::get_connection_pool;

#[derive(QueryableByName)]
struct TableExists {
    #[diesel(sql_type = diesel::sql_types::Bool)]
    exists: bool,
}

// testnet
// cargo run -- --config dubhe.config.json --worker-pool-number 3 --store-url https://checkpoints.testnet.sui.io --start-checkpoint 1000
// localnet
//cargo run -- --config dubhe.config.json --worker-pool-number 3 --store-url ./chk --start-checkpoint 1

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Path to the configuration file
    #[arg(short, long)]
    config: String,
    /// Worker pool number
    #[arg(short, long)]
    worker_pool_number: u32,
    /// Store url
    #[arg(long)]
    store_url: String,
    /// Start checkpoint
    #[arg(long)]
    start_checkpoint: u64,
    /// Package id
    #[arg(long)]
    package_id: Option<String>,
    /// db url
    #[arg(long)]
    db_url: Option<String>,
}

struct CustomWorker;

#[async_trait]
impl Worker for CustomWorker {
		type Result = ();
		async fn process_checkpoint(&self, checkpoint: &CheckpointData) -> Result<()> {
				// custom processing logic
				println!("Processing Local checkpoint: {}", checkpoint.checkpoint_summary.to_string());
				Ok(())
		}
}

#[tokio::main]
async fn main() -> Result<()> {
    // // Parse command line arguments
    let args = Args::parse();
    
    // Set log level
    std::env::set_var("RUST_LOG", "error");
    let _guard = mysten_service::logging::init();
    dotenv().ok();

    let client = Client::new_testnet();
    let checkpoint = client.checkpoint(None, None).await?.unwrap();
    println!("Checkpoint: {:?}", checkpoint.sequence_number);
    // let latest_checkpoint = checkpoint.sequence_number;
    let latest_checkpoint = args.start_checkpoint;
    let start_checkpoint = args.start_checkpoint;

    // let mut start_checkpoint: u64 = checkpoint.sequence_number;
    // if let Some(checkpoint_id) = env::var("START_CHECKPOINT").ok() {
    //     start_checkpoint = checkpoint_id.parse::<u64>().unwrap_or(0);
    // }https://checkpoints.testnet.sui.io

    // println!("Checkpoint: {:?}", start_checkpoint);

    
    let mut dubhe_indexer_worker = DubheIndexerWorker {
        pg_pool: get_connection_pool(args.db_url.clone()).await,
        package_id: args.package_id,
    };

    // Create database tables from configuration
    dubhe_indexer_worker.create_tables_from_config(&args.config).await?;
    dubhe_indexer_worker.create_reader_progress_table(start_checkpoint, latest_checkpoint, args.worker_pool_number).await?;

    let concurrency = 1;
   
    let metrics = DataIngestionMetrics::new(&Registry::new());
    // let backfill_progress_file_path =
    //         env::var("BACKFILL_PROGRESS_FILE_PATH").unwrap_or("./reader_progress".to_string());
    // let mut progress_store = FileProgressStore::new(PathBuf::from(backfill_progress_file_path.clone()));
    // FileProgressStore::save(&mut progress_store, "latest_checkpoint".to_string(), latest_checkpoint).await?;

    let progress_store = PostgressProgressStore::new(get_connection_pool(args.db_url).await);

    let (exit_sender, exit_receiver) = oneshot::channel();
    let mut executor = IndexerExecutor::new(
        progress_store, 
        1,
        metrics.clone()
    );

    executor.register(WorkerPool::new(
        dubhe_indexer_worker, 
        "latest_reader_progress".to_string(), 
        concurrency
    )).await?;

    
    let (local_path , remote_store_url) = if args.store_url.starts_with("http") {
        (tempfile::tempdir()?.into_path(), Some(args.store_url.clone()))
    } else {
        (PathBuf::from(args.store_url), None)
    };

   executor.run(
        local_path,
        remote_store_url,
        vec![],
        ReaderOptions::default(),
        exit_receiver,
    ).await?;
    drop(_guard);
    Ok(())
}