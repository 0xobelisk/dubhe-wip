use crate::error::ChannelResult;
use crate::types::{
    AuthContext, ChannelCommand, Cursor, EventEnvelope, SnapshotQuery, SnapshotResult,
    SubscriptionSpec,
};
use async_trait::async_trait;
use futures_util::stream::BoxStream;

#[async_trait]
pub trait EventBusAdapter: Send + Sync {
    async fn publish(&self, events: Vec<EventEnvelope>) -> ChannelResult<()>;

    async fn subscribe(
        &self,
        partitions: Vec<String>,
        cursor: Option<Cursor>,
    ) -> ChannelResult<BoxStream<'static, ChannelResult<EventEnvelope>>>;
}

#[async_trait]
pub trait SnapshotStore: Send + Sync {
    async fn query(&self, query: SnapshotQuery) -> ChannelResult<SnapshotResult>;

    async fn upsert(&self, query: SnapshotQuery, result: SnapshotResult) -> ChannelResult<()>;
}

#[async_trait]
pub trait AuthzProvider: Send + Sync {
    async fn can_query(&self, ctx: &AuthContext, query: &SnapshotQuery) -> ChannelResult<bool>;

    async fn can_subscribe(
        &self,
        ctx: &AuthContext,
        spec: &SubscriptionSpec,
    ) -> ChannelResult<bool>;

    async fn can_publish(&self, ctx: &AuthContext, event: &EventEnvelope) -> ChannelResult<bool>;

    async fn can_command(&self, ctx: &AuthContext, command: &ChannelCommand)
        -> ChannelResult<bool>;
}

#[async_trait]
pub trait ChannelPublisher: Send + Sync {
    async fn publish(&self, ctx: &AuthContext, event: EventEnvelope) -> ChannelResult<()>;
}

#[async_trait]
pub trait ChannelSubscriber: Send + Sync {
    async fn subscribe(
        &self,
        ctx: &AuthContext,
        spec: SubscriptionSpec,
    ) -> ChannelResult<BoxStream<'static, ChannelResult<EventEnvelope>>>;
}
