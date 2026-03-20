use dubhe_channel_core::{
    Cursor, DeliverySemantics, EventEnvelope, FilterValue, SnapshotQuery, SnapshotResult,
    SubscriptionSpec,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TableKey {
    pub dapp_key: String,
    pub account: String,
    pub table: String,
    pub key: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TableValue {
    pub value: Vec<Vec<u8>>,
}

impl TableKey {
    pub fn to_snapshot_query(&self) -> SnapshotQuery {
        SnapshotQuery {
            entity: "table".to_string(),
            key: serde_json::to_string(self).unwrap_or_default(),
            scope: BTreeMap::new(),
        }
    }

    pub fn to_subscription_spec(&self) -> SubscriptionSpec {
        let mut filters = BTreeMap::new();
        filters.insert(
            "dapp_key".to_string(),
            FilterValue::String(self.dapp_key.clone()),
        );
        filters.insert(
            "account".to_string(),
            FilterValue::String(self.account.clone()),
        );
        filters.insert("table".to_string(), FilterValue::String(self.table.clone()));
        filters.insert(
            "key".to_string(),
            FilterValue::String(serde_json::to_string(&self.key).unwrap_or_default()),
        );

        SubscriptionSpec {
            topics: vec!["table".to_string()],
            filters,
            cursor: None,
            semantics: DeliverySemantics::AtLeastOnce,
        }
    }
}

pub fn snapshot_result(value: Vec<Vec<u8>>, cursor: Option<Cursor>) -> SnapshotResult {
    SnapshotResult {
        found: true,
        data: Some(json!(TableValue { value })),
        cursor,
    }
}

pub fn event_from_table(key: &TableKey, value: Vec<Vec<u8>>, ts_ms: u64) -> EventEnvelope {
    let mut metadata = BTreeMap::new();
    metadata.insert("dapp_key".to_string(), key.dapp_key.clone());
    metadata.insert("account".to_string(), key.account.clone());
    metadata.insert("table".to_string(), key.table.clone());
    metadata.insert(
        "key".to_string(),
        serde_json::to_string(&key.key).unwrap_or_default(),
    );

    EventEnvelope {
        id: format!(
            "table:{}:{}:{}:{}",
            key.dapp_key, key.account, key.table, ts_ms
        ),
        topic: "table".to_string(),
        partition_key: format!("{}:{}:{}", key.dapp_key, key.account, key.table),
        kind: "table_update".to_string(),
        ts_ms,
        payload: json!({
            "data_key": key,
            "value": value,
        }),
        metadata,
    }
}
