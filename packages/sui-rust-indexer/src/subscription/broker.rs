use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use std::collections::HashMap;
use serde_json::Value;
use crate::storage::Storage;
use super::{Client, Error};

pub struct Broker {
    storage: Arc<Box<dyn Storage>>,
    channels: Arc<RwLock<HashMap<String, broadcast::Sender<Value>>>>,
}

impl Broker {
    pub fn new(storage: Box<dyn Storage>) -> Self {
        Self {
            storage: Arc::new(storage),
            channels: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    pub async fn subscribe(&self, event_type: &str) -> Result<Client, Error> {
        let channels = self.channels.read().await;
        let sender = channels.get(event_type).cloned().ok_or_else(|| {
            Error::Subscription(format!("未知的事件类型: {}", event_type))
        })?;
        
        Ok(Client::new(sender.subscribe()))
    }
    
    pub async fn publish(&self, event_type: &str, data: Value) -> Result<(), Error> {
        let channels = self.channels.read().await;
        if let Some(sender) = channels.get(event_type) {
            sender.send(data).map_err(|e| {
                Error::Subscription(format!("发布事件失败: {}", e))
            })?;
        }
        Ok(())
    }
    
    pub async fn run(&self) -> Result<(), Error> {
        // TODO: 实现事件总线的主循环
        Ok(())
    }
} 