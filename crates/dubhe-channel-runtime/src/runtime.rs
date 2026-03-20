use dubhe_channel_core::{
    AuthContext, AuthzProvider, ChannelResult, EventBusAdapter, EventEnvelope, SnapshotQuery,
    SnapshotResult, SnapshotStore, SubscriptionSpec,
};
use futures_util::{stream::BoxStream, StreamExt};
use std::sync::Arc;

pub struct ChannelRuntime {
    event_bus: Arc<dyn EventBusAdapter>,
    snapshot_store: Arc<dyn SnapshotStore>,
    authz: Arc<dyn AuthzProvider>,
}

impl ChannelRuntime {
    pub fn new(
        event_bus: Arc<dyn EventBusAdapter>,
        snapshot_store: Arc<dyn SnapshotStore>,
        authz: Arc<dyn AuthzProvider>,
    ) -> Self {
        Self {
            event_bus,
            snapshot_store,
            authz,
        }
    }

    pub async fn publish(&self, ctx: &AuthContext, event: EventEnvelope) -> ChannelResult<()> {
        if !self.authz.can_publish(ctx, &event).await? {
            return Err(dubhe_channel_core::ChannelError::new(
                "forbidden",
                "publish forbidden",
            ));
        }

        self.event_bus.publish(vec![event]).await
    }

    pub async fn query(
        &self,
        ctx: &AuthContext,
        query: SnapshotQuery,
    ) -> ChannelResult<SnapshotResult> {
        if !self.authz.can_query(ctx, &query).await? {
            return Err(dubhe_channel_core::ChannelError::new(
                "forbidden",
                "query forbidden",
            ));
        }

        self.snapshot_store.query(query).await
    }

    pub async fn upsert_snapshot(
        &self,
        query: SnapshotQuery,
        result: SnapshotResult,
    ) -> ChannelResult<()> {
        self.snapshot_store.upsert(query, result).await
    }

    pub async fn subscribe(
        &self,
        ctx: &AuthContext,
        spec: SubscriptionSpec,
    ) -> ChannelResult<BoxStream<'static, ChannelResult<EventEnvelope>>> {
        if !self.authz.can_subscribe(ctx, &spec).await? {
            return Err(dubhe_channel_core::ChannelError::new(
                "forbidden",
                "subscribe forbidden",
            ));
        }

        let topics = spec.topics.clone();
        let filters = spec.filters.clone();
        let stream = self
            .event_bus
            .subscribe(topics.clone(), spec.cursor.clone())
            .await?
            .filter_map(move |event_res| {
                let topics = topics.clone();
                let filters = filters.clone();
                async move {
                    match event_res {
                        Ok(event) if matches_subscription(&event, &topics, &filters) => {
                            Some(Ok(event))
                        }
                        Ok(_) => None,
                        Err(err) => Some(Err(err)),
                    }
                }
            })
            .boxed();

        Ok(stream)
    }
}

fn matches_subscription(
    event: &EventEnvelope,
    topics: &[String],
    filters: &std::collections::BTreeMap<String, dubhe_channel_core::FilterValue>,
) -> bool {
    if !topics.is_empty() && !topics.iter().any(|topic| topic == &event.topic) {
        return false;
    }

    for (key, filter) in filters {
        let Some(value) = event.metadata.get(key) else {
            return false;
        };

        match filter {
            dubhe_channel_core::FilterValue::String(single) => {
                if value != single {
                    return false;
                }
            }
            dubhe_channel_core::FilterValue::StringList(list) => {
                if !list.iter().any(|candidate| candidate == value) {
                    return false;
                }
            }
        }
    }

    true
}
