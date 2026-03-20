use async_nats::jetstream::{
    self,
    consumer::{pull, AckPolicy, DeliverPolicy},
    message::PublishMessage,
    stream,
};
use async_trait::async_trait;
use dubhe_channel_core::{
    ChannelError, ChannelResult, Cursor, EventBusAdapter, EventEnvelope, SnapshotQuery,
    SnapshotResult, SnapshotStore,
};
use futures_util::{stream::BoxStream, StreamExt, TryStreamExt};
use redis::{aio::ConnectionManager, AsyncCommands};
use sha2::{Digest, Sha256};
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use time::OffsetDateTime;

static SUBSCRIPTION_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone)]
pub struct RedisSnapshotStore {
    connection: ConnectionManager,
    key_prefix: String,
}

impl RedisSnapshotStore {
    pub async fn connect(redis_url: &str, key_prefix: impl Into<String>) -> ChannelResult<Self> {
        let client = redis::Client::open(redis_url)
            .map_err(|error| channel_error("redis_connect", error))?;
        let connection = client
            .get_connection_manager()
            .await
            .map_err(|error| channel_error("redis_connect", error))?;

        Ok(Self {
            connection,
            key_prefix: key_prefix.into(),
        })
    }

    fn snapshot_key(&self, query: &SnapshotQuery) -> ChannelResult<String> {
        Ok(snapshot_key(&self.key_prefix, query)?)
    }
}

fn snapshot_key(key_prefix: &str, query: &SnapshotQuery) -> ChannelResult<String> {
    let encoded =
        serde_json::to_vec(query).map_err(|error| channel_error("snapshot_key_encode", error))?;
    Ok(format!(
        "{}:snapshot:{}",
        key_prefix,
        hex::encode(Sha256::digest(encoded))
    ))
}

#[async_trait]
impl SnapshotStore for RedisSnapshotStore {
    async fn query(&self, query: SnapshotQuery) -> ChannelResult<SnapshotResult> {
        let key = self.snapshot_key(&query)?;
        let mut connection = self.connection.clone();
        let value: Option<String> = connection
            .get(key)
            .await
            .map_err(|error| channel_error("redis_query", error))?;

        match value {
            Some(value) => serde_json::from_str(&value)
                .map_err(|error| channel_error("snapshot_decode", error)),
            None => Ok(SnapshotResult {
                found: false,
                data: None,
                cursor: None,
            }),
        }
    }

    async fn upsert(&self, query: SnapshotQuery, result: SnapshotResult) -> ChannelResult<()> {
        let key = self.snapshot_key(&query)?;
        let payload = serde_json::to_string(&result)
            .map_err(|error| channel_error("snapshot_encode", error))?;
        let mut connection = self.connection.clone();
        let _: () = connection
            .set(key, payload)
            .await
            .map_err(|error| channel_error("redis_upsert", error))?;
        Ok(())
    }
}

#[derive(Clone)]
pub struct JetStreamEventBus {
    context: jetstream::Context,
    stream_name: String,
    subject_prefix: String,
}

impl JetStreamEventBus {
    pub async fn connect(
        nats_url: &str,
        stream_name: impl Into<String>,
        subject_prefix: impl Into<String>,
    ) -> ChannelResult<Self> {
        let client = async_nats::connect(nats_url)
            .await
            .map_err(|error| channel_error("nats_connect", error))?;
        let context = jetstream::new(client);
        let stream_name = stream_name.into();
        let subject_prefix = normalize_subject_prefix(subject_prefix.into());

        context
            .get_or_create_stream(stream::Config {
                name: stream_name.clone(),
                subjects: vec![format!("{}.>", subject_prefix)],
                ..Default::default()
            })
            .await
            .map_err(|error| channel_error("nats_stream_init", error))?;

        Ok(Self {
            context,
            stream_name,
            subject_prefix,
        })
    }

    fn subject_for_topic(&self, topic: &str) -> String {
        if topic.is_empty() {
            format!("{}.default", self.subject_prefix)
        } else {
            format!("{}.{}", self.subject_prefix, topic)
        }
    }

    fn next_consumer_name() -> String {
        format!(
            "dubhe-channel-{}-{}",
            std::process::id(),
            SUBSCRIPTION_COUNTER.fetch_add(1, Ordering::Relaxed)
        )
    }

    fn delivery_policy(cursor: Option<Cursor>) -> ChannelResult<DeliverPolicy> {
        let Some(cursor) = cursor else {
            return Ok(DeliverPolicy::New);
        };

        if let Some(value) = cursor.opaque.strip_prefix("seq:") {
            let sequence = value
                .parse::<u64>()
                .map_err(|error| channel_error("cursor_parse", error))?;
            return Ok(DeliverPolicy::ByStartSequence {
                start_sequence: sequence.saturating_add(1),
            });
        }

        if let Some(value) = cursor.opaque.strip_prefix("ts:") {
            let start_ms = value
                .parse::<i128>()
                .map_err(|error| channel_error("cursor_parse", error))?;
            return Ok(DeliverPolicy::ByStartTime {
                start_time: timestamp_ms_to_offset(start_ms)?,
            });
        }

        match cursor.opaque.parse::<u64>() {
            Ok(value) if value >= 1_000_000_000_000 => Ok(DeliverPolicy::ByStartTime {
                start_time: timestamp_ms_to_offset(value as i128)?,
            }),
            Ok(value) => Ok(DeliverPolicy::ByStartSequence {
                start_sequence: value.saturating_add(1),
            }),
            Err(error) => Err(channel_error("cursor_parse", error)),
        }
    }
}

#[async_trait]
impl EventBusAdapter for JetStreamEventBus {
    async fn publish(&self, events: Vec<EventEnvelope>) -> ChannelResult<()> {
        for event in events {
            let subject = self.subject_for_topic(&event.topic);
            let payload =
                serde_json::to_vec(&event).map_err(|error| channel_error("event_encode", error))?;
            let publish = if event.id.is_empty() {
                PublishMessage::build().payload(payload.into())
            } else {
                PublishMessage::build()
                    .payload(payload.into())
                    .message_id(&event.id)
            };

            self.context
                .send_publish(subject, publish)
                .await
                .map_err(|error| channel_error("nats_publish", error))?
                .await
                .map_err(|error| channel_error("nats_publish", error))?;
        }

        Ok(())
    }

    async fn subscribe(
        &self,
        partitions: Vec<String>,
        cursor: Option<Cursor>,
    ) -> ChannelResult<BoxStream<'static, ChannelResult<EventEnvelope>>> {
        let stream = self
            .context
            .get_stream(&self.stream_name)
            .await
            .map_err(|error| channel_error("nats_stream_get", error))?;

        let subjects: Vec<String> = partitions
            .into_iter()
            .map(|partition| self.subject_for_topic(&partition))
            .collect();

        let mut consumer = pull::Config {
            name: Some(Self::next_consumer_name()),
            ack_policy: AckPolicy::Explicit,
            inactive_threshold: Duration::from_secs(300),
            deliver_policy: Self::delivery_policy(cursor)?,
            ..Default::default()
        };

        match subjects.len() {
            0 => {}
            1 => {
                consumer.filter_subject = subjects[0].clone();
            }
            _ => {
                consumer.filter_subjects = subjects;
            }
        }

        let messages = stream
            .create_consumer(consumer)
            .await
            .map_err(|error| channel_error("nats_consumer_create", error))?
            .messages()
            .await
            .map_err(|error| channel_error("nats_consumer_stream", error))?;

        let stream = messages
            .map_err(|error| channel_error("nats_consume", error))
            .then(|message_result| async move {
                let message = message_result?;
                let decode_result = serde_json::from_slice::<EventEnvelope>(&message.payload)
                    .map_err(|error| channel_error("event_decode", error));

                let _ = message.ack().await;
                decode_result
            })
            .boxed();

        Ok(stream)
    }
}

fn normalize_subject_prefix(prefix: String) -> String {
    prefix.trim_end_matches('.').to_string()
}

fn timestamp_ms_to_offset(timestamp_ms: i128) -> ChannelResult<OffsetDateTime> {
    OffsetDateTime::from_unix_timestamp_nanos(timestamp_ms * 1_000_000)
        .map_err(|error| channel_error("cursor_parse", error))
}

fn channel_error(code: &'static str, error: impl std::fmt::Display) -> ChannelError {
    ChannelError::new(code, error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn redis_snapshot_key_is_stable() {
        let query = SnapshotQuery {
            entity: "table".to_string(),
            key: "abc".to_string(),
            scope: BTreeMap::from([("region".to_string(), "cn".to_string())]),
        };

        let first = snapshot_key("dubhe:test", &query).unwrap();
        let second = snapshot_key("dubhe:test", &query).unwrap();

        assert_eq!(first, second);
        assert!(first.starts_with("dubhe:test:snapshot:"));
    }

    #[test]
    fn delivery_policy_parses_timestamp_cursor() {
        let policy = JetStreamEventBus::delivery_policy(Some(Cursor {
            opaque: "ts:1710000000123".to_string(),
        }))
        .unwrap();

        assert!(matches!(policy, DeliverPolicy::ByStartTime { .. }));
    }
}
