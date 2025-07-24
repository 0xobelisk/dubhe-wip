mod traits;
mod sqlite;
mod postgres;

pub use traits::Storage;
pub use sqlite::SqliteStorage;
pub use postgres::PostgresStorage;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::table::TableMetadata;
    use std::collections::HashMap;

    #[tokio::test]
    async fn test_sqlite_storage() {
        let storage = SqliteStorage::new("sqlite::memory:").await.unwrap();
        
        // Test basic connection
        storage.execute("SELECT 1").await.unwrap();
        
        // Test table creation
        let table = TableMetadata {
            name: "test_table".to_string(),
            table_type: "component".to_string(),
            fields: vec![
                crate::table::TableField {
                    field_name: "id".to_string(),
                    field_type: "u64".to_string(),
                    field_index: 0,
                    is_key: true,
                    is_enum: false,
                },
                crate::table::TableField {
                    field_name: "name".to_string(),
                    field_type: "String".to_string(),
                    field_index: 1,
                    is_key: false,
                    is_enum: false,
                },
            ],
            enums: HashMap::new(),
            offchain: false,
        };
        
        storage.create_tables(&[table]).await.unwrap();
    }

    #[tokio::test]
    async fn test_postgres_storage() {
        // Skip if no PostgreSQL connection available
        if std::env::var("DATABASE_URL").is_err() {
            return;
        }
        
        let db_url = std::env::var("DATABASE_URL").unwrap();
        let storage = PostgresStorage::new(&db_url).await.unwrap();
        
        // Test basic connection
        storage.execute("SELECT 1").await.unwrap();
        
        // Test table creation
        let table = TableMetadata {
            name: "test_table".to_string(),
            table_type: "component".to_string(),
            fields: vec![
                crate::table::TableField {
                    field_name: "id".to_string(),
                    field_type: "u64".to_string(),
                    field_index: 0,
                    is_key: true,
                    is_enum: false,
                },
                crate::table::TableField {
                    field_name: "name".to_string(),
                    field_type: "String".to_string(),
                    field_index: 1,
                    is_key: false,
                    is_enum: false,
                },
            ],
            enums: HashMap::new(),
            offchain: false,
        };
        
        storage.create_tables(&[table]).await.unwrap();
    }
} 