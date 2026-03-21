// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

//! Dubhe Indexer Library
//!
//! 提供索引器的核心功能，包括：
//! - 事件处理和索引
//! - gRPC 和 GraphQL 服务
//! - Proxy 服务器
//! - Worker 管理

pub mod args;
pub mod config;
pub mod handlers;
pub mod proxy;
pub mod worker;

// 重新导出常用类型
use anyhow::Result;
pub use args::DubheIndexerArgs;
pub use config::DubheConfig;
pub use dubhe_common::StoreSetRecord;
use dubhe_common::{Database, DubheConfig as DubheConfigCommon};
pub use dubhe_indexer_graphql::TableChange;
pub use dubhe_indexer_grpc::types::TableChange as GrpcTableChange;
pub use handlers::DubheEventHandler;
pub use proxy::ProxyServer;
use rand::Rng;
use std::collections::HashMap;
use std::net::{SocketAddr, TcpListener};
use std::sync::Arc;
use sui_indexer_alt_framework::IndexerArgs as FrameworkIndexerArgs;
use tokio::sync::{mpsc, RwLock};
use url::Url;
pub use worker::{DubheIndexerWorker, GrpcSubscribers};

/// 订阅者类型别名
pub type GraphQLSubscribers = Arc<RwLock<HashMap<String, Vec<mpsc::UnboundedSender<TableChange>>>>>;

/// Indexer 核心功能结构体
pub struct DubheIndexer {
    pub grpc_subscribers: GrpcSubscribers,
    pub graphql_subscribers: GraphQLSubscribers,
}

impl DubheIndexer {
    /// 创建新的 Dubhe Indexer 实例
    pub fn new() -> Self {
        Self {
            grpc_subscribers: Arc::new(RwLock::new(HashMap::new())),
            graphql_subscribers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 获取 gRPC 订阅者
    pub fn grpc_subscribers(&self) -> GrpcSubscribers {
        self.grpc_subscribers.clone()
    }

    /// 获取 GraphQL 订阅者
    pub fn graphql_subscribers(&self) -> GraphQLSubscribers {
        self.graphql_subscribers.clone()
    }
}

impl Default for DubheIndexer {
    fn default() -> Self {
        Self::new()
    }
}

/// IndexerBuilder - 用于构建和启动 Dubhe Indexer 的统一接口
pub struct IndexerBuilder {
    args: DubheIndexerArgs,
    database: Option<Arc<Database>>,
    grpc_subscribers: GrpcSubscribers,
    graphql_subscribers: GraphQLSubscribers,
    config_json: Option<serde_json::Value>,
    dubhe_config: Option<DubheConfigCommon>,
}

impl IndexerBuilder {
    /// 创建新的 IndexerBuilder
    pub fn new(args: DubheIndexerArgs) -> Self {
        Self {
            args,
            database: None,
            grpc_subscribers: Arc::new(RwLock::new(HashMap::new())),
            graphql_subscribers: Arc::new(RwLock::new(HashMap::new())),
            config_json: None,
            dubhe_config: None,
        }
    }

    /// 使用现有的订阅者
    pub fn with_subscribers(
        mut self,
        grpc_subscribers: GrpcSubscribers,
        graphql_subscribers: GraphQLSubscribers,
    ) -> Self {
        self.grpc_subscribers = grpc_subscribers;
        self.graphql_subscribers = graphql_subscribers;
        self
    }

    /// 初始化数据库和配置
    pub async fn initialize(&mut self) -> Result<()> {
        // 加载配置
        let config_json = self.args.get_config_json()?;
        let dubhe_config = DubheConfigCommon::from_json(config_json.clone())?;

        // 创建数据库连接
        let database = Arc::new(Database::new(&self.args.database_url).await?);

        // 如果需要强制清空数据库
        if self.args.force {
            database.clear().await?;
        }

        self.config_json = Some(config_json);
        self.dubhe_config = Some(dubhe_config);
        self.database = Some(database);

        Ok(())
    }

    /// 构建并启动 Indexer Cluster
    pub async fn build_cluster(
        &self,
    ) -> Result<sui_indexer_alt_framework::cluster::IndexerCluster> {
        let dubhe_config = self
            .dubhe_config
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Must call initialize() first"))?;
        let database = self
            .database
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Must call initialize() first"))?;

        let (local_ingestion_path, remote_store_url) = self.args.get_checkpoint_url()?;

        let client_args = sui_indexer_alt_framework::ingestion::ClientArgs {
            local_ingestion_path,
            remote_store_url,
            ..Default::default()
        };

        let mut cluster = if !database.is_empty().await? {
            database.create_tables(dubhe_config).await?;
            let indexer_args = FrameworkIndexerArgs {
                first_checkpoint: Some(dubhe_config.start_checkpoint.parse::<u64>().unwrap()),
                ..Default::default()
            };
            println!(
                "🔄 Starting from first checkpoint: {}",
                dubhe_config.start_checkpoint
            );
            sui_indexer_alt_framework::cluster::IndexerCluster::builder()
                .with_indexer_args(indexer_args)
                .with_database_url(Url::parse(&self.args.database_url).unwrap())
                .with_client_args(client_args)
                .build()
                .await?
        } else {
            println!("📖 Continuing from last checkpoint...");
            sui_indexer_alt_framework::cluster::IndexerCluster::builder()
                .with_database_url(Url::parse(&self.args.database_url).unwrap())
                .with_client_args(client_args)
                .build()
                .await?
        };

        // 创建事件处理器
        let dubhe_event_handler = DubheEventHandler::new(
            dubhe_config.clone(),
            self.grpc_subscribers.clone(),
            self.graphql_subscribers.clone(),
        );

        // 注册 pipeline
        cluster
            .sequential_pipeline(dubhe_event_handler, Default::default())
            .await?;

        Ok(cluster)
    }

    /// 创建 ProxyServer
    pub async fn build_proxy_server(&self) -> Result<ProxyServer> {
        let config_json = self
            .config_json
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Must call initialize() first"))?;

        // 随机分配后端服务端口
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

        let server_addr = format!("0.0.0.0:{}", self.args.port).parse::<SocketAddr>()?;

        Ok(ProxyServer::new(
            server_addr,
            Some(grpc_backend_addr),
            Some(graphql_backend_addr),
            self.grpc_subscribers.clone(),
            self.graphql_subscribers.clone(),
            Arc::new(config_json.clone()),
        ))
    }

    /// 打印启动信息
    pub fn print_startup_info(&self, grpc_port: u16) {
        println!("\n🚀 Dubhe Indexer Starting...");
        println!("================================");
        println!("🌐 Proxy Server:     http://0.0.0.0:{}", self.args.port);
        println!("🔌 gRPC Service:     http://0.0.0.0:{} (direct)", grpc_port);
        println!(
            "   Via Proxy:        http://0.0.0.0:{}/dubhe_grpc.*",
            self.args.port
        );
        println!(
            "📊 GraphQL Endpoint: http://0.0.0.0:{}/graphql",
            self.args.port
        );
        println!(
            "🏠 Welcome Page:     http://0.0.0.0:{}/welcome",
            self.args.port
        );
        println!(
            "🎮 Playground:       http://0.0.0.0:{}/playground",
            self.args.port
        );
        println!(
            "💚 Health Check:     http://0.0.0.0:{}/health",
            self.args.port
        );
        println!(
            "📋 Metadata:         http://0.0.0.0:{}/metadata",
            self.args.port
        );
        println!("\n💡 For gRPC clients, use: http://localhost:{}", grpc_port);
    }

    /// 获取数据库引用
    pub fn database(&self) -> Option<Arc<Database>> {
        self.database.clone()
    }

    /// 获取配置
    pub fn dubhe_config(&self) -> Option<DubheConfigCommon> {
        self.dubhe_config.clone()
    }

    /// 获取配置 JSON
    pub fn config_json(&self) -> Option<serde_json::Value> {
        self.config_json.clone()
    }

    /// 获取 gRPC 订阅者
    pub fn grpc_subscribers(&self) -> GrpcSubscribers {
        self.grpc_subscribers.clone()
    }

    /// 获取 GraphQL 订阅者
    pub fn graphql_subscribers(&self) -> GraphQLSubscribers {
        self.graphql_subscribers.clone()
    }
}
