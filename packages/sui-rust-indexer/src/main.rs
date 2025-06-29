use dubhe_indexer::{
    config, Result, storage, worker::DubheIndexerWorker, 
    sui_data_ingestion_core::{FileProgressStore, IndexerExecutor, WorkerPool, ReaderOptions, DataIngestionMetrics}
};
use log::info;
use std::env;
use std::path::PathBuf;
use prometheus::{Registry, Encoder};
use tokio::sync::oneshot;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    env_logger::init();
    
    // Parse command line arguments
    let args = config::Args::parse();
    
    // Load configuration
    let settings = config::Settings::new(&args)?;

    let (package_id, tables) = config::TableMetadata::new(&args)?;
    
    info!("Starting dubhe indexer...");
    
    // Initialize storage
    let storage = storage::new(&settings).await?;

    storage.create_tables(&tables).await?;

    let concurrency = 5;
    let (exit_sender, exit_receiver) = oneshot::channel();
    let metrics = DataIngestionMetrics::new(&Registry::new());
    let backfill_progress_file_path =
        env::var("BACKFILL_PROGRESS_FILE_PATH").unwrap_or("./local_reader_progress".to_string());
    let progress_store = FileProgressStore::new(PathBuf::from(backfill_progress_file_path));
    let mut executor = IndexerExecutor::new(progress_store, 1 /* number of workflow types */, metrics);
    

    let mut dubhe_indexer_worker = DubheIndexerWorker {
        package_id,
        tables,
        with_graphql: false,
    };
    let worker_pool = WorkerPool::new(dubhe_indexer_worker, "local_reader".to_string(), 1);

    executor.register(worker_pool).await?;
    executor.run(
        PathBuf::from("./chk".to_string()), // path to a local directory
        Some("https://checkpoints.testnet.sui.io".to_string()),
        vec![], // optional remote store access options
        ReaderOptions::default(),       /* remote_read_batch_size */
        exit_receiver,
        ).await?;

    // Initialize GRPC server
    // let grpc_server = grpc::Server::new(storage.clone(), &settings);
    
    // Initialize subscription manager
    // let subscription_broker = subscription::Broker::new(storage);
    
    // Start services
    // tokio::try_join!(
    //     grpc_server.serve(),
    //     subscription_broker.run()
    // )?;
    
    Ok(())
} 