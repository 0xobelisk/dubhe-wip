use sqlx::{Pool, Sqlite, SqlitePool};
use crate::db::{self, Storage};
use async_trait::async_trait;
use anyhow::Result;
use crate::table::TableMetadata;

pub struct SqliteStorage {
    pool: Pool<Sqlite>,
}

impl SqliteStorage {
    pub async fn new(db_url: &str) -> Result<Self> {
        // Connect to the SQLite database
        // If the database file does not exist, it will be created automatically
        // Note: For SQLite, the db_url can be a file path or "sqlite::memory:" for in-memory database

        log::info!("Connecting to SQLite database at {}", db_url);
        if db_url.is_empty() || !db_url.starts_with("sqlite:") {
            return Err(anyhow::anyhow!("Database URL cannot be empty or must start with 'sqlite:'"));
        }
        if db_url == "sqlite::memory:" {
            log::info!("Using in-memory SQLite database");
        } else {
            let db_file_path = db_url.strip_prefix("sqlite:").unwrap_or(db_url);
            log::info!("Using SQLite database file at {}", db_file_path);
            // Check if the file exists, if not it will be created
            if !std::path::Path::new(db_file_path).exists() {
                log::warn!("Database file does not exist, it will be created at {}", db_file_path);
                // Create the file if it doesn't exist, for example /tmp/indexer.db
                std::fs::File::create(db_file_path)?;
                log::info!("Created directory for SQLite database at {}", db_file_path);
            }
        }
        let pool = SqlitePool::connect(db_url).await?;
        Ok(Self { pool })
    }

    pub fn generate_create_table_sql(&self, table: &TableMetadata) -> String {
        let mut sql = String::new();
        sql.push_str(&format!("CREATE TABLE IF NOT EXISTS {} (\n", table.name));
        
        let mut field_definitions = Vec::new();
        
        // Add all fields
        for field in &table.fields {
            let sql_type = self.get_sql_type(&field.field_type);
            field_definitions.push(format!("    {} {}", field.field_name, sql_type));
        }
        
        // Add system fields for tracking
        field_definitions.push("    created_at DATETIME DEFAULT CURRENT_TIMESTAMP".to_string());
        field_definitions.push("    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP".to_string());
        field_definitions.push("    last_updated_checkpoint INTEGER".to_string());
        field_definitions.push("    is_deleted BOOLEAN DEFAULT 0".to_string());
        
        // Join all field definitions
        sql.push_str(&field_definitions.join(",\n"));
        
        // Add primary key if we have key fields
        let key_fields: Vec<_> = table.fields.iter()
            .filter(|f| f.is_key)
            .map(|f| f.field_name.clone())
            .collect();
            
        if !key_fields.is_empty() {
            sql.push_str(",\n    PRIMARY KEY (");
            sql.push_str(&key_fields.join(", "));
            sql.push(')');
        }
        
        sql.push_str("\n)");
        sql
    }

    fn get_sql_type(&self, type_: &str) -> String {
        match type_ {
            "u8" => "INTEGER",
            "u16" => "INTEGER", 
            "u32" => "INTEGER",
            "u64" => "INTEGER",
            "u128" => "TEXT",
            "u256" => "TEXT",
            "vector<u8>" => "TEXT", // SQLite doesn't support arrays, store as JSON
            "vector<u16>" => "TEXT",
            "vector<u32>" => "TEXT",
            "vector<u64>" => "TEXT",
            "vector<u128>" => "TEXT",
            "vector<u256>" => "TEXT",
            "vector<bool>" => "TEXT",
            "vector<address>" => "TEXT",
            "bool" => "BOOLEAN",
            "address" => "TEXT",
            _ => "TEXT", // Default for enums and other types
        }
        .to_string()
    }
}

#[async_trait]
impl Storage for SqliteStorage {
    type Database = Sqlite;

    fn pool(&self) -> &Pool<Sqlite> {
        &self.pool
    }

    async fn execute(&self, sql: &str) -> Result<()> {
        sqlx::query(sql).execute(&self.pool).await?;
        Ok(())
    }

    async fn create_tables(&self, tables: &[TableMetadata]) -> Result<()> {
        for table in tables {
            let sql = self.generate_create_table_sql(table);
            log::debug!("Creating table with SQL: {}", sql);
            self.execute(&sql).await?;
        }
        Ok(())
    }

    fn generate_create_table_sql(&self, table: &TableMetadata) -> String {
        self.generate_create_table_sql(table)
    }

    async fn insert(&self, _table_name: &str, _data: &serde_json::Value) -> Result<()> {
        // TODO: Implement complex insert logic
        Ok(())
    }
}