use rusqlite::{Connection, Result as SqlResult};
use crate::storage::Storage;
use async_trait::async_trait;
use crate::error::{Error, Result};
use tokio::sync::Mutex;
use std::sync::Arc;
use serde_json::Value;

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

    async fn rows_to_json(&self, sql: &str) -> Result<Vec<Value>> {
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(sql)
            .map_err(|e| Error::database(e.to_string()))?;
        
        let column_names: Vec<String> = stmt.column_names()
            .into_iter()
            .map(|s| s.to_string())
            .collect();
            
        let rows = stmt.query_map([], |row| {
            let mut map = serde_json::Map::new();
            for (i, column_name) in column_names.iter().enumerate() {
                let value: rusqlite::types::Value = row.get(i)
                    .unwrap_or(rusqlite::types::Value::Null);
                map.insert(
                    column_name.clone(),
                    match value {
                        rusqlite::types::Value::Null => Value::Null,
                        rusqlite::types::Value::Integer(i) => Value::Number(i.into()),
                        rusqlite::types::Value::Real(f) => {
                            if let Some(num) = serde_json::Number::from_f64(f) {
                                Value::Number(num)
                            } else {
                                Value::Null
                            }
                        },
                        rusqlite::types::Value::Text(s) => Value::String(s),
                        rusqlite::types::Value::Blob(b) => Value::String(hex::encode(b)),
                    },
                );
            }
            Ok(Value::Object(map))
        })
        .map_err(|e| Error::database(e.to_string()))?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| Error::database(e.to_string()))?);
        }
        Ok(result)
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

    async fn query(&self, sql: &str) -> Result<Vec<Value>> {
        self.rows_to_json(sql).await
    }

    async fn begin_transaction(&self) -> Result<()> {
        self.execute("BEGIN TRANSACTION").await
    }

    async fn commit_transaction(&self) -> Result<()> {
        self.execute("COMMIT TRANSACTION").await
    }

    async fn rollback_transaction(&self) -> Result<()> {
        self.execute("ROLLBACK TRANSACTION").await
    }
}