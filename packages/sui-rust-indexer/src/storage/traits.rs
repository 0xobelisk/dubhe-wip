use async_trait::async_trait;
use serde_json::Value;
use crate::error::Result;
use crate::config::TableMetadata;

#[async_trait]
pub trait Storage: Send + Sync {
    /// Execute SQL statement
    async fn execute(&self, sql: &str) -> Result<()>;

    /// Create tables from configuration
    async fn create_tables(&self, tables: &[TableMetadata]) -> Result<()>;
    
    /// Insert data into a table
    async fn insert(&self, table_name: &str, data: &Value) -> Result<()>;
} 