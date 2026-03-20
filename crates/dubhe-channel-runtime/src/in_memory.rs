use async_trait::async_trait;
use dubhe_channel_core::{
    AuthContext, AuthzProvider, ChannelCommand, ChannelError, ChannelResult, Cursor,
    EventBusAdapter, EventEnvelope, SnapshotQuery, SnapshotResult, SnapshotStore, SubscriptionSpec,
};
use futures_util::{stream::BoxStream, StreamExt};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tokio_stream::wrappers::errors::BroadcastStreamRecvError;
use tokio_stream::wrappers::BroadcastStream;

#[derive(Clone)]
pub struct InMemoryEventBus {
    tx: broadcast::Sender<EventEnvelope>,
}

impl InMemoryEventBus {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self { tx }
    }
}

#[async_trait]
impl EventBusAdapter for InMemoryEventBus {
    async fn publish(&self, events: Vec<EventEnvelope>) -> ChannelResult<()> {
        for event in events {
            let _ = self.tx.send(event);
        }

        Ok(())
    }

    async fn subscribe(
        &self,
        _partitions: Vec<String>,
        _cursor: Option<Cursor>,
    ) -> ChannelResult<BoxStream<'static, ChannelResult<EventEnvelope>>> {
        let rx = self.tx.subscribe();
        let stream = BroadcastStream::new(rx)
            .filter_map(|item| async move {
                match item {
                    Ok(event) => Some(Ok(event)),
                    Err(BroadcastStreamRecvError::Lagged(skipped)) => Some(Err(ChannelError::new(
                        "lagged",
                        format!("lagged by {skipped} messages"),
                    ))),
                }
            })
            .boxed();

        Ok(stream)
    }
}

#[derive(Clone, Default)]
pub struct InMemorySnapshotStore {
    state: Arc<RwLock<HashMap<String, SnapshotResult>>>,
}

impl InMemorySnapshotStore {
    pub fn new() -> Self {
        Self::default()
    }

    fn make_key(query: &SnapshotQuery) -> String {
        let scope = serde_json::to_string(&query.scope).unwrap_or_else(|_| "{}".to_string());
        format!("{}::{}::{}", query.entity, query.key, scope)
    }
}

#[async_trait]
impl SnapshotStore for InMemorySnapshotStore {
    async fn query(&self, query: SnapshotQuery) -> ChannelResult<SnapshotResult> {
        let key = Self::make_key(&query);
        let state = self.state.read().await;
        Ok(state.get(&key).cloned().unwrap_or(SnapshotResult {
            found: false,
            data: None,
            cursor: None,
        }))
    }

    async fn upsert(&self, query: SnapshotQuery, result: SnapshotResult) -> ChannelResult<()> {
        let key = Self::make_key(&query);
        let mut state = self.state.write().await;
        state.insert(key, result);
        Ok(())
    }
}

#[derive(Clone, Default)]
pub struct AllowAllAuthz;

#[async_trait]
impl AuthzProvider for AllowAllAuthz {
    async fn can_query(&self, _ctx: &AuthContext, _query: &SnapshotQuery) -> ChannelResult<bool> {
        Ok(true)
    }

    async fn can_subscribe(
        &self,
        _ctx: &AuthContext,
        _spec: &SubscriptionSpec,
    ) -> ChannelResult<bool> {
        Ok(true)
    }

    async fn can_publish(&self, _ctx: &AuthContext, _event: &EventEnvelope) -> ChannelResult<bool> {
        Ok(true)
    }

    async fn can_command(
        &self,
        _ctx: &AuthContext,
        _command: &ChannelCommand,
    ) -> ChannelResult<bool> {
        Ok(true)
    }
}
