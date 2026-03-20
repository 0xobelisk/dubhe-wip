use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DeliverySemantics {
    Ephemeral,
    SnapshotOnly,
    AtLeastOnce,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Cursor {
    pub opaque: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FilterValue {
    String(String),
    StringList(Vec<String>),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EventEnvelope {
    pub id: String,
    pub topic: String,
    pub partition_key: String,
    pub kind: String,
    pub ts_ms: u64,
    #[serde(default)]
    pub payload: Value,
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubscriptionSpec {
    #[serde(default)]
    pub topics: Vec<String>,
    #[serde(default)]
    pub filters: BTreeMap<String, FilterValue>,
    #[serde(default)]
    pub cursor: Option<Cursor>,
    pub semantics: DeliverySemantics,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SnapshotQuery {
    pub entity: String,
    pub key: String,
    #[serde(default)]
    pub scope: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SnapshotResult {
    pub found: bool,
    #[serde(default)]
    pub data: Option<Value>,
    #[serde(default)]
    pub cursor: Option<Cursor>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChannelCommand {
    pub name: String,
    #[serde(default)]
    pub payload: Value,
    #[serde(default)]
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AuthContext {
    #[serde(default)]
    pub subject: Option<String>,
    #[serde(default)]
    pub claims: BTreeMap<String, String>,
}
