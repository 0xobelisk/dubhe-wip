mod broker;
// mod client;

pub use broker::Broker;
// pub use client::Client;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("订阅错误: {0}")]
    Subscription(String),
    
    #[error("客户端错误: {0}")]
    Client(String),
    
    #[error(transparent)]
    Other(#[from] anyhow::Error),
} 