// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use diesel::QueryableByName;
use dotenvy::dotenv;
use std::env;
use sui_data_ingestion_core::setup_single_workflow;
use sui_graphql_client::Client;
use clap::Parser;

mod config;
mod events;
mod sql;
mod table;
mod worker;
mod db;
mod tls;
mod notify;

use crate::worker::DubheIndexerWorker;
use crate::db::get_connection_pool;

#[derive(QueryableByName)]
struct TableExists {
    #[diesel(sql_type = diesel::sql_types::Bool)]
    exists: bool,
}

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Path to the configuration file
    #[arg(short, long)]
    config: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Parse command line arguments
    let args = Args::parse();
    
    // Set log level
    std::env::set_var("RUST_LOG", "error");
    let _guard = mysten_service::logging::init();
    dotenv().ok();

    let client = Client::new_testnet();
    let checkpoint = client.checkpoint(None, None).await?.unwrap();
    println!("Checkpoint: {:?}", checkpoint.sequence_number);
    let start_checkpoint: u64 = checkpoint.sequence_number;

    let dubhe_indexer_worker = DubheIndexerWorker {
        pg_pool: get_connection_pool().await,
    };

    // Create database tables from configuration
    dubhe_indexer_worker.create_tables_from_config(&args.config).await?;

    let (executor, _term_sender) = setup_single_workflow(
        dubhe_indexer_worker,
        env::var("REMOTE_STORAGE").unwrap_or_else(|_| "https://checkpoints.testnet.sui.io".to_string()),
        start_checkpoint,
        1,    /* concurrency */
        None, /* extra reader options */
    )
    .await?;
    executor.await?;
    drop(_guard);
    Ok(())
}