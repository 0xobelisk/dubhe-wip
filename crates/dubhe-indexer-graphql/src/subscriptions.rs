use async_graphql::{Context, SimpleObject, Subscription};
use futures_util::Stream;
use std::pin::Pin;
use uuid::Uuid;
use crate::TableSubscribers;
use tokio::sync::mpsc;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;

/// 订阅根类型
pub struct SubscriptionRoot {
    subscribers: TableSubscribers,
    graphql_subscribers: Arc<RwLock<HashMap<String, Vec<mpsc::UnboundedSender<TableChange>>>>>,
}

impl SubscriptionRoot {
    pub fn new(subscribers: TableSubscribers) -> Self {
        Self { 
            subscribers,
            graphql_subscribers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 获取 GraphQL 订阅者管理器
    pub fn get_graphql_subscribers(&self) -> Arc<RwLock<HashMap<String, Vec<mpsc::UnboundedSender<TableChange>>>>> {
        self.graphql_subscribers.clone()
    }
}

#[Subscription]
impl SubscriptionRoot {
    /// 订阅表数据变化
    async fn tableChanges(
        &self,
        _ctx: &Context<'_>,
        table_name: String,
    ) -> Pin<Box<dyn Stream<Item = TableChange> + Send>> {
        let graphql_subscribers = self.graphql_subscribers.clone();
        
        let stream = async_stream::stream! {
            // 为这个订阅创建一个发送者
            let (tx, mut rx) = mpsc::unbounded_channel::<TableChange>();
            
            // 将发送者添加到订阅者列表
            {
                let mut subscribers = graphql_subscribers.write().await;
                subscribers.entry(table_name.clone()).or_insert_with(Vec::new).push(tx);
            }
            
            // 监听来自 worker 的数据
            while let Some(change) = rx.recv().await {
                yield change;
            }
        };

        Box::pin(stream)
    }

    /// 订阅事件流
    async fn events(
        &self,
        _ctx: &Context<'_>,
    ) -> Pin<Box<dyn Stream<Item = Event> + Send>> {
        let stream = async_stream::stream! {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(2));
            
            loop {
                interval.tick().await;
                
                yield Event {
                    id: Uuid::new_v4().to_string(),
                    event_type: "move_event".to_string(),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    data: serde_json::json!({
                        "package_id": "0x123...",
                        "module": "counter",
                        "function": "increment",
                        "sequence_number": 12345
                    }),
                };
            }
        };

        Box::pin(stream)
    }

    /// 订阅检查点更新
    async fn checkpointUpdates(
        &self,
        _ctx: &Context<'_>,
    ) -> Pin<Box<dyn Stream<Item = CheckpointUpdate> + Send>> {
        let stream = async_stream::stream! {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(10));
            let mut sequence_number = 1000;
            
            loop {
                interval.tick().await;
                sequence_number += 1;
                
                yield CheckpointUpdate {
                    sequence_number,
                    digest: format!("0x{:x}", Uuid::new_v4().as_u128()),
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    transactions_count: ((sequence_number % 100) + 50) as i32,
                };
            }
        };

        Box::pin(stream)
    }
}

/// 表变化事件
#[derive(SimpleObject, Clone)]
pub struct TableChange {
    pub id: String,
    pub table_name: String,
    pub operation: String,
    pub timestamp: String,
    pub data: serde_json::Value,
}

/// 事件
#[derive(SimpleObject)]
pub struct Event {
    pub id: String,
    pub event_type: String,
    pub timestamp: String,
    pub data: serde_json::Value,
}

/// 检查点更新
#[derive(SimpleObject)]
pub struct CheckpointUpdate {
    pub sequence_number: i64,
    pub digest: String,
    pub timestamp: String,
    pub transactions_count: i32,
} 