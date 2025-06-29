mod event;
mod dynamic_table;

pub use event::{StoreRegisterTable, StorageSetRecord, StoreSetField};
pub use dynamic_table::DynamicTable;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Event error: {0}")]
    Event(String),
    
    #[error("Table error: {0}")]
    Table(String),
    
    #[error(transparent)]
    Other(#[from] anyhow::Error),
} 