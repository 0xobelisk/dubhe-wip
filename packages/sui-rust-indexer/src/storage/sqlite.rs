use rusqlite::{Connection, Result as SqlResult};
use crate::storage::Storage;
use async_trait::async_trait;
use crate::error::{Error, Result};
use tokio::sync::Mutex;
use std::sync::Arc;
use serde_json::Value;
use crate::config::TableMetadata;

pub struct SqliteStorage {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteStorage {
    pub fn new(db_path: &str) -> SqlResult<Self> {
        let conn = Connection::open(db_path)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn))
        })
    }

    pub fn generate_create_table_sql(&self, table: &TableMetadata) -> String {
        let mut sql = String::new();
        sql.push_str(&format!("CREATE TABLE IF NOT EXISTS {} (\n", table.name));
        
        let mut field_definitions = Vec::new();
        
        // Add key fields
        for field in &table.key_fields {
            field_definitions.push(format!("    {} {}", field.field_name, field.field_type));
        }
        
        // Add value fields
        for field in &table.value_fields {
            field_definitions.push(format!("    {} {}", field.field_name, field.field_type));
        }
        
        // Add system fields for tracking
        field_definitions.push("    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP".to_string());
        field_definitions.push("    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP".to_string());
        field_definitions.push("    last_updated_checkpoint BIGINT".to_string());
        field_definitions.push("    is_deleted BOOLEAN DEFAULT FALSE".to_string());
        
        // Join all field definitions
        sql.push_str(&field_definitions.join(",\n"));
        
        // Add primary key if we have key fields
        if !table.key_fields.is_empty() {
            sql.push_str(",\n    PRIMARY KEY (");
            sql.push_str(&table.key_fields
                .iter()
                .map(|f| f.field_name.clone())
                .collect::<Vec<String>>()
                .join(", "));
            sql.push(')');
        }
        
        sql.push_str("\n)");
        sql
    }
}

#[async_trait]
impl Storage for SqliteStorage {
    async fn execute(&self, sql: &str) -> Result<()> {
        let conn = self.conn.lock().await;
        conn.execute_batch(sql)
            .map_err(|e| Error::database(e.to_string()))?;
        Ok(())
    }

    async fn create_tables(&self, tables: &[TableMetadata]) -> Result<()> {
        for table in tables {
            println!("{}", self.generate_create_table_sql(table));
            self.execute(&self.generate_create_table_sql(table)).await?;
        }
        Ok(())
    }

    async fn insert(&self, table_name: &str, data: &Value) -> Result<()> {
        Ok(())
    }
}