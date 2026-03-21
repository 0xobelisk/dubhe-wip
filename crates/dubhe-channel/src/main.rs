// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose, Engine as _};
use bcs;
use bs58;
use bytes::Buf;
use clap::Parser;
use dubhe_channel_core::{
    AuthContext, Cursor, EventEnvelope, FilterValue, SnapshotQuery, SnapshotResult,
    SubscriptionSpec,
};
use dubhe_channel_runtime::presets::table::{
    event_from_table, snapshot_result as v2_snapshot_result, TableKey as V2TableKey,
};
use dubhe_channel_runtime::{
    AllowAllAuthz, ChannelRuntime, InMemoryEventBus, InMemorySnapshotStore, JetStreamEventBus,
    RedisSnapshotStore,
};
use dubhe_common::Database;
use dubhe_common::DubheConfig;
use dubhe_common::{Event, StoreSetRecord};
use dubhe_db::interface::Database as DBTrait;
use dubhe_db::{initialize_cache, DubheDB};
use dubhe_db::{CacheDB, WrapDatabaseAsync};
use futures_util::StreamExt;
use http::header::{CACHE_CONTROL, CONTENT_TYPE};
use hyper::body;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Request, Response, Server, StatusCode};
use rand::random;
use redis::{aio::ConnectionManager, AsyncCommands, Script};
use serde::{Deserialize, Serialize};
use serde_json::json;
use serde_json::Number;
use sha2::{Digest, Sha256};
use shared_crypto::intent::Intent;
use std::collections::{BTreeMap, HashMap};
use std::convert::Infallible;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Instant;
use sui_json_rpc_types::SuiData;
use sui_json_rpc_types::SuiObjectDataOptions;
use sui_keys::keystore::{AccountKeystore, FileBasedKeystore, InMemKeystore};
use sui_sdk::rpc_types::SuiTransactionBlockResponseOptions;
use sui_sdk::types::{
    programmable_transaction_builder::ProgrammableTransactionBuilder,
    quorum_driver_types::ExecuteTransactionRequestType, Identifier, TypeTag,
};
use sui_sdk::SuiClientBuilder;
use sui_types::base_types::TransactionDigest;
use sui_types::base_types::{ObjectID, SuiAddress};
use sui_types::crypto::SuiKeyPair;
use sui_types::dynamic_field::DynamicFieldName;
use sui_types::object::Object;
use sui_types::transaction::{
    Argument, CallArg, Command, ObjectArg, ProgrammableMoveCall, ProgrammableTransaction,
    Transaction, TransactionData,
};
use tokio::sync::oneshot;
use tokio::sync::{broadcast, RwLock};
use tokio::time::{interval, Duration};

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
    #[arg(long, default_value = "300")]
    pub submit_replay_ttl_secs: u64,
    #[arg(long)]
    pub redis_url: Option<String>,
    #[arg(long)]
    pub nats_url: Option<String>,
    #[arg(long, default_value = "dubhe:channel")]
    pub redis_key_prefix: String,
    #[arg(long, default_value = "DUBHE_CHANNEL")]
    pub nats_stream: String,
    #[arg(long, default_value = "dubhe.channel")]
    pub nats_subject_prefix: String,
    #[arg(long, default_value = "30000")]
    pub submit_lock_ttl_ms: u64,
    #[arg(long, default_value = "25")]
    pub submit_lock_retry_ms: u64,
    #[arg(long, default_value = "5000")]
    pub submit_lock_acquire_timeout_ms: u64,
}

// Submit Request struct
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubmitRequest {
    pub chain: String, // "sui" | "evm" | "solana"
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubmitBatchRequest {
    pub requests: Vec<SubmitRequest>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitBatchItemResponse {
    pub index: usize,
    pub status: u16,
    pub success: bool,
    pub replayed: bool,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitBatchResponse {
    pub success: bool,
    pub message: String,
    pub data: Vec<SubmitBatchItemResponse>,
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

// Get Nonce Request - query next nonce for an account (same sender as submit)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GetNonceRequest {
    pub sender: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetNonceResponse {
    pub nonce: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct V2QueryRequest {
    pub query: SnapshotQuery,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct V2SubscribeRequest {
    pub spec: SubscriptionSpec,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct V2PublishRequest {
    pub event: EventEnvelope,
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
        data: UnresolvedObjectData,
    },
    Pure {
        #[serde(flatten)]
        data: PureData,
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
    pub bytes: String, // Base64 encoded
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "$kind")]
pub enum PtbCommand {
    MoveCall {
        #[serde(flatten)]
        data: MoveCallData,
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

#[derive(Debug, Clone)]
struct SubmitExecutionOutcome {
    sqls: Vec<String>,
    store_set_records: Vec<StoreSetRecord>,
    checkpoint_ts_ms: u64,
    cursor_opaque: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct SubmitReplayKey {
    chain: String,
    sender: String,
    nonce: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SubmitReplayEntry {
    request_fingerprint: String,
    response_body: String,
    #[serde(skip, default = "Instant::now")]
    recorded_at: Instant,
}

#[derive(Debug, Clone)]
struct SubmitRouteResult {
    status: StatusCode,
    body: String,
    replayed: bool,
}

#[derive(Clone)]
struct RedisSubmitCoordinator {
    connection: ConnectionManager,
    key_prefix: String,
    lock_ttl_ms: u64,
    lock_retry_ms: u64,
    lock_acquire_timeout_ms: u64,
}

struct RedisSubmitLockLease {
    coordinator: RedisSubmitCoordinator,
    key: String,
    token: String,
    stop_tx: Option<oneshot::Sender<()>>,
    renew_task: Option<tokio::task::JoinHandle<()>>,
}

enum SubmitAccountGuard {
    Local(tokio::sync::OwnedMutexGuard<()>),
    Redis(RedisSubmitLockLease),
}

impl RedisSubmitCoordinator {
    async fn connect(
        redis_url: &str,
        key_prefix: impl Into<String>,
        lock_ttl_ms: u64,
        lock_retry_ms: u64,
        lock_acquire_timeout_ms: u64,
    ) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let connection = client.get_connection_manager().await?;

        Ok(Self {
            connection,
            key_prefix: key_prefix.into(),
            lock_ttl_ms,
            lock_retry_ms,
            lock_acquire_timeout_ms,
        })
    }

    fn nonce_key(&self, account_key: &str) -> String {
        format!("{}:submit:nonce:{}", self.key_prefix, account_key)
    }

    fn lock_key(&self, account_key: &str) -> String {
        format!("{}:submit:lock:{}", self.key_prefix, account_key)
    }

    fn replay_key(&self, key: &SubmitReplayKey) -> String {
        format!(
            "{}:submit:replay:{}:{}:{}",
            self.key_prefix, key.chain, key.sender, key.nonce
        )
    }

    async fn current_nonce(&self, account_key: &str) -> Result<u64> {
        let mut connection = self.connection.clone();
        let value: Option<u64> = connection.get(self.nonce_key(account_key)).await?;
        Ok(value.unwrap_or(0))
    }

    async fn replay_entry(
        &self,
        replay_key: &SubmitReplayKey,
    ) -> Result<Option<SubmitReplayEntry>> {
        let mut connection = self.connection.clone();
        let value: Option<String> = connection.get(self.replay_key(replay_key)).await?;
        value
            .map(|value| serde_json::from_str(&value))
            .transpose()
            .map_err(Into::into)
    }

    async fn record_success(
        &self,
        account_key: &str,
        nonce: u64,
        replay_key: Option<&SubmitReplayKey>,
        replay_entry: &SubmitReplayEntry,
        replay_ttl_secs: u64,
    ) -> Result<()> {
        let nonce_key = self.nonce_key(account_key);
        let mut connection = self.connection.clone();

        if let Some(replay_key) = replay_key {
            let replay_value = serde_json::to_string(replay_entry)?;
            let replay_key = self.replay_key(replay_key);
            let script = Script::new(
                r#"
                redis.call("SET", KEYS[1], ARGV[1])
                redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[3])
                return 1
                "#,
            );

            let _: i32 = script
                .key(nonce_key)
                .key(replay_key)
                .arg(nonce)
                .arg(replay_value)
                .arg(replay_ttl_secs)
                .invoke_async(&mut connection)
                .await?;
            return Ok(());
        }

        let _: () = connection.set(nonce_key, nonce).await?;
        Ok(())
    }

    async fn acquire_account_lock(&self, account_key: &str) -> Result<RedisSubmitLockLease> {
        let key = self.lock_key(account_key);
        let token = format!("{:032x}", random::<u128>());
        let deadline =
            tokio::time::Instant::now() + Duration::from_millis(self.lock_acquire_timeout_ms);

        loop {
            let mut connection = self.connection.clone();
            let acquired: Option<String> = redis::cmd("SET")
                .arg(&key)
                .arg(&token)
                .arg("NX")
                .arg("PX")
                .arg(self.lock_ttl_ms)
                .query_async(&mut connection)
                .await?;

            if acquired.is_some() {
                let coordinator = self.clone();
                let renew_key = key.clone();
                let renew_token = token.clone();
                let (stop_tx, mut stop_rx) = oneshot::channel();
                let renew_interval_ms = std::cmp::max(1_000, coordinator.lock_ttl_ms / 3);
                let renew_task = tokio::spawn(async move {
                    loop {
                        tokio::select! {
                            _ = tokio::time::sleep(Duration::from_millis(renew_interval_ms)) => {
                                if coordinator.renew_lock(&renew_key, &renew_token).await.is_err() {
                                    break;
                                }
                            }
                            _ = &mut stop_rx => {
                                break;
                            }
                        }
                    }
                });

                return Ok(RedisSubmitLockLease {
                    coordinator: self.clone(),
                    key,
                    token,
                    stop_tx: Some(stop_tx),
                    renew_task: Some(renew_task),
                });
            }

            if tokio::time::Instant::now() >= deadline {
                return Err(anyhow!(
                    "timed out acquiring submit lock for {}",
                    account_key
                ));
            }

            tokio::time::sleep(Duration::from_millis(self.lock_retry_ms)).await;
        }
    }

    async fn renew_lock(&self, key: &str, token: &str) -> Result<()> {
        let script = Script::new(
            r#"
            if redis.call("GET", KEYS[1]) == ARGV[1] then
              return redis.call("PEXPIRE", KEYS[1], ARGV[2])
            end
            return 0
            "#,
        );
        let mut connection = self.connection.clone();
        let renewed: i32 = script
            .key(key)
            .arg(token)
            .arg(self.lock_ttl_ms)
            .invoke_async(&mut connection)
            .await?;

        if renewed == 0 {
            return Err(anyhow!("submit lock lost for {}", key));
        }

        Ok(())
    }

    async fn release_lock(&self, key: &str, token: &str) -> Result<()> {
        let script = Script::new(
            r#"
            if redis.call("GET", KEYS[1]) == ARGV[1] then
              return redis.call("DEL", KEYS[1])
            end
            return 0
            "#,
        );
        let mut connection = self.connection.clone();
        let _: i32 = script
            .key(key)
            .arg(token)
            .invoke_async(&mut connection)
            .await?;
        Ok(())
    }
}

impl Drop for RedisSubmitLockLease {
    fn drop(&mut self) {
        if let Some(stop_tx) = self.stop_tx.take() {
            let _ = stop_tx.send(());
        }
        if let Some(renew_task) = self.renew_task.take() {
            renew_task.abort();
        }

        let coordinator = self.coordinator.clone();
        let key = self.key.clone();
        let token = self.token.clone();
        tokio::spawn(async move {
            let _ = coordinator.release_lock(&key, &token).await;
        });
    }
}

trait SubmitExecutor<DB>: Send + Sync
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    fn execute(
        &self,
        config: &Arc<DubheChannelConfig>,
        ptb: &ProgrammableTransaction,
        cache_db: &mut CacheDB<DB>,
        sender: SuiAddress,
        tx_digest: TransactionDigest,
        temp_storage_state: &Arc<RwLock<StorageState>>,
    ) -> Result<SubmitExecutionOutcome, anyhow::Error>;
}

#[derive(Clone, Default)]
struct VmSubmitExecutor;

impl<DB> SubmitExecutor<DB> for VmSubmitExecutor
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    fn execute(
        &self,
        config: &Arc<DubheChannelConfig>,
        ptb: &ProgrammableTransaction,
        cache_db: &mut CacheDB<DB>,
        sender: SuiAddress,
        tx_digest: TransactionDigest,
        temp_storage_state: &Arc<RwLock<StorageState>>,
    ) -> Result<SubmitExecutionOutcome, anyhow::Error> {
        execute_submit_ptb(config, ptb, cache_db, sender, tx_digest, temp_storage_state)
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
    submit_account_locks: Arc<RwLock<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>,
    submit_replay_cache: Arc<RwLock<HashMap<SubmitReplayKey, SubmitReplayEntry>>>,
    submit_coordinator: Option<Arc<RedisSubmitCoordinator>>,
    dapp_data: Arc<RwLock<HashMap<AccountKey, ObjectID>>>,
    v2_runtime: Arc<ChannelRuntime>,
    submit_executor: Arc<dyn SubmitExecutor<DB>>,
}

async fn build_channel_runtime(config: &DubheChannelConfig) -> Result<Arc<ChannelRuntime>> {
    if let (Some(redis_url), Some(nats_url)) = (&config.redis_url, &config.nats_url) {
        println!(
            "🛰️  Channel runtime backend: Redis snapshot store + NATS JetStream ({}, {})",
            config.redis_key_prefix, config.nats_stream
        );
        let snapshot_store =
            RedisSnapshotStore::connect(redis_url, format!("{}:runtime", config.redis_key_prefix))
                .await
                .map_err(|error| anyhow!(error.to_string()))?;
        let event_bus = JetStreamEventBus::connect(
            nats_url,
            config.nats_stream.clone(),
            config.nats_subject_prefix.clone(),
        )
        .await
        .map_err(|error| anyhow!(error.to_string()))?;

        return Ok(Arc::new(ChannelRuntime::new(
            Arc::new(event_bus),
            Arc::new(snapshot_store),
            Arc::new(AllowAllAuthz),
        )));
    }

    if config.nats_url.is_some() && config.redis_url.is_none() {
        return Err(anyhow!(
            "nats_url requires redis_url because snapshot/query state must be shared"
        ));
    }

    println!("🧠 Channel runtime backend: in-memory");
    Ok(Arc::new(ChannelRuntime::new(
        Arc::new(InMemoryEventBus::new(1000)),
        Arc::new(InMemorySnapshotStore::new()),
        Arc::new(AllowAllAuthz),
    )))
}

async fn build_submit_coordinator(
    config: &DubheChannelConfig,
) -> Result<Option<Arc<RedisSubmitCoordinator>>> {
    match &config.redis_url {
        Some(redis_url) => {
            println!(
                "🔐 Submit coordinator backend: Redis ({})",
                config.redis_key_prefix
            );
            Ok(Some(Arc::new(
                RedisSubmitCoordinator::connect(
                    redis_url,
                    format!("{}:coord", config.redis_key_prefix),
                    config.submit_lock_ttl_ms,
                    config.submit_lock_retry_ms,
                    config.submit_lock_acquire_timeout_ms,
                )
                .await?,
            )))
        }
        None => {
            println!("🔐 Submit coordinator backend: in-memory");
            Ok(None)
        }
    }
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
    let v2_runtime = build_channel_runtime(&config).await?;
    let submit_coordinator = build_submit_coordinator(&config).await?;

    let app_state = AppState {
        config: Arc::new(config.clone()),
        cache_db: cache_db.clone(),
        data: Arc::new(RwLock::new(HashMap::new())),
        temp_storage_state: temp_storage_state.clone(),
        subscription_tx: subscription_tx.clone(),
        account_nonce: Arc::new(RwLock::new(HashMap::new())),
        submit_account_locks: Arc::new(RwLock::new(HashMap::new())),
        submit_replay_cache: Arc::new(RwLock::new(HashMap::new())),
        submit_coordinator,
        dapp_data: Arc::new(RwLock::new(HashMap::new())),
        v2_runtime,
        submit_executor: Arc::new(VmSubmitExecutor),
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
    println!("🔗 http://localhost:8080/nonce");
    println!("🔗 http://localhost:8080/v2/query");
    println!("🔗 http://localhost:8080/v2/subscribe");
    println!("🔗 http://localhost:8080/v2/publish");
    println!("🔗 http://localhost:8080/v2/submit");
    println!("🔗 http://localhost:8080/v2/submit_batch");
    println!("🔗 http://localhost:8080/v2/nonce");
    println!("🔗 http://localhost:8080/health");

    let server = Server::bind(&addr).serve(make_svc);

    if let Err(e) = server.await {
        eprintln!("server error: {}", e);
    }

    Ok(())
}

async fn handle_request<DB>(
    req: Request<Body>,
    state: AppState<DB>,
) -> Result<Response<Body>, Infallible>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
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
        (&hyper::Method::GET, "/health") => Ok(handle_health().await),
        (&hyper::Method::POST, "/submit") => Ok(handle_submit(req, state).await),
        (&hyper::Method::POST, "/v2/submit") => Ok(handle_submit(req, state).await),
        (&hyper::Method::POST, "/submit_batch") => Ok(handle_submit_batch(req, state).await),
        (&hyper::Method::POST, "/v2/submit_batch") => Ok(handle_submit_batch(req, state).await),
        (&hyper::Method::POST, "/get_table") => Ok(handle_get_table(req, state).await),
        (&hyper::Method::POST, "/subscribe_table") => Ok(handle_subscribe_table(req, state).await),
        (&hyper::Method::POST, "/nonce") => Ok(handle_get_nonce(req, state).await),
        (&hyper::Method::POST, "/v2/nonce") => Ok(handle_get_nonce(req, state).await),
        (&hyper::Method::POST, "/v2/query") => Ok(handle_v2_query(req, state).await),
        (&hyper::Method::POST, "/v2/subscribe") => Ok(handle_v2_subscribe(req, state).await),
        (&hyper::Method::POST, "/v2/publish") => Ok(handle_v2_publish(req, state).await),
        _ => Ok(Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("Not Found"))
            .unwrap()),
    }
}

async fn handle_health() -> Response<Body> {
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(Body::from(
            json!({ "status": "ok", "healthy": true }).to_string(),
        ))
        .unwrap()
}

fn v2_auth_context() -> AuthContext {
    AuthContext::default()
}

fn now_ts_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn submit_replay_ttl(config: &DubheChannelConfig) -> Duration {
    Duration::from_secs(config.submit_replay_ttl_secs)
}

fn submit_replay_key(req: &SubmitRequest) -> Option<SubmitReplayKey> {
    req.nonce.map(|nonce| SubmitReplayKey {
        chain: req.chain.clone(),
        sender: req.sender.clone(),
        nonce,
    })
}

fn submit_request_fingerprint(req: &SubmitRequest) -> Result<String> {
    let json_bytes = serde_json::to_vec(req)?;
    Ok(hex::encode(Sha256::digest(json_bytes)))
}

fn cleanup_submit_replay_cache(
    entries: &mut HashMap<SubmitReplayKey, SubmitReplayEntry>,
    ttl: Duration,
) {
    let now = Instant::now();
    entries.retain(|_, entry| now.duration_since(entry.recorded_at) <= ttl);
}

fn submit_response_body(
    success: bool,
    message: impl Into<String>,
    data: Option<serde_json::Value>,
) -> String {
    json!(SubmitResponse {
        success,
        message: message.into(),
        data,
    })
    .to_string()
}

fn submit_error_result(
    status: StatusCode,
    message: impl Into<String>,
    data: Option<serde_json::Value>,
) -> SubmitRouteResult {
    SubmitRouteResult {
        status,
        body: submit_response_body(false, message, data),
        replayed: false,
    }
}

fn submit_route_response(result: SubmitRouteResult) -> Response<Body> {
    let mut builder = Response::builder()
        .status(result.status)
        .header(CONTENT_TYPE, "application/json")
        .header("Access-Control-Allow-Origin", "*");
    if result.replayed {
        builder = builder.header("X-Dubhe-Replayed", "true");
    }
    builder.body(Body::from(result.body)).unwrap()
}

fn submit_batch_item_from_result(
    index: usize,
    result: &SubmitRouteResult,
) -> SubmitBatchItemResponse {
    match serde_json::from_str::<SubmitResponse>(&result.body) {
        Ok(payload) => SubmitBatchItemResponse {
            index,
            status: result.status.as_u16(),
            success: payload.success,
            replayed: result.replayed,
            message: payload.message,
            data: payload.data,
        },
        Err(_) => SubmitBatchItemResponse {
            index,
            status: result.status.as_u16(),
            success: result.status.is_success(),
            replayed: result.replayed,
            message: "Unknown submit result".to_string(),
            data: None,
        },
    }
}

async fn submit_account_lock<DB>(
    state: &AppState<DB>,
    account_key: &str,
) -> Arc<tokio::sync::Mutex<()>>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    if let Some(lock) = state
        .submit_account_locks
        .read()
        .await
        .get(account_key)
        .cloned()
    {
        return lock;
    }

    let mut locks = state.submit_account_locks.write().await;
    locks
        .entry(account_key.to_string())
        .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
        .clone()
}

async fn acquire_submit_account_guard<DB>(
    state: &AppState<DB>,
    account_key: &str,
) -> Result<SubmitAccountGuard, SubmitRouteResult>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    if let Some(coordinator) = &state.submit_coordinator {
        return coordinator
            .acquire_account_lock(account_key)
            .await
            .map(SubmitAccountGuard::Redis)
            .map_err(|error| {
                submit_error_result(
                    StatusCode::SERVICE_UNAVAILABLE,
                    format!("Failed to acquire submit lock: {}", error),
                    None,
                )
            });
    }

    let account_lock = submit_account_lock(state, account_key).await;
    Ok(SubmitAccountGuard::Local(account_lock.lock_owned().await))
}

async fn current_account_nonce<DB>(
    state: &AppState<DB>,
    account_key: &str,
) -> Result<u64, SubmitRouteResult>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    if let Some(coordinator) = &state.submit_coordinator {
        return coordinator
            .current_nonce(account_key)
            .await
            .map_err(|error| {
                submit_error_result(
                    StatusCode::SERVICE_UNAVAILABLE,
                    format!("Failed to read submit nonce: {}", error),
                    None,
                )
            });
    }

    let nonce_map = state.account_nonce.read().await;
    Ok(nonce_map.get(account_key).copied().unwrap_or(0))
}

async fn replay_cache_entry<DB>(
    state: &AppState<DB>,
    replay_key: &SubmitReplayKey,
) -> Result<Option<SubmitReplayEntry>, SubmitRouteResult>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    if let Some(coordinator) = &state.submit_coordinator {
        return coordinator.replay_entry(replay_key).await.map_err(|error| {
            submit_error_result(
                StatusCode::SERVICE_UNAVAILABLE,
                format!("Failed to read submit replay cache: {}", error),
                None,
            )
        });
    }

    let mut replay_cache = state.submit_replay_cache.write().await;
    cleanup_submit_replay_cache(&mut replay_cache, submit_replay_ttl(&state.config));
    Ok(replay_cache.get(replay_key).cloned())
}

async fn record_submit_success<DB>(
    state: &AppState<DB>,
    account_key: &str,
    nonce: u64,
    replay_key: Option<&SubmitReplayKey>,
    replay_entry: SubmitReplayEntry,
) -> Result<(), SubmitRouteResult>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    if let Some(coordinator) = &state.submit_coordinator {
        return coordinator
            .record_success(
                account_key,
                nonce,
                replay_key,
                &replay_entry,
                state.config.submit_replay_ttl_secs,
            )
            .await
            .map_err(|error| {
                submit_error_result(
                    StatusCode::SERVICE_UNAVAILABLE,
                    format!("Failed to persist submit state: {}", error),
                    None,
                )
            });
    }

    {
        let mut nonce_map = state.account_nonce.write().await;
        nonce_map.insert(account_key.to_string(), nonce);
    }

    if let Some(replay_key) = replay_key {
        let mut replay_cache = state.submit_replay_cache.write().await;
        cleanup_submit_replay_cache(&mut replay_cache, submit_replay_ttl(&state.config));
        replay_cache.insert(replay_key.clone(), replay_entry);
    }

    Ok(())
}

fn to_v2_table_key(data_key: &DataKey) -> V2TableKey {
    V2TableKey {
        dapp_key: data_key.dapp_key.clone(),
        account: data_key.account.clone(),
        table: data_key.table.clone(),
        key: data_key.key.clone(),
    }
}

fn data_key_from_store_set_record(store_set_record: &StoreSetRecord) -> DataKey {
    let account = if store_set_record.table_id.starts_with("0x") {
        store_set_record.table_id[2..].to_string()
    } else {
        store_set_record.table_id.clone()
    };
    let table = store_set_record
        .key_tuple
        .first()
        .map(|bytes| String::from_utf8_lossy(bytes).to_string())
        .unwrap_or_default();
    let key = store_set_record.key_tuple.iter().skip(1).cloned().collect();

    DataKey {
        dapp_key: store_set_record.dapp_key.clone(),
        account,
        table,
        key,
    }
}

async fn apply_store_set_record<DB>(
    app_state: &AppState<DB>,
    store_set_record: &StoreSetRecord,
    checkpoint_ts_ms: u64,
    cursor: Cursor,
) where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    let data_key = data_key_from_store_set_record(store_set_record);
    let value = store_set_record.value_tuple.clone();

    {
        let mut data_map = app_state.data.write().await;
        println!(
            "✅ Inserted data into AppState.data {:?}, {:?}",
            data_key, value
        );
        data_map.insert(data_key.clone(), value.clone());
    }

    let response = SubscribeTableResponse {
        data_key: data_key.clone(),
        value: value.clone(),
    };
    let _ = app_state.subscription_tx.send(response);

    let table_key = to_v2_table_key(&data_key);
    let snapshot_query = table_key.to_snapshot_query();
    let _ = app_state
        .v2_runtime
        .upsert_snapshot(
            snapshot_query,
            v2_snapshot_result(value.clone(), Some(cursor)),
        )
        .await;
    let _ = app_state
        .v2_runtime
        .publish(
            &v2_auth_context(),
            event_from_table(&table_key, value, checkpoint_ts_ms),
        )
        .await;
}

async fn apply_submit_execution_outcome<DB>(
    app_state: &AppState<DB>,
    outcome: &SubmitExecutionOutcome,
) where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    for store_set_record in &outcome.store_set_records {
        apply_store_set_record(
            app_state,
            store_set_record,
            outcome.checkpoint_ts_ms,
            Cursor {
                opaque: outcome.cursor_opaque.clone(),
            },
        )
        .await;
    }
}

async fn persist_v2_table_snapshot<DB>(
    state: &AppState<DB>,
    data_key: &DataKey,
    value: Vec<Vec<u8>>,
) where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    let query = to_v2_table_key(data_key).to_snapshot_query();
    if let Ok(existing) = state
        .v2_runtime
        .query(&v2_auth_context(), query.clone())
        .await
    {
        if existing.found {
            return;
        }
    }
    let _ = state
        .v2_runtime
        .upsert_snapshot(
            query,
            v2_snapshot_result(
                value,
                Some(Cursor {
                    opaque: now_ts_ms().to_string(),
                }),
            ),
        )
        .await;
}

async fn read_table_data<DB>(
    state: &AppState<DB>,
    data_key: DataKey,
) -> Result<Vec<Vec<u8>>, String>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    let mut table_data = state
        .data
        .read()
        .await
        .get(&data_key)
        .cloned()
        .unwrap_or_default();

    if table_data.is_empty() {
        let client = SuiClientBuilder::default()
            .build(&state.config.rpc_url)
            .await
            .map_err(|e| e.to_string())?;
        let parent_object_id = ObjectID::from_hex_literal(
            "0x0b3baf7b3a0d822da137be8838bd729fce9ad411e590056d3f6d866ebcf049c3",
        )
        .map_err(|e| e.to_string())?;

        let account_key = AccountKey {
            dapp_key: data_key.dapp_key.clone(),
            account: data_key.account.clone(),
        };

        let dapp_data_key = state.dapp_data.read().await.get(&account_key).cloned();
        let parent_object_id = match dapp_data_key {
            Some(dapp_data_key) => dapp_data_key,
            None => {
                let name = DynamicFieldName {
                    type_: sui_types::TypeTag::from_str("0x8817b4976b6c607da01cea49d728f71d09274c82e9b163fa20c2382586f8aefc::dapp_service::AccountKey")
                        .map_err(|e| e.to_string())?,
                    value: json!({
                        "account": data_key.account,
                        "dapp_key": data_key.dapp_key,
                    }),
                };
                let dynamic_field_object = client
                    .read_api()
                    .get_dynamic_field_object(parent_object_id, name)
                    .await
                    .map_err(|e| e.to_string())?;
                let parent_object_id = dynamic_field_object
                    .clone()
                    .object_id()
                    .map_err(|e| e.to_string())?;
                state
                    .dapp_data
                    .write()
                    .await
                    .insert(account_key, parent_object_id);
                parent_object_id
            }
        };

        let mut value = vec![data_key.table.as_bytes().to_vec()];
        value.extend(data_key.key.clone());
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
            .map_err(|e| e.to_string())?;
        let parsed_move_object = dynamic_field_object
            .clone()
            .into_object()
            .map_err(|e| e.to_string())?
            .content
            .ok_or_else(|| "missing object content".to_string())?
            .try_into_move()
            .ok_or_else(|| "missing move object".to_string())?;
        let parsed_move_object_value = parsed_move_object
            .fields
            .field_value("value")
            .ok_or_else(|| "missing move field value".to_string())?;
        table_data = serde_json::from_str(
            parsed_move_object_value
                .to_json_value()
                .to_string()
                .as_str(),
        )
        .map_err(|e| e.to_string())?;
        state
            .data
            .write()
            .await
            .insert(data_key.clone(), table_data.clone());
    }

    persist_v2_table_snapshot(state, &data_key, table_data.clone()).await;
    Ok(table_data)
}

fn table_key_from_spec(spec: &SubscriptionSpec) -> Option<V2TableKey> {
    let dapp_key = match spec.filters.get("dapp_key")? {
        FilterValue::String(value) => value.clone(),
        FilterValue::StringList(_) => return None,
    };
    let account = match spec.filters.get("account")? {
        FilterValue::String(value) => value.clone(),
        FilterValue::StringList(_) => return None,
    };
    let table = match spec.filters.get("table")? {
        FilterValue::String(value) => value.clone(),
        FilterValue::StringList(_) => return None,
    };
    let key = match spec.filters.get("key") {
        Some(FilterValue::String(value)) => serde_json::from_str(value).ok()?,
        Some(FilterValue::StringList(_)) => return None,
        None => vec![],
    };

    Some(V2TableKey {
        dapp_key,
        account,
        table,
        key,
    })
}

async fn handle_submit<DB>(req: Request<Body>, state: AppState<DB>) -> Response<Body>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
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
                .body(Body::from(
                    json!({
                        "success": false,
                        "message": format!("Failed to read body: {}", e),
                        "data": null
                    })
                    .to_string(),
                ))
                .unwrap();
        }
    };

    // Parse JSON
    let submit_request: Result<SubmitRequest, _> = serde_json::from_reader(whole_body.reader());

    match submit_request {
        Ok(req_data) => {
            let account_key = req_data.sender.clone();
            let _account_guard = match acquire_submit_account_guard(&state, &account_key).await {
                Ok(guard) => guard,
                Err(result) => return submit_route_response(result),
            };
            submit_route_response(process_submit_request_locked(&state, req_data).await)
        }
        Err(e) => {
            println!("❌ Failed to parse submit request: {}", e);
            submit_route_response(submit_error_result(
                StatusCode::BAD_REQUEST,
                format!("Invalid JSON body: {}", e),
                None,
            ))
        }
    }
}

async fn process_submit_request_locked<DB>(
    state: &AppState<DB>,
    req_data: SubmitRequest,
) -> SubmitRouteResult
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    println!("✅ Received submit request:");
    println!("  Chain: {}", req_data.chain);
    println!("  Sender: {}", req_data.sender);
    println!("  Nonce: {:?}", req_data.nonce);
    println!(
        "  PTB inputs: {}, commands: {}",
        req_data.ptb.inputs.len(),
        req_data.ptb.commands.len()
    );
    println!("  Signature: {:?}", req_data.signature);

    let account_key = req_data.sender.clone();
    let request_fingerprint = match submit_request_fingerprint(&req_data) {
        Ok(fingerprint) => fingerprint,
        Err(e) => {
            println!("❌ Failed to fingerprint submit request: {}", e);
            return submit_error_result(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to fingerprint request: {}", e),
                None,
            );
        }
    };

    let replay_key = submit_replay_key(&req_data);
    if let Some(replay_key) = replay_key.clone() {
        let cached_response = match replay_cache_entry(state, &replay_key).await {
            Ok(cached_response) => cached_response,
            Err(result) => return result,
        };

        if let Some(cached_response) = cached_response {
            if cached_response.request_fingerprint == request_fingerprint {
                println!(
                    "♻️ Replaying cached submit response for {} nonce {}",
                    replay_key.sender, replay_key.nonce
                );
                return SubmitRouteResult {
                    status: StatusCode::OK,
                    body: cached_response.response_body,
                    replayed: true,
                };
            }
        }
    }

    let sender = match req_data.chain.as_str() {
        "sui" => match SuiAddress::from_str(&req_data.sender) {
            Ok(sender) => sender,
            Err(e) => {
                println!("❌ Invalid sui sender {}: {}", req_data.sender, e);
                return submit_error_result(
                    StatusCode::BAD_REQUEST,
                    format!("Invalid sui sender: {}", e),
                    None,
                );
            }
        },
        "evm" => match evm_to_sui(&req_data.sender) {
            Ok(sender) => sender,
            Err(e) => {
                println!("❌ Invalid evm sender {}: {}", req_data.sender, e);
                return submit_error_result(
                    StatusCode::BAD_REQUEST,
                    format!("Invalid evm sender: {}", e),
                    None,
                );
            }
        },
        "solana" => match solana_to_sui(&req_data.sender) {
            Ok(sender) => sender,
            Err(e) => {
                println!("❌ Invalid solana sender {}: {}", req_data.sender, e);
                return submit_error_result(
                    StatusCode::BAD_REQUEST,
                    format!("Invalid solana sender: {}", e),
                    None,
                );
            }
        },
        _ => {
            println!("❌ Invalid chain: {}", req_data.chain);
            return submit_error_result(
                StatusCode::BAD_REQUEST,
                format!("Invalid chain: {}", req_data.chain),
                None,
            );
        }
    };

    let current_nonce = match current_account_nonce(state, &account_key).await {
        Ok(current_nonce) => current_nonce,
        Err(result) => return result,
    };
    let expected_nonce = current_nonce + 1;

    match req_data.nonce {
        Some(submitted_nonce) => {
            if submitted_nonce != expected_nonce {
                println!(
                    "❌ Invalid nonce for account {}: expected {}, got {}",
                    account_key, expected_nonce, submitted_nonce
                );
                return submit_error_result(
                    StatusCode::BAD_REQUEST,
                    format!(
                        "Invalid nonce: expected {}, got {}",
                        expected_nonce, submitted_nonce
                    ),
                    None,
                );
            }
        }
        None => {
            println!(
                "❌ Nonce is required for account {}: expected {}",
                account_key, expected_nonce
            );
            return submit_error_result(
                StatusCode::BAD_REQUEST,
                format!("Nonce is required: expected {}", expected_nonce),
                None,
            );
        }
    }

    let tx_digest = get_tx_digest_by_chain(req_data.chain.clone());
    let ptb = match convert_ptb_json_to_transaction(&req_data.ptb, &state.cache_db).await {
        Ok(ptb) => ptb,
        Err(e) => {
            println!("❌ Failed to convert PTB: {}", e);
            return submit_error_result(
                StatusCode::BAD_REQUEST,
                format!("Failed to convert PTB: {}", e),
                None,
            );
        }
    };

    println!("🔄 Executing PTB transaction...");
    let execution = {
        let mut cache_db_guard = state.cache_db.write().await;
        state.submit_executor.execute(
            &state.config,
            &ptb,
            &mut *cache_db_guard,
            sender,
            tx_digest,
            &state.temp_storage_state,
        )
    };

    match execution {
        Ok(outcome) => {
            apply_submit_execution_outcome(state, &outcome).await;

            let response_body = submit_response_body(
                true,
                "Submit request processed successfully",
                Some(json!({
                    "chain": req_data.chain,
                    "sender": req_data.sender,
                    "nonce": req_data.nonce,
                    "tx_digest": format!("{:?}", tx_digest),
                    "sql_count": outcome.sqls.len(),
                })),
            );

            let replay_entry = SubmitReplayEntry {
                request_fingerprint: request_fingerprint.clone(),
                response_body: response_body.clone(),
                recorded_at: Instant::now(),
            };

            if let Err(result) = record_submit_success(
                state,
                &account_key,
                expected_nonce,
                replay_key.as_ref(),
                replay_entry,
            )
            .await
            {
                return result;
            }

            println!(
                "✅ Updated nonce for account {} to {}",
                account_key, expected_nonce
            );

            SubmitRouteResult {
                status: StatusCode::OK,
                body: response_body,
                replayed: false,
            }
        }
        Err(e) => {
            println!("❌ Failed to execute PTB: {}", e);
            submit_error_result(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to execute PTB: {}", e),
                None,
            )
        }
    }
}

async fn handle_submit_batch<DB>(req: Request<Body>, state: AppState<DB>) -> Response<Body>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    println!("🔍 Processing /submit_batch request");

    let whole_body = match body::aggregate(req.into_body()).await {
        Ok(body) => body,
        Err(e) => {
            return submit_route_response(submit_error_result(
                StatusCode::BAD_REQUEST,
                format!("Failed to read body: {}", e),
                None,
            ));
        }
    };

    let submit_batch_request: Result<SubmitBatchRequest, _> =
        serde_json::from_reader(whole_body.reader());

    let req_data = match submit_batch_request {
        Ok(req_data) => req_data,
        Err(e) => {
            println!("❌ Failed to parse submit batch request: {}", e);
            return submit_route_response(submit_error_result(
                StatusCode::BAD_REQUEST,
                format!("Invalid JSON body: {}", e),
                None,
            ));
        }
    };

    if req_data.requests.is_empty() {
        return submit_route_response(submit_error_result(
            StatusCode::BAD_REQUEST,
            "submit_batch requires at least one request",
            None,
        ));
    }

    let first_request = req_data.requests.first().unwrap();
    let sender = first_request.sender.clone();
    let chain = first_request.chain.clone();
    if req_data
        .requests
        .iter()
        .any(|request| request.sender != sender || request.chain != chain)
    {
        return submit_route_response(submit_error_result(
            StatusCode::BAD_REQUEST,
            "submit_batch currently requires every request to use the same chain and sender",
            None,
        ));
    }

    let _account_guard = match acquire_submit_account_guard(&state, &sender).await {
        Ok(guard) => guard,
        Err(result) => return submit_route_response(result),
    };

    let mut items = Vec::with_capacity(req_data.requests.len());
    let mut batch_success = true;
    let mut batch_message = "Submit batch processed successfully".to_string();

    for (index, submit_request) in req_data.requests.into_iter().enumerate() {
        let result = process_submit_request_locked(&state, submit_request).await;
        let item = submit_batch_item_from_result(index, &result);
        let item_failed = !item.success || !result.status.is_success();
        items.push(item);

        if item_failed {
            batch_success = false;
            batch_message = format!("Submit batch stopped at item {}", index);
            break;
        }
    }

    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(Body::from(
            json!(SubmitBatchResponse {
                success: batch_success,
                message: batch_message,
                data: items,
            })
            .to_string(),
        ))
        .unwrap()
}

async fn handle_get_table<DB>(req: Request<Body>, state: AppState<DB>) -> Response<Body>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
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
                .body(Body::from(
                    json!({
                        "message": false,
                        "data": []
                    })
                    .to_string(),
                ))
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
            let data_key = DataKey {
                dapp_key: data.dapp_key,
                account: data.account,
                table: data.table,
                key: data.key,
            };
            let table_data = match read_table_data(&state, data_key).await {
                Ok(table_data) => table_data,
                Err(error) => {
                    println!("❌ Failed to read table data: {}", error);
                    return Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .header(CONTENT_TYPE, "application/json")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Body::from(
                            json!({
                                "message": false,
                                "data": []
                            })
                            .to_string(),
                        ))
                        .unwrap();
                }
            };

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
        }
        Err(e) => {
            println!("❌ Failed to parse get_table request: {}", e);
            Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(
                    json!({
                        "message": false,
                        "data": []
                    })
                    .to_string(),
                ))
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
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
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
                .body(Body::from(
                    json!({
                        "error": format!("Failed to read body: {}", e)
                    })
                    .to_string(),
                ))
                .unwrap();
        }
    };

    // Parse JSON
    let subscription: Result<SubscribeTableRequest, _> =
        serde_json::from_reader(whole_body.reader());

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
            let body_stream = sse_stream.map(|result| result.map(|s| bytes::Bytes::from(s)));
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
        }
        Err(e) => {
            println!("❌ Failed to parse subscribe_table request: {}", e);
            Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(
                    json!({
                        "error": format!("Invalid JSON body: {}", e)
                    })
                    .to_string(),
                ))
                .unwrap()
        }
    }
}

async fn handle_v2_query<DB>(req: Request<Body>, state: AppState<DB>) -> Response<Body>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    let whole_body = match body::aggregate(req.into_body()).await {
        Ok(body) => body,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(
                    json!({ "error": format!("Failed to read body: {}", e) }).to_string(),
                ))
                .unwrap();
        }
    };

    let request: Result<V2QueryRequest, _> = serde_json::from_reader(whole_body.reader());
    match request {
        Ok(request) => {
            let result = if request.query.entity == "table" {
                let table_key: V2TableKey = match serde_json::from_str(&request.query.key) {
                    Ok(table_key) => table_key,
                    Err(error) => {
                        return Response::builder()
                            .status(StatusCode::BAD_REQUEST)
                            .header(CONTENT_TYPE, "application/json")
                            .header("Access-Control-Allow-Origin", "*")
                            .body(Body::from(
                                json!({ "error": format!("Invalid table query key: {}", error) })
                                    .to_string(),
                            ))
                            .unwrap();
                    }
                };

                let data_key = DataKey {
                    dapp_key: table_key.dapp_key,
                    account: table_key.account,
                    table: table_key.table,
                    key: table_key.key,
                };

                match read_table_data(&state, data_key.clone()).await {
                    Ok(data) => {
                        match state
                            .v2_runtime
                            .query(&v2_auth_context(), request.query.clone())
                            .await
                        {
                            Ok(existing) if existing.found => existing,
                            _ => {
                                let result = v2_snapshot_result(
                                    data,
                                    Some(Cursor {
                                        opaque: now_ts_ms().to_string(),
                                    }),
                                );
                                let _ = state
                                    .v2_runtime
                                    .upsert_snapshot(request.query.clone(), result.clone())
                                    .await;
                                result
                            }
                        }
                    }
                    Err(error) => {
                        return Response::builder()
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .header(CONTENT_TYPE, "application/json")
                            .header("Access-Control-Allow-Origin", "*")
                            .body(Body::from(json!({ "error": error }).to_string()))
                            .unwrap();
                    }
                }
            } else {
                match state
                    .v2_runtime
                    .query(&v2_auth_context(), request.query)
                    .await
                {
                    Ok(result) => result,
                    Err(error) => {
                        return Response::builder()
                            .status(StatusCode::INTERNAL_SERVER_ERROR)
                            .header(CONTENT_TYPE, "application/json")
                            .header("Access-Control-Allow-Origin", "*")
                            .body(Body::from(
                                json!({ "error": error.to_string() }).to_string(),
                            ))
                            .unwrap();
                    }
                }
            };

            Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(serde_json::to_string(&result).unwrap()))
                .unwrap()
        }
        Err(error) => Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header(CONTENT_TYPE, "application/json")
            .header("Access-Control-Allow-Origin", "*")
            .body(Body::from(
                json!({ "error": format!("Invalid JSON body: {}", error) }).to_string(),
            ))
            .unwrap(),
    }
}

async fn handle_v2_subscribe<DB>(req: Request<Body>, state: AppState<DB>) -> Response<Body>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    let whole_body = match body::aggregate(req.into_body()).await {
        Ok(body) => body,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(
                    json!({ "error": format!("Failed to read body: {}", e) }).to_string(),
                ))
                .unwrap();
        }
    };

    let request: Result<V2SubscribeRequest, _> = serde_json::from_reader(whole_body.reader());
    match request {
        Ok(request) => {
            let initial_event = if let Some(table_key) = table_key_from_spec(&request.spec) {
                let data_key = DataKey {
                    dapp_key: table_key.dapp_key.clone(),
                    account: table_key.account.clone(),
                    table: table_key.table.clone(),
                    key: table_key.key.clone(),
                };
                match read_table_data(&state, data_key).await {
                    Ok(data) => Some(event_from_table(&table_key, data, now_ts_ms())),
                    Err(_) => None,
                }
            } else {
                None
            };

            let stream = match state
                .v2_runtime
                .subscribe(&v2_auth_context(), request.spec)
                .await
            {
                Ok(stream) => stream,
                Err(error) => {
                    return Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .header(CONTENT_TYPE, "application/json")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Body::from(
                            json!({ "error": error.to_string() }).to_string(),
                        ))
                        .unwrap();
                }
            };

            let sse_stream = async_stream::stream! {
                if let Some(initial_event) = initial_event {
                    if let Ok(json) = serde_json::to_string(&initial_event) {
                        yield Ok::<_, Infallible>(format!("data: {}\n\n", json));
                    }
                }

                futures_util::pin_mut!(stream);
                while let Some(event) = stream.next().await {
                    match event {
                        Ok(event) => {
                            if let Ok(json) = serde_json::to_string(&event) {
                                yield Ok(format!("data: {}\n\n", json));
                            }
                        }
                        Err(_) => continue,
                    }
                }
            };

            let body_stream = sse_stream.map(|result| result.map(bytes::Bytes::from));
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
        }
        Err(error) => Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header(CONTENT_TYPE, "application/json")
            .header("Access-Control-Allow-Origin", "*")
            .body(Body::from(
                json!({ "error": format!("Invalid JSON body: {}", error) }).to_string(),
            ))
            .unwrap(),
    }
}

async fn handle_v2_publish<DB>(req: Request<Body>, state: AppState<DB>) -> Response<Body>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    let whole_body = match body::aggregate(req.into_body()).await {
        Ok(body) => body,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(
                    json!({ "error": format!("Failed to read body: {}", e) }).to_string(),
                ))
                .unwrap();
        }
    };

    let request: Result<V2PublishRequest, _> = serde_json::from_reader(whole_body.reader());
    match request {
        Ok(request) => {
            let mut event = request.event;
            if event.id.is_empty() {
                event.id = format!("evt-{:016x}", random::<u64>());
            }
            if event.ts_ms == 0 {
                event.ts_ms = now_ts_ms();
            }

            match state
                .v2_runtime
                .publish(&v2_auth_context(), event.clone())
                .await
            {
                Ok(()) => Response::builder()
                    .status(StatusCode::OK)
                    .header(CONTENT_TYPE, "application/json")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Body::from(serde_json::to_string(&event).unwrap()))
                    .unwrap(),
                Err(error) => Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .header(CONTENT_TYPE, "application/json")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Body::from(
                        json!({ "error": error.to_string() }).to_string(),
                    ))
                    .unwrap(),
            }
        }
        Err(error) => Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header(CONTENT_TYPE, "application/json")
            .header("Access-Control-Allow-Origin", "*")
            .body(Body::from(
                json!({ "error": format!("Invalid JSON body: {}", error) }).to_string(),
            ))
            .unwrap(),
    }
}

async fn handle_get_nonce<DB>(req: Request<Body>, state: AppState<DB>) -> Response<Body>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    println!("🔍 Processing /nonce request");

    let whole_body = match body::aggregate(req.into_body()).await {
        Ok(body) => body,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(
                    json!({
                        "error": format!("Failed to read body: {}", e)
                    })
                    .to_string(),
                ))
                .unwrap();
        }
    };

    let req_data: Result<GetNonceRequest, _> = serde_json::from_reader(whole_body.reader());

    match req_data {
        Ok(data) => {
            println!("✅ Received get_nonce request: sender={}", data.sender);

            let nonce = match current_account_nonce(&state, &data.sender).await {
                Ok(current_nonce) => current_nonce + 1,
                Err(result) => return submit_route_response(result),
            };

            let response = GetNonceResponse { nonce };
            println!("  -> next nonce: {}", response.nonce);

            Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(serde_json::to_string(&response).unwrap()))
                .unwrap()
        }
        Err(e) => {
            println!("❌ Failed to parse get_nonce request: {}", e);
            Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .header(CONTENT_TYPE, "application/json")
                .header("Access-Control-Allow-Origin", "*")
                .body(Body::from(
                    json!({
                        "error": format!("Invalid JSON body: {}", e)
                    })
                    .to_string(),
                ))
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
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
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
                    CallArg::Object(ObjectArg::ImmOrOwnedObject(
                        object.compute_object_reference(),
                    ))
                };

                inputs.push(call_arg);
            }
            PtbInput::Pure { data } => {
                // Decode base64 bytes
                let bytes = general_purpose::STANDARD
                    .decode(&data.pure.bytes)
                    .map_err(|e| anyhow!("Failed to decode base64: {}", e))?;
                inputs.push(CallArg::Pure(bytes));
            }
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
                let arguments: Vec<Argument> = move_call
                    .arguments
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
            }
        }
    }

    Ok(ProgrammableTransaction { inputs, commands })
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
        return Err(anyhow!(
            "Invalid EVM address length: expected 20 bytes, got {}",
            evm_bytes.len()
        ));
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
        return Err(anyhow!(
            "Invalid Solana address length: expected 32 bytes, got {}",
            solana_bytes.len()
        ));
    }

    // Convert to SuiAddress
    SuiAddress::from_bytes(&solana_bytes).map_err(|e| anyhow!("Failed to create SuiAddress: {}", e))
}

fn execute_submit_ptb<DB>(
    _config: &Arc<DubheChannelConfig>,
    ptb: &ProgrammableTransaction,
    cache_db: &mut CacheDB<DB>,
    sender: SuiAddress,
    tx_digest: TransactionDigest,
    temp_storage_state: &Arc<RwLock<StorageState>>,
) -> Result<SubmitExecutionOutcome, anyhow::Error>
where
    DB: dubhe_db::interface::DatabaseRef + 'static,
    <DB as dubhe_db::interface::DatabaseRef>::Error: Send + Sync + 'static,
{
    println!("🔄 Starting PTB execution...");
    println!("📝 Executing PTB transaction...");
    let (store_set_records, current_checkpoint_timestamp_ms, _current_digest) =
        dubhe_vm::execute_single_ptb_with_store_set_record(ptb, cache_db, sender, tx_digest)?;
    println!("store_set_records: {:?}", store_set_records);
    let mut sql_list = Vec::new();

    let mut applied_records = Vec::new();

    for event in store_set_records {
        if let Event::StoreSetRecord(store_set_record) = event {
            println!("store_set_record: {:?}", store_set_record);
            applied_records.push(store_set_record);

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
    let _ = temp_storage_state;
    Ok(SubmitExecutionOutcome {
        sqls: std::mem::take(&mut sql_list),
        store_set_records: applied_records,
        checkpoint_ts_ms: current_checkpoint_timestamp_ms,
        cursor_opaque: current_checkpoint_timestamp_ms.to_string(),
    })
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
    let sender = *keystore
        .addresses()
        .first()
        .ok_or(anyhow!("No sender found"))?;
    println!("sender: {:?}", sender);
    println!("count: {:?}", count);
    // we need to find the coin we will use as gas
    let coins = sui_client
        .coin_read_api()
        .get_coins(sender, None, None, None)
        .await?;
    let coin = coins
        .data
        .into_iter()
        .next()
        .ok_or(anyhow!("No coins found"))?;

    let object_id =
        ObjectID::from_hex_literal(&dubhe_config.dubhe_object_id).map_err(|e| anyhow!(e))?;
    let obj = sui_client
        .read_api()
        .get_object_with_options(object_id, SuiObjectDataOptions::bcs_lossless())
        .await?;
    let object: Object = obj.into_object()?.try_into()?;

    let object_inner = object.clone().into_inner();

    let input_object = CallArg::Object(ObjectArg::SharedObject {
        id: object.id(),
        initial_shared_version: object_inner
            .owner
            .start_version()
            .ok_or(anyhow!("Failed to get start version"))?,
        mutable: true,
    });

    let input_keys = CallArg::Pure(bcs::to_bytes(&key_tuple).unwrap());

    let input_values = CallArg::Pure(bcs::to_bytes(&value_tuple).unwrap());

    let input_count = CallArg::Pure(bcs::to_bytes(&count).unwrap());

    let input_table_id = if key_tuple.len() == 0 {
        CallArg::Pure(bcs::to_bytes(&"item_dropped".to_string()).unwrap())
    } else {
        CallArg::Pure(bcs::to_bytes(&"position".to_string()).unwrap())
    };
    let mut ptb = ProgrammableTransactionBuilder::new();
    ptb.input(input_object)?;
    ptb.input(input_table_id)?;
    ptb.input(input_keys)?;
    ptb.input(input_values)?;
    ptb.input(input_count)?;

    let package = ObjectID::from_hex_literal(&dubhe_config.original_dubhe_package_id)
        .map_err(|e| anyhow!(e))?;
    let module = Identifier::new("dapp_system").map_err(|e| anyhow!(e))?;
    let function = Identifier::new("set_storage").map_err(|e| anyhow!(e))?;
    let move_call = Command::move_call(
        package,
        module,
        function,
        vec![TypeTag::from_str(&format!(
            "{}::dapp_key::DappKey",
            dubhe_config.original_package_id
        ))?],
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

    let signature = keystore
        .sign_secure(&sender, &tx_data, Intent::sui_transaction())
        .await?;

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
    println!(
        "Successfully executed transaction: {}",
        transaction_response.digest
    );

    Ok(())
}

// ========== Tests ==========

#[cfg(test)]
mod tests {
    use super::*;
    use dubhe_db::interface::EmptyDB;
    use hyper::body::{to_bytes, HttpBody as _};
    use std::collections::VecDeque;
    use std::env;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};
    use tokio::time::timeout;

    #[derive(Clone)]
    struct FakeSubmitExecutor {
        outcomes: Arc<Mutex<VecDeque<SubmitExecutionOutcome>>>,
        calls: Arc<AtomicUsize>,
        delay: Option<std::time::Duration>,
    }

    impl FakeSubmitExecutor {
        fn new(outcomes: Vec<SubmitExecutionOutcome>) -> Self {
            Self {
                outcomes: Arc::new(Mutex::new(VecDeque::from(outcomes))),
                calls: Arc::new(AtomicUsize::new(0)),
                delay: None,
            }
        }

        fn with_delay(outcomes: Vec<SubmitExecutionOutcome>, delay: std::time::Duration) -> Self {
            Self {
                outcomes: Arc::new(Mutex::new(VecDeque::from(outcomes))),
                calls: Arc::new(AtomicUsize::new(0)),
                delay: Some(delay),
            }
        }

        fn call_count(&self) -> usize {
            self.calls.load(Ordering::SeqCst)
        }
    }

    impl SubmitExecutor<EmptyDB> for FakeSubmitExecutor {
        fn execute(
            &self,
            _config: &Arc<DubheChannelConfig>,
            _ptb: &ProgrammableTransaction,
            _cache_db: &mut CacheDB<EmptyDB>,
            _sender: SuiAddress,
            _tx_digest: TransactionDigest,
            _temp_storage_state: &Arc<RwLock<StorageState>>,
        ) -> Result<SubmitExecutionOutcome, anyhow::Error> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            if let Some(delay) = self.delay {
                std::thread::sleep(delay);
            }
            self.outcomes
                .lock()
                .unwrap()
                .pop_front()
                .ok_or_else(|| anyhow!("missing fake submit outcome"))
        }
    }

    fn test_state() -> AppState<EmptyDB> {
        test_state_with_executor(Arc::new(VmSubmitExecutor))
    }

    fn test_state_with_executor(executor: Arc<dyn SubmitExecutor<EmptyDB>>) -> AppState<EmptyDB> {
        let (subscription_tx, _) = broadcast::channel::<SubscribeTableResponse>(32);

        AppState {
            config: Arc::new(DubheChannelConfig {
                sync_time: 5,
                rpc_url: "http://unused-for-tests".to_string(),
                port: 0,
                submit_replay_ttl_secs: 300,
                redis_url: None,
                nats_url: None,
                redis_key_prefix: "dubhe:test".to_string(),
                nats_stream: "DUBHE_TEST".to_string(),
                nats_subject_prefix: "dubhe.test".to_string(),
                submit_lock_ttl_ms: 30_000,
                submit_lock_retry_ms: 25,
                submit_lock_acquire_timeout_ms: 5_000,
            }),
            cache_db: Arc::new(RwLock::new(CacheDB::new(EmptyDB::default()))),
            data: Arc::new(RwLock::new(HashMap::new())),
            temp_storage_state: Arc::new(RwLock::new(StorageState::new())),
            subscription_tx,
            account_nonce: Arc::new(RwLock::new(HashMap::new())),
            submit_account_locks: Arc::new(RwLock::new(HashMap::new())),
            submit_replay_cache: Arc::new(RwLock::new(HashMap::new())),
            submit_coordinator: None,
            dapp_data: Arc::new(RwLock::new(HashMap::new())),
            v2_runtime: Arc::new(ChannelRuntime::new(
                Arc::new(InMemoryEventBus::new(32)),
                Arc::new(InMemorySnapshotStore::new()),
                Arc::new(AllowAllAuthz),
            )),
            submit_executor: executor,
        }
    }

    fn local_test_redis_url() -> String {
        env::var("DUBHE_TEST_REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:16379/".to_string())
    }

    fn unique_test_prefix(label: &str) -> String {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before unix epoch")
            .as_nanos();
        format!("dubhe:test:{}:{}", label, now)
    }

    async fn clear_test_redis_namespace(redis_url: &str, key_prefix: &str) -> Result<()> {
        let client = redis::Client::open(redis_url)?;
        let mut connection = client.get_multiplexed_async_connection().await?;
        let pattern = format!("{}*", key_prefix);
        let keys: Vec<String> = redis::cmd("KEYS")
            .arg(pattern)
            .query_async(&mut connection)
            .await?;

        if !keys.is_empty() {
            let _: () = redis::cmd("DEL")
                .arg(keys)
                .query_async(&mut connection)
                .await?;
        }

        Ok(())
    }

    async fn test_state_with_redis_executor(
        key_prefix: &str,
        executor: Arc<dyn SubmitExecutor<EmptyDB>>,
    ) -> Result<AppState<EmptyDB>> {
        let (subscription_tx, _) = broadcast::channel::<SubscribeTableResponse>(32);
        let redis_url = local_test_redis_url();

        Ok(AppState {
            config: Arc::new(DubheChannelConfig {
                sync_time: 5,
                rpc_url: "http://unused-for-tests".to_string(),
                port: 0,
                submit_replay_ttl_secs: 300,
                redis_url: Some(redis_url.clone()),
                nats_url: None,
                redis_key_prefix: key_prefix.to_string(),
                nats_stream: "DUBHE_TEST".to_string(),
                nats_subject_prefix: "dubhe.test".to_string(),
                submit_lock_ttl_ms: 30_000,
                submit_lock_retry_ms: 25,
                submit_lock_acquire_timeout_ms: 5_000,
            }),
            cache_db: Arc::new(RwLock::new(CacheDB::new(EmptyDB::default()))),
            data: Arc::new(RwLock::new(HashMap::new())),
            temp_storage_state: Arc::new(RwLock::new(StorageState::new())),
            subscription_tx,
            account_nonce: Arc::new(RwLock::new(HashMap::new())),
            submit_account_locks: Arc::new(RwLock::new(HashMap::new())),
            submit_replay_cache: Arc::new(RwLock::new(HashMap::new())),
            submit_coordinator: Some(Arc::new(
                RedisSubmitCoordinator::connect(
                    &redis_url,
                    format!("{}:coord", key_prefix),
                    30_000,
                    25,
                    5_000,
                )
                .await?,
            )),
            dapp_data: Arc::new(RwLock::new(HashMap::new())),
            v2_runtime: Arc::new(ChannelRuntime::new(
                Arc::new(InMemoryEventBus::new(32)),
                Arc::new(InMemorySnapshotStore::new()),
                Arc::new(AllowAllAuthz),
            )),
            submit_executor: executor,
        })
    }

    fn test_submit_request(sender: &str, nonce: u64, marker: [u8; 3]) -> SubmitRequest {
        SubmitRequest {
            chain: "sui".to_string(),
            sender: sender.to_string(),
            nonce: Some(nonce),
            ptb: PtbJson {
                version: 1,
                sender: None,
                expiration: None,
                gas_data: None,
                inputs: vec![PtbInput::Pure {
                    data: PureData {
                        pure: PureInner {
                            bytes: base64::engine::general_purpose::STANDARD.encode(marker),
                        },
                    },
                }],
                commands: vec![],
            },
            signature: None,
        }
    }

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
        println!(
            "📋 Request: {}",
            serde_json::to_string_pretty(&request).unwrap()
        );

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

    #[tokio::test]
    async fn test_v2_health_endpoint() {
        let response = handle_request(
            Request::builder()
                .method(hyper::Method::GET)
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
            test_state(),
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body()).await.unwrap();
        let payload: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(payload["healthy"], true);
    }

    #[tokio::test]
    async fn test_v2_nonce_endpoint() {
        let state = test_state();
        state
            .account_nonce
            .write()
            .await
            .insert("0x1234".to_string(), 7);

        let response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/nonce")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"sender":"0x1234"}"#))
                .unwrap(),
            state,
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body()).await.unwrap();
        let payload: GetNonceResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(payload.nonce, 8);
    }

    #[tokio::test]
    async fn test_v2_query_uses_cached_table_data() {
        let state = test_state();
        let data_key = DataKey {
            dapp_key: "demo::dapp_key::DappKey".to_string(),
            account: "abc123".to_string(),
            table: "position".to_string(),
            key: vec![vec![1], vec![2, 3]],
        };
        let expected_value = vec![vec![9, 8, 7], vec![6, 5]];
        state
            .data
            .write()
            .await
            .insert(data_key.clone(), expected_value.clone());

        let query = V2QueryRequest {
            query: to_v2_table_key(&data_key).to_snapshot_query(),
        };

        let response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/query")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&query).unwrap()))
                .unwrap(),
            state.clone(),
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body()).await.unwrap();
        let payload: SnapshotResult = serde_json::from_slice(&body).unwrap();
        assert!(payload.found);
        assert!(payload.cursor.is_some());
        assert_eq!(
            payload.data.unwrap()["value"],
            serde_json::to_value(expected_value).unwrap()
        );

        let cached = state
            .v2_runtime
            .query(
                &v2_auth_context(),
                to_v2_table_key(&data_key).to_snapshot_query(),
            )
            .await
            .unwrap();
        assert!(cached.found);
    }

    #[tokio::test]
    async fn test_v2_subscribe_emits_initial_sse_event_for_cached_table() {
        let state = test_state();
        let data_key = DataKey {
            dapp_key: "demo::dapp_key::DappKey".to_string(),
            account: "player01".to_string(),
            table: "position".to_string(),
            key: vec![vec![4, 2]],
        };
        let expected_value = vec![vec![1, 1], vec![2, 2]];
        state
            .data
            .write()
            .await
            .insert(data_key.clone(), expected_value.clone());

        let spec = V2SubscribeRequest {
            spec: to_v2_table_key(&data_key).to_subscription_spec(),
        };

        let response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/subscribe")
                .header(CONTENT_TYPE, "application/json")
                .header("Accept", "text/event-stream")
                .body(Body::from(serde_json::to_vec(&spec).unwrap()))
                .unwrap(),
            state,
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(CONTENT_TYPE).unwrap(),
            "text/event-stream"
        );

        let mut body = response.into_body();
        let chunk = timeout(Duration::from_secs(1), body.data())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let chunk_text = String::from_utf8(chunk.to_vec()).unwrap();

        assert!(chunk_text.starts_with("data: "));
        assert!(chunk_text.contains(r#""topic":"table""#));
        assert!(chunk_text.contains(r#""table":"position""#));
        assert!(chunk_text.contains(&serde_json::to_string(&expected_value).unwrap()));
    }

    #[tokio::test]
    async fn test_submit_invalid_ptb_does_not_consume_nonce() {
        let state = test_state();
        let sender =
            "0x0000000000000000000000000000000000000000000000000000000000001234".to_string();

        let request = SubmitRequest {
            chain: "sui".to_string(),
            sender: sender.clone(),
            nonce: Some(1),
            ptb: PtbJson {
                version: 1,
                sender: None,
                expiration: None,
                gas_data: None,
                inputs: vec![PtbInput::Pure {
                    data: PureData {
                        pure: PureInner {
                            bytes: "%%%".to_string(),
                        },
                    },
                }],
                commands: vec![],
            },
            signature: None,
        };

        let response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/submit")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
            state.clone(),
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(state.account_nonce.read().await.get(&sender).copied(), None,);

        let nonce_response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/nonce")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&GetNonceRequest {
                        sender: sender.clone(),
                    })
                    .unwrap(),
                ))
                .unwrap(),
            state,
        )
        .await
        .unwrap();

        let body = to_bytes(nonce_response.into_body()).await.unwrap();
        let payload: GetNonceResponse = serde_json::from_slice(&body).unwrap();
        assert_eq!(payload.nonce, 1);
    }

    #[tokio::test]
    async fn test_submit_duplicate_request_replays_cached_success() {
        let record = StoreSetRecord {
            dapp_key: "demo::dapp_key::DappKey".to_string(),
            table_id: "0xplayer-replay".to_string(),
            key_tuple: vec![b"position".to_vec(), vec![1, 2]],
            value_tuple: vec![vec![9, 9]],
        };
        let executor = Arc::new(FakeSubmitExecutor::new(vec![SubmitExecutionOutcome {
            sqls: vec!["noop".to_string()],
            store_set_records: vec![record],
            checkpoint_ts_ms: 42,
            cursor_opaque: "digest-replay".to_string(),
        }]));
        let state = test_state_with_executor(executor.clone());

        let request = SubmitRequest {
            chain: "sui".to_string(),
            sender: "0x0000000000000000000000000000000000000000000000000000000000007777"
                .to_string(),
            nonce: Some(1),
            ptb: PtbJson {
                version: 1,
                sender: None,
                expiration: None,
                gas_data: None,
                inputs: vec![PtbInput::Pure {
                    data: PureData {
                        pure: PureInner {
                            bytes: base64::engine::general_purpose::STANDARD.encode([7u8, 7, 7]),
                        },
                    },
                }],
                commands: vec![],
            },
            signature: None,
        };

        let response_one = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/submit")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
            state.clone(),
        )
        .await
        .unwrap();
        assert_eq!(response_one.status(), StatusCode::OK);
        assert!(response_one.headers().get("X-Dubhe-Replayed").is_none());
        let body_one = to_bytes(response_one.into_body()).await.unwrap();
        let payload_one: serde_json::Value = serde_json::from_slice(&body_one).unwrap();

        let response_two = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/submit")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
            state,
        )
        .await
        .unwrap();
        assert_eq!(response_two.status(), StatusCode::OK);
        assert_eq!(
            response_two
                .headers()
                .get("X-Dubhe-Replayed")
                .and_then(|value| value.to_str().ok()),
            Some("true")
        );
        let body_two = to_bytes(response_two.into_body()).await.unwrap();
        let payload_two: serde_json::Value = serde_json::from_slice(&body_two).unwrap();

        assert_eq!(payload_one, payload_two);
        assert_eq!(executor.call_count(), 1);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_submit_concurrent_duplicate_requests_only_execute_once() {
        let record = StoreSetRecord {
            dapp_key: "demo::dapp_key::DappKey".to_string(),
            table_id: "0xplayer-concurrent".to_string(),
            key_tuple: vec![b"position".to_vec(), vec![3, 4]],
            value_tuple: vec![vec![1, 0]],
        };
        let executor = Arc::new(FakeSubmitExecutor::with_delay(
            vec![SubmitExecutionOutcome {
                sqls: vec!["noop".to_string()],
                store_set_records: vec![record],
                checkpoint_ts_ms: 99,
                cursor_opaque: "digest-concurrent".to_string(),
            }],
            std::time::Duration::from_millis(100),
        ));
        let state = test_state_with_executor(executor.clone());
        let request_body = serde_json::to_vec(&SubmitRequest {
            chain: "sui".to_string(),
            sender: "0x0000000000000000000000000000000000000000000000000000000000008888"
                .to_string(),
            nonce: Some(1),
            ptb: PtbJson {
                version: 1,
                sender: None,
                expiration: None,
                gas_data: None,
                inputs: vec![PtbInput::Pure {
                    data: PureData {
                        pure: PureInner {
                            bytes: base64::engine::general_purpose::STANDARD.encode([8u8, 8, 8]),
                        },
                    },
                }],
                commands: vec![],
            },
            signature: None,
        })
        .unwrap();

        let state_one = state.clone();
        let request_one = request_body.clone();
        let task_one = tokio::spawn(async move {
            handle_request(
                Request::builder()
                    .method(hyper::Method::POST)
                    .uri("/v2/submit")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(request_one))
                    .unwrap(),
                state_one,
            )
            .await
            .unwrap()
        });

        let state_two = state.clone();
        let task_two = tokio::spawn(async move {
            handle_request(
                Request::builder()
                    .method(hyper::Method::POST)
                    .uri("/v2/submit")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(request_body))
                    .unwrap(),
                state_two,
            )
            .await
            .unwrap()
        });

        let response_one = task_one.await.unwrap();
        let response_two = task_two.await.unwrap();

        assert_eq!(response_one.status(), StatusCode::OK);
        assert_eq!(response_two.status(), StatusCode::OK);
        assert_eq!(executor.call_count(), 1);

        let replay_headers = [
            response_one.headers().get("X-Dubhe-Replayed"),
            response_two.headers().get("X-Dubhe-Replayed"),
        ];
        assert_eq!(
            replay_headers
                .iter()
                .filter(|value| value.and_then(|v| v.to_str().ok()) == Some("true"))
                .count(),
            1
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore = "requires local Redis at 127.0.0.1:16379"]
    async fn test_submit_cross_instance_duplicate_requests_only_execute_once_with_redis() {
        let redis_url = local_test_redis_url();
        let key_prefix = unique_test_prefix("cross-instance");
        clear_test_redis_namespace(&redis_url, &key_prefix)
            .await
            .unwrap();

        let record = StoreSetRecord {
            dapp_key: "demo::dapp_key::DappKey".to_string(),
            table_id: "0xplayer-redis-cluster".to_string(),
            key_tuple: vec![b"position".to_vec(), vec![9, 9]],
            value_tuple: vec![vec![4, 2]],
        };
        let executor = Arc::new(FakeSubmitExecutor::with_delay(
            vec![SubmitExecutionOutcome {
                sqls: vec!["noop".to_string()],
                store_set_records: vec![record],
                checkpoint_ts_ms: 123,
                cursor_opaque: "digest-redis-cluster".to_string(),
            }],
            std::time::Duration::from_millis(100),
        ));

        let state_one = test_state_with_redis_executor(&key_prefix, executor.clone())
            .await
            .unwrap();
        let state_two = test_state_with_redis_executor(&key_prefix, executor.clone())
            .await
            .unwrap();

        let request = SubmitRequest {
            chain: "sui".to_string(),
            sender: "0x0000000000000000000000000000000000000000000000000000000000009999"
                .to_string(),
            nonce: Some(1),
            ptb: PtbJson {
                version: 1,
                sender: None,
                expiration: None,
                gas_data: None,
                inputs: vec![PtbInput::Pure {
                    data: PureData {
                        pure: PureInner {
                            bytes: base64::engine::general_purpose::STANDARD.encode([9u8, 9, 9]),
                        },
                    },
                }],
                commands: vec![],
            },
            signature: None,
        };
        let request_body = serde_json::to_vec(&request).unwrap();

        let task_one = tokio::spawn({
            let state = state_one.clone();
            let body = request_body.clone();
            async move {
                handle_request(
                    Request::builder()
                        .method(hyper::Method::POST)
                        .uri("/v2/submit")
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(body))
                        .unwrap(),
                    state,
                )
                .await
                .unwrap()
            }
        });

        let task_two = tokio::spawn({
            let state = state_two.clone();
            async move {
                handle_request(
                    Request::builder()
                        .method(hyper::Method::POST)
                        .uri("/v2/submit")
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(request_body))
                        .unwrap(),
                    state,
                )
                .await
                .unwrap()
            }
        });

        let response_one = task_one.await.unwrap();
        let response_two = task_two.await.unwrap();

        assert_eq!(response_one.status(), StatusCode::OK);
        assert_eq!(response_two.status(), StatusCode::OK);
        assert_eq!(executor.call_count(), 1);

        let replay_headers = [
            response_one
                .headers()
                .get("X-Dubhe-Replayed")
                .and_then(|value| value.to_str().ok()),
            response_two
                .headers()
                .get("X-Dubhe-Replayed")
                .and_then(|value| value.to_str().ok()),
        ];
        assert_eq!(
            replay_headers
                .iter()
                .filter(|header| header == &&Some("true"))
                .count(),
            1
        );

        let shared_nonce = current_account_nonce(&state_two, &request.sender)
            .await
            .unwrap();
        assert_eq!(shared_nonce, 1);

        let replay_key = submit_replay_key(&request).unwrap();
        let replay_entry = state_one
            .submit_coordinator
            .as_ref()
            .unwrap()
            .replay_entry(&replay_key)
            .await
            .unwrap();
        assert!(replay_entry.is_some());

        clear_test_redis_namespace(&redis_url, &key_prefix)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn test_submit_batch_processes_requests_sequentially() {
        let sender = "0x0000000000000000000000000000000000000000000000000000000000004242";
        let record_one = StoreSetRecord {
            dapp_key: "demo::dapp_key::DappKey".to_string(),
            table_id: "0xplayer-batch".to_string(),
            key_tuple: vec![b"position".to_vec(), vec![1]],
            value_tuple: vec![vec![1, 1]],
        };
        let record_two = StoreSetRecord {
            dapp_key: "demo::dapp_key::DappKey".to_string(),
            table_id: "0xplayer-batch".to_string(),
            key_tuple: vec![b"position".to_vec(), vec![2]],
            value_tuple: vec![vec![2, 2]],
        };
        let executor = Arc::new(FakeSubmitExecutor::new(vec![
            SubmitExecutionOutcome {
                sqls: vec!["noop-1".to_string()],
                store_set_records: vec![record_one.clone()],
                checkpoint_ts_ms: 10,
                cursor_opaque: "digest-batch-1".to_string(),
            },
            SubmitExecutionOutcome {
                sqls: vec!["noop-2".to_string()],
                store_set_records: vec![record_two.clone()],
                checkpoint_ts_ms: 11,
                cursor_opaque: "digest-batch-2".to_string(),
            },
        ]));
        let state = test_state_with_executor(executor.clone());

        let response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/submit_batch")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&SubmitBatchRequest {
                        requests: vec![
                            test_submit_request(sender, 1, [4, 2, 1]),
                            test_submit_request(sender, 2, [4, 2, 2]),
                        ],
                    })
                    .unwrap(),
                ))
                .unwrap(),
            state.clone(),
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body()).await.unwrap();
        let payload: SubmitBatchResponse = serde_json::from_slice(&body).unwrap();
        assert!(payload.success);
        assert_eq!(payload.data.len(), 2);
        assert!(payload.data.iter().all(|item| item.success));
        assert!(payload.data.iter().all(|item| !item.replayed));
        assert_eq!(executor.call_count(), 2);
        assert_eq!(
            state.account_nonce.read().await.get(sender).copied(),
            Some(2)
        );

        let data = state.data.read().await;
        assert_eq!(
            data.get(&data_key_from_store_set_record(&record_one))
                .cloned(),
            Some(record_one.value_tuple.clone())
        );
        assert_eq!(
            data.get(&data_key_from_store_set_record(&record_two))
                .cloned(),
            Some(record_two.value_tuple.clone())
        );
    }

    #[tokio::test]
    async fn test_submit_batch_stops_on_first_failed_item() {
        let sender = "0x0000000000000000000000000000000000000000000000000000000000005151";
        let executor = Arc::new(FakeSubmitExecutor::new(vec![SubmitExecutionOutcome {
            sqls: vec!["noop-1".to_string()],
            store_set_records: vec![StoreSetRecord {
                dapp_key: "demo::dapp_key::DappKey".to_string(),
                table_id: "0xplayer-batch-stop".to_string(),
                key_tuple: vec![b"position".to_vec(), vec![5]],
                value_tuple: vec![vec![5, 5]],
            }],
            checkpoint_ts_ms: 12,
            cursor_opaque: "digest-batch-stop-1".to_string(),
        }]));
        let state = test_state_with_executor(executor.clone());

        let response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/submit_batch")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&SubmitBatchRequest {
                        requests: vec![
                            test_submit_request(sender, 1, [5, 1, 1]),
                            test_submit_request(sender, 3, [5, 1, 3]),
                        ],
                    })
                    .unwrap(),
                ))
                .unwrap(),
            state.clone(),
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body()).await.unwrap();
        let payload: SubmitBatchResponse = serde_json::from_slice(&body).unwrap();
        assert!(!payload.success);
        assert_eq!(payload.message, "Submit batch stopped at item 1");
        assert_eq!(payload.data.len(), 2);
        assert!(payload.data[0].success);
        assert!(!payload.data[1].success);
        assert_eq!(payload.data[1].status, StatusCode::BAD_REQUEST.as_u16());
        assert!(payload.data[1].message.contains("Invalid nonce"));
        assert_eq!(executor.call_count(), 1);
        assert_eq!(
            state.account_nonce.read().await.get(sender).copied(),
            Some(1)
        );
    }

    #[tokio::test]
    async fn test_submit_batch_duplicate_request_replays_cached_successes() {
        let sender = "0x0000000000000000000000000000000000000000000000000000000000006161";
        let executor = Arc::new(FakeSubmitExecutor::new(vec![
            SubmitExecutionOutcome {
                sqls: vec!["noop-1".to_string()],
                store_set_records: vec![StoreSetRecord {
                    dapp_key: "demo::dapp_key::DappKey".to_string(),
                    table_id: "0xplayer-batch-replay".to_string(),
                    key_tuple: vec![b"position".to_vec(), vec![6]],
                    value_tuple: vec![vec![6, 1]],
                }],
                checkpoint_ts_ms: 13,
                cursor_opaque: "digest-batch-replay-1".to_string(),
            },
            SubmitExecutionOutcome {
                sqls: vec!["noop-2".to_string()],
                store_set_records: vec![StoreSetRecord {
                    dapp_key: "demo::dapp_key::DappKey".to_string(),
                    table_id: "0xplayer-batch-replay".to_string(),
                    key_tuple: vec![b"position".to_vec(), vec![7]],
                    value_tuple: vec![vec![6, 2]],
                }],
                checkpoint_ts_ms: 14,
                cursor_opaque: "digest-batch-replay-2".to_string(),
            },
        ]));
        let state = test_state_with_executor(executor.clone());
        let batch_request = SubmitBatchRequest {
            requests: vec![
                test_submit_request(sender, 1, [6, 1, 1]),
                test_submit_request(sender, 2, [6, 1, 2]),
            ],
        };

        let first_response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/submit_batch")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&batch_request).unwrap()))
                .unwrap(),
            state.clone(),
        )
        .await
        .unwrap();
        assert_eq!(first_response.status(), StatusCode::OK);
        let first_body = to_bytes(first_response.into_body()).await.unwrap();
        let first_payload: SubmitBatchResponse = serde_json::from_slice(&first_body).unwrap();
        assert!(first_payload.success);
        assert!(first_payload.data.iter().all(|item| !item.replayed));

        let replay_response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/submit_batch")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(serde_json::to_vec(&batch_request).unwrap()))
                .unwrap(),
            state,
        )
        .await
        .unwrap();
        assert_eq!(replay_response.status(), StatusCode::OK);
        let replay_body = to_bytes(replay_response.into_body()).await.unwrap();
        let replay_payload: SubmitBatchResponse = serde_json::from_slice(&replay_body).unwrap();
        assert!(replay_payload.success);
        assert_eq!(replay_payload.data.len(), 2);
        assert!(replay_payload.data.iter().all(|item| item.success));
        assert!(replay_payload.data.iter().all(|item| item.replayed));
        assert_eq!(executor.call_count(), 2);
    }

    #[tokio::test]
    async fn test_v2_subscribe_then_live_update_and_query_latest_snapshot() {
        let state = test_state();
        let record = StoreSetRecord {
            dapp_key: "demo::dapp_key::DappKey".to_string(),
            table_id: "0xplayer99".to_string(),
            key_tuple: vec![b"position".to_vec(), vec![7, 7]],
            value_tuple: vec![vec![9, 9], vec![1, 2, 3]],
        };
        let data_key = data_key_from_store_set_record(&record);
        let table_key = to_v2_table_key(&data_key);
        let initial_value = vec![vec![0, 0], vec![0, 1]];
        state
            .data
            .write()
            .await
            .insert(data_key.clone(), initial_value.clone());

        let response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/subscribe")
                .header(CONTENT_TYPE, "application/json")
                .header("Accept", "text/event-stream")
                .body(Body::from(
                    serde_json::to_vec(&V2SubscribeRequest {
                        spec: table_key.to_subscription_spec(),
                    })
                    .unwrap(),
                ))
                .unwrap(),
            state.clone(),
        )
        .await
        .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let mut body = response.into_body();

        let initial_chunk = timeout(Duration::from_secs(1), body.data())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let initial_text = String::from_utf8(initial_chunk.to_vec()).unwrap();
        assert!(initial_text.contains(&serde_json::to_string(&initial_value).unwrap()));

        apply_store_set_record(
            &state,
            &record,
            123_456,
            Cursor {
                opaque: "digest-1".to_string(),
            },
        )
        .await;

        let live_chunk = timeout(Duration::from_secs(1), body.data())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let live_text = String::from_utf8(live_chunk.to_vec()).unwrap();
        assert!(live_text.contains(r#""topic":"table""#));
        assert!(live_text.contains(r#""account":"player99""#));
        assert!(live_text.contains(&serde_json::to_string(&record.value_tuple).unwrap()));

        let cached = state
            .v2_runtime
            .query(&v2_auth_context(), table_key.to_snapshot_query())
            .await
            .unwrap();
        assert!(cached.found);
        assert_eq!(cached.cursor.unwrap().opaque, "digest-1");
        assert_eq!(
            cached.data.unwrap()["value"],
            serde_json::to_value(record.value_tuple.clone()).unwrap()
        );

        let query_response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/query")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&V2QueryRequest {
                        query: table_key.to_snapshot_query(),
                    })
                    .unwrap(),
                ))
                .unwrap(),
            state,
        )
        .await
        .unwrap();

        assert_eq!(query_response.status(), StatusCode::OK);
        let body = to_bytes(query_response.into_body()).await.unwrap();
        let payload: SnapshotResult = serde_json::from_slice(&body).unwrap();
        assert!(payload.found);
        assert_eq!(
            payload.data.unwrap()["value"],
            serde_json::to_value(record.value_tuple).unwrap()
        );
    }

    #[tokio::test]
    async fn test_v2_publish_route_emits_subscription_event() {
        let state = test_state();
        let subscribe_response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/subscribe")
                .header(CONTENT_TYPE, "application/json")
                .header("Accept", "text/event-stream")
                .body(Body::from(
                    serde_json::to_vec(&V2SubscribeRequest {
                        spec: SubscriptionSpec {
                            topics: vec!["movement_intent".to_string()],
                            filters: {
                                let mut filters = BTreeMap::new();
                                filters.insert(
                                    "dapp_key".to_string(),
                                    FilterValue::String("demo::dapp_key::DappKey".to_string()),
                                );
                                filters
                            },
                            cursor: None,
                            semantics: dubhe_channel_core::DeliverySemantics::Ephemeral,
                        },
                    })
                    .unwrap(),
                ))
                .unwrap(),
            state.clone(),
        )
        .await
        .unwrap();

        assert_eq!(subscribe_response.status(), StatusCode::OK);
        let mut subscribe_body = subscribe_response.into_body();

        let publish_response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/publish")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&V2PublishRequest {
                        event: EventEnvelope {
                            id: String::new(),
                            topic: "movement_intent".to_string(),
                            partition_key: "0xplayer-intent".to_string(),
                            kind: "move".to_string(),
                            ts_ms: 0,
                            payload: json!({
                                "player": "0xplayer-intent",
                                "x": 7,
                                "y": 11,
                                "direction": "RIGHT",
                            }),
                            metadata: {
                                let mut metadata = BTreeMap::new();
                                metadata.insert(
                                    "dapp_key".to_string(),
                                    "demo::dapp_key::DappKey".to_string(),
                                );
                                metadata
                                    .insert("player".to_string(), "0xplayer-intent".to_string());
                                metadata
                            },
                        },
                    })
                    .unwrap(),
                ))
                .unwrap(),
            state,
        )
        .await
        .unwrap();

        assert_eq!(publish_response.status(), StatusCode::OK);
        let publish_body = to_bytes(publish_response.into_body()).await.unwrap();
        let published_event: EventEnvelope = serde_json::from_slice(&publish_body).unwrap();
        assert_eq!(published_event.topic, "movement_intent");
        assert_eq!(published_event.kind, "move");
        assert!(!published_event.id.is_empty());
        assert!(published_event.ts_ms > 0);

        let live_chunk = timeout(Duration::from_secs(1), subscribe_body.data())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let live_text = String::from_utf8(live_chunk.to_vec()).unwrap();
        assert!(live_text.contains(r#""topic":"movement_intent""#));
        assert!(live_text.contains(r#""kind":"move""#));
        assert!(live_text.contains(r#""partition_key":"0xplayer-intent""#));
        assert!(live_text.contains(r#""direction":"RIGHT""#));
        assert!(live_text.contains(r#""dapp_key":"demo::dapp_key::DappKey""#));
    }

    #[tokio::test]
    async fn test_v2_submit_route_updates_snapshot_and_emits_subscription_event() {
        let record = StoreSetRecord {
            dapp_key: "demo::dapp_key::DappKey".to_string(),
            table_id: "0xplayer-submit".to_string(),
            key_tuple: vec![b"position".to_vec(), vec![8, 8]],
            value_tuple: vec![vec![4, 5], vec![6, 7]],
        };
        let data_key = data_key_from_store_set_record(&record);
        let table_key = to_v2_table_key(&data_key);
        let state = test_state_with_executor(Arc::new(FakeSubmitExecutor::new(vec![
            SubmitExecutionOutcome {
                sqls: vec!["noop".to_string()],
                store_set_records: vec![record.clone()],
                checkpoint_ts_ms: 777,
                cursor_opaque: "digest-submit-1".to_string(),
            },
        ])));

        let subscribe_response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/subscribe")
                .header(CONTENT_TYPE, "application/json")
                .header("Accept", "text/event-stream")
                .body(Body::from(
                    serde_json::to_vec(&V2SubscribeRequest {
                        spec: SubscriptionSpec {
                            topics: vec!["table".to_string()],
                            filters: {
                                let mut filters = BTreeMap::new();
                                filters.insert(
                                    "dapp_key".to_string(),
                                    FilterValue::String(record.dapp_key.clone()),
                                );
                                filters.insert(
                                    "account".to_string(),
                                    FilterValue::StringList(vec![data_key.account.clone()]),
                                );
                                filters.insert(
                                    "table".to_string(),
                                    FilterValue::String(data_key.table.clone()),
                                );
                                filters.insert(
                                    "key".to_string(),
                                    FilterValue::String(
                                        serde_json::to_string(&data_key.key).unwrap(),
                                    ),
                                );
                                filters
                            },
                            cursor: None,
                            semantics: dubhe_channel_core::DeliverySemantics::AtLeastOnce,
                        },
                    })
                    .unwrap(),
                ))
                .unwrap(),
            state.clone(),
        )
        .await
        .unwrap();

        assert_eq!(subscribe_response.status(), StatusCode::OK);
        let mut subscribe_body = subscribe_response.into_body();

        let submit_response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/submit")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&SubmitRequest {
                        chain: "sui".to_string(),
                        sender:
                            "0x0000000000000000000000000000000000000000000000000000000000009999"
                                .to_string(),
                        nonce: Some(1),
                        ptb: PtbJson {
                            version: 1,
                            sender: None,
                            expiration: None,
                            gas_data: None,
                            inputs: vec![PtbInput::Pure {
                                data: PureData {
                                    pure: PureInner {
                                        bytes: base64::engine::general_purpose::STANDARD
                                            .encode([1u8, 2, 3]),
                                    },
                                },
                            }],
                            commands: vec![],
                        },
                        signature: None,
                    })
                    .unwrap(),
                ))
                .unwrap(),
            state.clone(),
        )
        .await
        .unwrap();

        assert_eq!(submit_response.status(), StatusCode::OK);
        let submit_body = to_bytes(submit_response.into_body()).await.unwrap();
        let submit_payload: serde_json::Value = serde_json::from_slice(&submit_body).unwrap();
        assert_eq!(submit_payload["success"], true);
        assert_eq!(submit_payload["data"]["sql_count"], 1);

        let live_chunk = timeout(Duration::from_secs(1), subscribe_body.data())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let live_text = String::from_utf8(live_chunk.to_vec()).unwrap();
        assert!(live_text.contains(r#""topic":"table""#));
        assert!(live_text.contains(r#""account":"player-submit""#));
        assert!(live_text.contains(&serde_json::to_string(&record.value_tuple).unwrap()));

        let query_response = handle_request(
            Request::builder()
                .method(hyper::Method::POST)
                .uri("/v2/query")
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&V2QueryRequest {
                        query: table_key.to_snapshot_query(),
                    })
                    .unwrap(),
                ))
                .unwrap(),
            state.clone(),
        )
        .await
        .unwrap();

        assert_eq!(query_response.status(), StatusCode::OK);
        let query_body = to_bytes(query_response.into_body()).await.unwrap();
        let query_payload: SnapshotResult = serde_json::from_slice(&query_body).unwrap();
        assert!(query_payload.found);
        assert_eq!(
            query_payload.data.unwrap()["value"],
            serde_json::to_value(record.value_tuple.clone()).unwrap()
        );

        let next_nonce = state
            .account_nonce
            .read()
            .await
            .get("0x0000000000000000000000000000000000000000000000000000000000009999")
            .copied();
        assert_eq!(next_nonce, Some(1));

        let cached = state
            .v2_runtime
            .query(&v2_auth_context(), table_key.to_snapshot_query())
            .await
            .unwrap();
        assert_eq!(cached.cursor.unwrap().opaque, "digest-submit-1");
    }
}
