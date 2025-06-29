use std::sync::Arc;
use tokio::net::TcpListener;
use tonic::transport::Server as TonicServer;
use crate::{config::Settings, storage::Storage};
use super::Error;

pub struct Server {
    storage: Arc<Box<dyn Storage>>,
    settings: Settings,
}

impl Server {
    pub fn new(storage: Box<dyn Storage>, settings: &Settings) -> Self {
        Self {
            storage: Arc::new(storage),
            settings: settings.clone(),
        }
    }
    
    pub async fn serve(&self) -> Result<(), Error> {
        let addr = self.settings.grpc.addr.parse()
            .map_err(|e| Error::Grpc(format!("Invalid address: {}", e)))?;
            
        let listener = TcpListener::bind(&addr).await
            .map_err(|e| Error::Grpc(format!("Failed to bind address: {}", e)))?;
            
        // TODO: Implement GRPC service
        
        Ok(())
    }
} 