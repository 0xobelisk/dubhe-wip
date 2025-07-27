use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// GraphQL查询响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLResponse<T> {
    pub data: Option<T>,
    pub errors: Option<Vec<GraphQLError>>,
}

/// GraphQL错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLError {
    pub message: String,
    pub locations: Option<Vec<GraphQLLocation>>,
    pub path: Option<Vec<String>>,
}

/// GraphQL位置信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLLocation {
    pub line: i32,
    pub column: i32,
}

/// 表变化事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableChange {
    pub id: String,
    pub table_name: String,
    pub operation: String,
    pub timestamp: String,
    pub data: serde_json::Value,
}

/// 事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub id: String,
    pub event_type: String,
    pub timestamp: String,
    pub data: serde_json::Value,
}

/// 检查点更新
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointUpdate {
    pub sequence_number: i64,
    pub digest: String,
    pub timestamp: String,
    pub transactions_count: i32,
}

/// 查询响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResponse {
    pub table_id: String,
    pub data: Vec<serde_json::Value>,
    pub total_count: i64,
    pub limit: i32,
    pub offset: i32,
}

/// 表元数据响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableMetadataResponse {
    pub table_id: String,
    pub table_type: String,
    pub fields: Vec<TableField>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 表字段
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableField {
    pub name: String,
    pub field_type: String,
    pub is_key: bool,
    pub is_enum: bool,
}

/// 表列表响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListTablesResponse {
    pub tables: Vec<TableInfo>,
    pub total_count: i64,
}

/// 表信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub table_id: String,
    pub table_type: String,
    pub field_count: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
} 