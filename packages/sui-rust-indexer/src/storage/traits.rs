use async_trait::async_trait;
use serde_json::Value;
use crate::error::Result;

#[async_trait]
pub trait Storage: Send + Sync {
    /// Execute SQL statement
    async fn execute(&self, sql: &str) -> Result<()>;
    
    /// Query data and return JSON results
    async fn query(&self, sql: &str) -> Result<Vec<Value>>;
    
    /// Begin transaction
    async fn begin_transaction(&self) -> Result<()>;
    
    /// Commit transaction
    async fn commit_transaction(&self) -> Result<()>;
    
    /// Rollback transaction
    async fn rollback_transaction(&self) -> Result<()>;
} 