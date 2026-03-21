#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "${1:-}" = "--" ]; then
  shift
fi

PORTS_STRING="${DUBHE_CHANNEL_CLUSTER_PORTS:-18080 18081}"

IFS=' ' read -r -a PORTS <<< "$PORTS_STRING"

if [ "${#PORTS[@]}" -eq 0 ]; then
  echo "DUBHE_CHANNEL_CLUSTER_PORTS must contain at least one port" >&2
  exit 1
fi

pids=()

cleanup() {
  local status=$?

  if [ "${#pids[@]}" -gt 0 ]; then
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" >/dev/null 2>&1; then
        kill "$pid" >/dev/null 2>&1 || true
      fi
    done
    wait "${pids[@]}" 2>/dev/null || true
  fi

  exit "$status"
}

trap cleanup EXIT INT TERM

for port in "${PORTS[@]}"; do
  echo "Starting shared dubhe-channel on port ${port}"
  (
    export DUBHE_CHANNEL_PORT="$port"
    exec "$ROOT_DIR/scripts/run-dubhe-channel-shared.sh" "$@"
  ) &
  pids+=("$!")
done

echo "Shared dubhe-channel cluster is running on: ${PORTS_STRING}"
wait "${pids[@]}"
