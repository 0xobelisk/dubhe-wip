mod traits;
mod sqlite;
mod postgres;

pub use traits::Storage;
use crate::{config::Settings, error::Result};

pub async fn new(settings: &Settings) -> Result<Box<dyn Storage>> {
    match settings.database.db_type.as_str() {
        "sqlite" => Ok(Box::new(sqlite::SqliteStorage::new(&settings.database.url)
            .map_err(|e| crate::error::Error::database(e.to_string()))?)),
        // "postgres" => Ok(Box::new(postgres::PostgresStorage::new(settings).await?)),
        _ => Err(crate::error::Error::database(format!(
            "Unsupported database type: {}", 
            settings.database.db_type
        ))),
    }
} 