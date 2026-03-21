#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "${1:-}" = "--" ]; then
  shift
fi

REDIS_URL="${DUBHE_CHANNEL_REDIS_URL:-redis://127.0.0.1:16379/}"
NATS_URL="${DUBHE_CHANNEL_NATS_URL:-nats://127.0.0.1:14222}"
REDIS_KEY_PREFIX="${DUBHE_CHANNEL_REDIS_PREFIX:-dubhe:channel:numeron}"
NATS_STREAM="${DUBHE_CHANNEL_NATS_STREAM:-DUBHE_CHANNEL}"
NATS_SUBJECT_PREFIX="${DUBHE_CHANNEL_NATS_SUBJECT_PREFIX:-dubhe.channel}"
CHANNEL_PORT="${DUBHE_CHANNEL_PORT:-18080}"

cd "$ROOT_DIR"

exec cargo run -p dubhe-channel -- \
  --port "$CHANNEL_PORT" \
  --redis-url "$REDIS_URL" \
  --nats-url "$NATS_URL" \
  --redis-key-prefix "$REDIS_KEY_PREFIX" \
  --nats-stream "$NATS_STREAM" \
  --nats-subject-prefix "$NATS_SUBJECT_PREFIX" \
  "$@"
