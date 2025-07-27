use async_graphql::{Context, Object, SimpleObject};
use std::sync::Arc;
use crate::database::DatabasePool;

/// 查询根类型
#[derive(Default)]
pub struct QueryRoot {
    db_pool: Option<Arc<DatabasePool>>,
}

impl QueryRoot {
    pub fn new(db_pool: Option<Arc<DatabasePool>>) -> Self {
        Self { db_pool }
    }
}

#[Object]
impl QueryRoot {
    /// 获取服务器信息
    async fn server_info(&self) -> ServerInfo {
        ServerInfo {
            name: "Dubhe GraphQL Server".to_string(),
            version: "1.2.0-pre.56".to_string(),
            status: "running".to_string(),
        }
    }

    /// 获取数据库表列表
    async fn tables(&self, _ctx: &Context<'_>) -> Vec<TableInfo> {
        if let Some(db_pool) = &self.db_pool {
            match db_pool.get_tables().await {
                Ok(tables) => {
                    tables.into_iter().map(|table| TableInfo {
                        name: table.name,
                        schema: table.schema,
                        columns: table.columns.into_iter().map(|col| ColumnInfo {
                            name: col.name,
                            data_type: col.data_type,
                            is_nullable: col.is_nullable,
                        }).collect(),
                    }).collect()
                }
                Err(e) => {
                    log::error!("Failed to get tables: {}", e);
                    vec![]
                }
            }
        } else {
            // 如果没有数据库连接，返回示例数据
            vec![
                TableInfo {
                    name: "events".to_string(),
                    schema: "public".to_string(),
                    columns: vec![
                        ColumnInfo {
                            name: "id".to_string(),
                            data_type: "uuid".to_string(),
                            is_nullable: false,
                        },
                        ColumnInfo {
                            name: "event_type".to_string(),
                            data_type: "text".to_string(),
                            is_nullable: false,
                        },
                        ColumnInfo {
                            name: "data".to_string(),
                            data_type: "jsonb".to_string(),
                            is_nullable: true,
                        },
                    ],
                },
                TableInfo {
                    name: "checkpoints".to_string(),
                    schema: "public".to_string(),
                    columns: vec![
                        ColumnInfo {
                            name: "sequence_number".to_string(),
                            data_type: "bigint".to_string(),
                            is_nullable: false,
                        },
                        ColumnInfo {
                            name: "digest".to_string(),
                            data_type: "text".to_string(),
                            is_nullable: false,
                        },
                        ColumnInfo {
                            name: "timestamp".to_string(),
                            data_type: "timestamp".to_string(),
                            is_nullable: false,
                        },
                    ],
                },
            ]
        }
    }

    /// 获取表数据
    async fn table_data(&self, _ctx: &Context<'_>, table_name: String, limit: Option<i32>) -> TableData {
        if let Some(db_pool) = &self.db_pool {
            match db_pool.query_table_data(&table_name, limit).await {
                Ok(data) => {
                    let total_count = db_pool.get_table_count(&table_name).await.unwrap_or(0);
                    TableData {
                        table_name,
                        total_count: total_count as i32,
                        data,
                    }
                }
                Err(e) => {
                    log::error!("Failed to query table data: {}", e);
                    TableData {
                        table_name,
                        total_count: 0,
                        data: vec![],
                    }
                }
            }
        } else {
            // 如果没有数据库连接，返回示例数据
            TableData {
                table_name,
                total_count: 100,
                data: vec![
                    serde_json::json!({
                        "id": "123e4567-e89b-12d3-a456-426614174000",
                        "event_type": "move_event",
                        "data": {
                            "package_id": "0x123...",
                            "module": "counter",
                            "function": "increment"
                        }
                    }),
                    serde_json::json!({
                        "id": "456e7890-e89b-12d3-a456-426614174001",
                        "event_type": "checkpoint",
                        "data": {
                            "sequence_number": 12345,
                            "digest": "0xabc...",
                            "timestamp": "2024-01-01T00:00:00Z"
                        }
                    }),
                ],
            }
        }
    }

    /// 获取订阅状态
    async fn subscription_status(&self) -> SubscriptionStatus {
        SubscriptionStatus {
            enabled: true,
            method: "pg-subscriptions".to_string(),
            graphql_endpoint: "http://localhost:4000/graphql".to_string(),
            subscription_endpoint: "ws://localhost:4000/graphql".to_string(),
        }
    }
}

/// 服务器信息
#[derive(SimpleObject)]
pub struct ServerInfo {
    pub name: String,
    pub version: String,
    pub status: String,
}

/// 表信息
#[derive(SimpleObject)]
pub struct TableInfo {
    pub name: String,
    pub schema: String,
    pub columns: Vec<ColumnInfo>,
}

/// 列信息
#[derive(SimpleObject)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
}

/// 表数据
#[derive(SimpleObject)]
pub struct TableData {
    pub table_name: String,
    pub total_count: i32,
    pub data: Vec<serde_json::Value>,
}

/// 订阅状态
#[derive(SimpleObject)]
pub struct SubscriptionStatus {
    pub enabled: bool,
    pub method: String,
    pub graphql_endpoint: String,
    pub subscription_endpoint: String,
} 