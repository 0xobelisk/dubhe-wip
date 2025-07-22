use serde::{Deserialize, Serialize};

/// A single record in the registry.
#[derive(Debug, Serialize, Deserialize, Clone, Eq, PartialEq)]
pub struct StoreSetRecord {
    pub dapp_key: String,
    pub table_id: String,
    pub key_tuple: Vec<Vec<u8>>,
    pub value_tuple: Vec<Vec<u8>>,
}

/// A single record in the registry.
#[derive(Debug, Serialize, Deserialize, Clone, Eq, PartialEq)]
pub struct StoreSetField {
    pub dapp_key: String,
    pub table_id: String,
    pub key_tuple: Vec<Vec<u8>>,
    pub field_index: u8,
    pub value: Vec<u8>,
}

/// A single record in the registry.
#[derive(Debug, Serialize, Deserialize, Clone, Eq, PartialEq)]
pub struct StoreDeleteRecord {
    pub dapp_key: String,
    pub table_id: String,
    pub key_tuple: Vec<Vec<u8>>,
}
