use serde::{Deserialize, Serialize};
use std::env;

/// GraphQL服务器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLConfig {
    /// 服务器端口
    pub port: u16,
    /// 数据库连接URL
    pub database_url: String,
    /// 数据库schema
    pub schema: String,
    /// GraphQL端点路径
    pub endpoint: String,
    /// 是否启用CORS
    pub cors: bool,
    /// 是否启用订阅
    pub subscriptions: bool,
    /// 环境模式
    pub env: String,
    /// 是否启用调试模式
    pub debug: bool,
    /// 查询超时时间（毫秒）
    pub query_timeout: u64,
    /// 最大连接数
    pub max_connections: u32,
    /// 心跳间隔（毫秒）
    pub heartbeat_interval: u64,
    /// 是否启用指标
    pub enable_metrics: bool,
    /// 是否启用实时查询
    pub enable_live_queries: bool,
    /// 是否启用PostgreSQL订阅
    pub enable_pg_subscriptions: bool,
    /// 是否启用原生WebSocket
    pub enable_native_websocket: bool,
    /// 实时端口
    pub realtime_port: Option<u16>,
}

impl Default for GraphQLConfig {
    fn default() -> Self {
        Self {
            port: get_env_u16("GRAPHQL_PORT", 4000),
            database_url: get_env_string("DATABASE_URL", "postgres://postgres:postgres@127.0.0.1:5432/postgres"),
            schema: get_env_string("PG_SCHEMA", "public"),
            endpoint: get_env_string("GRAPHQL_ENDPOINT", "/graphql"),
            cors: get_env_bool("ENABLE_CORS", true),
            subscriptions: get_env_bool("ENABLE_SUBSCRIPTIONS", true),
            env: get_env_string("NODE_ENV", "development"),
            debug: get_env_bool("DEBUG", false),
            query_timeout: get_env_u64("QUERY_TIMEOUT", 30000),
            max_connections: get_env_u32("MAX_CONNECTIONS", 1000),
            heartbeat_interval: get_env_u64("HEARTBEAT_INTERVAL", 30000),
            enable_metrics: get_env_bool("ENABLE_METRICS", true),
            enable_live_queries: get_env_bool("ENABLE_LIVE_QUERIES", true),
            enable_pg_subscriptions: get_env_bool("ENABLE_PG_SUBSCRIPTIONS", true),
            enable_native_websocket: get_env_bool("ENABLE_NATIVE_WEBSOCKET", true),
            realtime_port: get_env_u16_opt("REALTIME_PORT"),
        }
    }
}

impl GraphQLConfig {
    /// 从环境变量创建配置
    pub fn from_env() -> Self {
        Self::default()
    }

    /// 获取GraphQL端点URL
    pub fn graphql_endpoint(&self) -> String {
        format!("http://localhost:{}{}", self.port, self.endpoint)
    }

    /// 获取WebSocket端点URL
    pub fn websocket_endpoint(&self) -> String {
        format!("ws://localhost:{}{}", self.port, self.endpoint)
    }

    /// 获取健康检查端点
    pub fn health_endpoint(&self) -> String {
        format!("http://localhost:{}/health", self.port)
    }

    /// 获取Playground端点
    pub fn playground_endpoint(&self) -> String {
        format!("http://localhost:{}/playground", self.port)
    }

    /// 获取订阅配置
    pub fn subscription_config(&self) -> SubscriptionConfig {
        SubscriptionConfig {
            enabled: self.subscriptions,
            method: "pg-subscriptions".to_string(),
            graphql_endpoint: self.graphql_endpoint(),
            subscription_endpoint: self.websocket_endpoint(),
        }
    }
}

/// 订阅配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionConfig {
    pub enabled: bool,
    pub method: String,
    pub graphql_endpoint: String,
    pub subscription_endpoint: String,
}

// 辅助函数
fn get_env_string(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_string())
}

fn get_env_u16(key: &str, default: u16) -> u16 {
    env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

fn get_env_u16_opt(key: &str) -> Option<u16> {
    env::var(key).ok().and_then(|s| s.parse().ok())
}

fn get_env_u32(key: &str, default: u32) -> u32 {
    env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

fn get_env_u64(key: &str, default: u64) -> u64 {
    env::var(key)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(default)
}

fn get_env_bool(key: &str, default: bool) -> bool {
    env::var(key)
        .ok()
        .map(|s| s.to_lowercase() == "true")
        .unwrap_or(default)
} 