# Dubhe Channel V2

## Goal

Dubhe Channel V2 is a general realtime foundation for Dubhe applications. It is not a game-only system, a table-only system, or a GraphQL-only system.

V2 should support:

- table subscriptions
- room or session channels for games and chat
- entity watches for app state
- feed and notification streams
- durable and replayable event delivery where needed

## Non-goals

V2 does not define application business semantics such as:

- `room_id`
- `document_id`
- `market_id`
- interest management rules
- combat rules
- order matching rules

Those belong to the application.

## Responsibility Split

### Dubhe should provide

- a stable channel protocol
- typed event envelopes and subscription specs
- cursor and replay semantics
- gateway support for SSE, WebSocket, and streaming RPC
- pluggable event bus adapters
- pluggable snapshot store adapters
- routing, partitioning, and subscription indexing primitives
- auth and authorization hooks
- SDKs for publishing, querying, and subscribing
- compatibility presets for existing table-based usage

### Application developers should provide

- event schema
- snapshot schema
- partition key strategy
- topic naming strategy
- authorization rules
- business command handling
- which flows need durable delivery versus ephemeral delivery

## Design Principles

1. Separate snapshot state from event delivery.
2. Guarantee ordering only within a partition key, not globally.
3. Make replay and reconnect first-class.
4. Let applications choose business topology while Dubhe owns transport and runtime machinery.
5. Keep the old `dubhe-channel` model as a compatibility preset, not the core abstraction.

## Core Concepts

### EventEnvelope

Every published message is normalized into a single envelope:

- `id`: globally unique event id
- `topic`: logical routing topic
- `partition_key`: ordering and shard key
- `kind`: application-defined event type
- `ts_ms`: event timestamp
- `payload`: serialized event body
- `metadata`: optional transport or domain metadata

### SubscriptionSpec

Subscriptions should be transport-agnostic:

- `topics`: one or more logical topics
- `filters`: exact-match or set-match filters
- `cursor`: optional resume point
- `semantics`: requested delivery semantics

The runtime may optimize these specs into local indexes, remote consumers, or backfill queries.

### SnapshotQuery

Queries read current state, not the event log. The runtime should support:

- point reads
- scoped entity reads
- snapshot backfill for reconnect

### Cursor

A cursor is an opaque resume token. Clients should not depend on its internal format.

## Delivery Semantics

V2 should support multiple delivery classes because different application flows need different tradeoffs.

### `ephemeral`

For high-frequency transient updates:

- position sync
- cursor movement
- temporary presence

Properties:

- intermediate events may be dropped
- replay is optional
- latest state matters more than event history

### `snapshot_only`

For flows that care about current state but not event history:

- dashboard widgets
- table state refresh
- current inventory or profile state

Properties:

- query current state
- optional invalidation signal
- no requirement to replay each individual change

### `at_least_once`

For business events where missing delivery is unacceptable:

- item pickup
- settlement
- notifications
- workflow state transitions

Properties:

- replay required
- duplicate delivery possible
- application must provide business-level idempotency where needed
- gateway/runtime should still provide transport-level protections such as:
  - per-account command serialization
  - duplicate submit replay for safe client retries
  - same-sender sequential batch submit to amortize request overhead without losing order

## Module Layout

V2 should evolve into the following modules:

- `dubhe-channel-core`
- `dubhe-channel-runtime`
- `dubhe-channel-gateway`
- `dubhe-channel-sdk`
- `dubhe-channel-presets`

### `dubhe-channel-core`

Owns the stable public abstraction:

- core types
- traits
- delivery semantics
- auth interfaces

### `dubhe-channel-runtime`

Owns server-side orchestration:

- event publishing
- stream consumption
- partition routing
- subscription indexing
- replay and backfill
- backpressure handling

### `dubhe-channel-gateway`

Owns client connection handling:

- SSE
- WebSocket
- streaming RPC
- session lifecycle
- heartbeat
- cursor resume

### `dubhe-channel-sdk`

Owns typed client access:

- `publish`
- `query`
- `subscribe`
- `command`

### `dubhe-channel-presets`

Owns reusable higher-level mappings:

- `table_subscription`
- `room_channel`
- `entity_watch`
- `feed_stream`

## Runtime Architecture

```text
client sdk
  -> gateway
  -> subscription router
  -> runtime
  -> event bus adapter
  -> snapshot store adapter
```

The runtime should be able to consume from Redis Streams, NATS JetStream, Kafka, or other adapters without changing application-facing protocol.

## Current Implementation

Today `dubhe-channel` supports two runtime modes:

- in-memory mode for local development and tests
- shared mode with Redis + NATS JetStream for multi-instance deployment

### Shared mode wiring

- snapshots are stored in Redis via `RedisSnapshotStore`
- live events are published and replayed from NATS JetStream via `JetStreamEventBus`
- submit coordination is stored in Redis:
  - per-account distributed lock
  - per-account nonce
  - duplicate submit replay cache

This means multiple `dubhe-channel` instances can safely sit behind a load balancer without double-executing the same sender nonce just because requests land on different nodes.

### Cursor format

`cursor` remains opaque to clients.

Current shared replay uses timestamp-based cursor tokens:

- query returns a millisecond timestamp cursor
- subscribe can resume from that timestamp through JetStream replay
- duplicate delivery is still possible at the replay boundary, so application handlers must stay idempotent for `at_least_once` flows

### Config

`dubhe-channel` can be started with:

- `--redis-url`
- `--nats-url`
- `--redis-key-prefix`
- `--nats-stream`
- `--nats-subject-prefix`
- `--submit-lock-ttl-ms`
- `--submit-lock-retry-ms`
- `--submit-lock-acquire-timeout-ms`

If `--redis-url` and `--nats-url` are both absent, the server falls back to in-memory mode.
If `--nats-url` is set without `--redis-url`, startup fails because replayable subscribe/query state would not be shared.

### Local shared-mode commands

From the Dubhe workspace root:

```bash
pnpm channel:infra:up
pnpm channel:run:shared -- --rpc-url https://rpc-testnet.suiscan.xyz/
```

Default local ports:

- Redis: `127.0.0.1:16379`
- NATS: `127.0.0.1:14222`
- NATS monitor: `127.0.0.1:18222`
- dubhe-channel: `127.0.0.1:18080`

### Local cluster validation

To run multiple shared `dubhe-channel` nodes against the same Redis + NATS backend:

```bash
pnpm channel:run:shared:cluster -- --rpc-url https://rpc-testnet.suiscan.xyz/
```

Default cluster ports:

- `18080`
- `18081`

You can override them with:

```bash
DUBHE_CHANNEL_CLUSTER_PORTS="18080 18081 18082" pnpm channel:run:shared:cluster -- --rpc-url https://rpc-testnet.suiscan.xyz/
```

To smoke-test the Numeron integration after the web app is already running locally:

```bash
pnpm channel:smoke:numeron
```

To verify Redis-backed cross-instance duplicate-submit coordination from Rust:

```bash
pnpm channel:test:redis-multi-instance
```

That test is intentionally marked ignored because it expects a local Redis server at `127.0.0.1:16379`.

## Partitioning

Partitioning is required for horizontal scale. Dubhe should provide the mechanism, but applications choose the partition key.

Examples:

- table preset: `hash(dapp_key, account, table)`
- room preset: `hash(room_id)`
- notification preset: `hash(user_id)`

Ordering is guaranteed only within one partition key.

## Authorization Hooks

The platform must support application-owned authorization decisions:

- `can_query`
- `can_subscribe`
- `can_publish`
- `can_command`

Dubhe provides the hook points and evaluation flow. Applications provide the policy.

## Compatibility Story

Current `dubhe-channel` should remain supported as a V1-compatible preset:

- current `/get_table` maps to snapshot query
- current `/subscribe_table` maps to a table subscription spec
- current `/submit` can be preserved as a compatibility command path

This keeps existing applications functional while allowing V2-native applications to use richer semantics.

## Migration Plan

### Phase 1

- introduce `dubhe-channel-core`
- define stable traits and transport-neutral types
- document preset model

### Phase 2

- implement runtime with a single durable adapter first
- recommended first adapter: Redis Streams
- add gateway with cursor-based reconnect

### Phase 3

- wrap current V1 channel as `table_subscription` preset
- add compatibility SDK mapping

### Phase 4

- migrate applications, including `numeron-channel-mvp`, onto V2 SDK and preset APIs

## Numeron Migration Direction

`numeron-channel-mvp` should eventually stop depending on raw V1 channel semantics directly and instead use V2 through:

- a `room_channel` preset for multiplayer realtime flows
- a `table_subscription` preset only for schema-backed state where appropriate
- server-side command handling for authoritative actions

This keeps Numeron compatible with Dubhe V2 without forcing Dubhe itself to become game-specific.
