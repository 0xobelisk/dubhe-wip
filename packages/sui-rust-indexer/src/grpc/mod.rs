mod server;
// pub mod proto;

pub use server::Server;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("GRPC错误: {0}")]
    Grpc(String),
    
    #[error("协议错误: {0}")]
    Proto(String),
    
    #[error(transparent)]
    Other(#[from] anyhow::Error),
} 