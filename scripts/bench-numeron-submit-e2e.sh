#!/usr/bin/env bash

set -euo pipefail

APP_URL="${NUMERON_APP_URL:-http://127.0.0.1:3003}"
TARGET_SAMPLES="${NUMERON_SUBMIT_BENCH_SAMPLES:-8}"
MAX_ATTEMPTS="${NUMERON_SUBMIT_BENCH_MAX_ATTEMPTS:-40}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"

if [ ! -f "$PWCLI" ]; then
  echo "Playwright wrapper not found at $PWCLI" >&2
  exit 1
fi

JS_CODE="$(cat <<EOF
async () => {
  const targetSamples = ${TARGET_SAMPLES};
  const maxAttempts = ${MAX_ATTEMPTS};
  const directions = ["RIGHT", "DOWN", "LEFT", "UP"];
  const latencies = [];
  let attempts = 0;

  const percentile = (values, p) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index];
  };

  await window.__numeronDebug.selectCurrentPlayerAndEnterWorld();

  while (latencies.length < targetSamples && attempts < maxAttempts) {
    const direction = directions[attempts % directions.length];
    attempts += 1;
    const before = window.__numeronDebug.getState();
    const beforeCount = before.world?.feedEntries?.length ?? 0;
    const start = performance.now();

    await window.__numeronDebug.move(direction);

    const deadline = performance.now() + 8000;
    while (performance.now() < deadline) {
      const state = window.__numeronDebug.getState();
      const feedEntries = state.world?.feedEntries ?? [];
      if (feedEntries.length > beforeCount) {
        latencies.push(performance.now() - start);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  if (latencies.length === 0) {
    throw new Error("No submit->feed latency samples collected");
  }

  const sum = latencies.reduce((acc, value) => acc + value, 0);

  return {
    appUrl: "${APP_URL}",
    targetSamples,
    attempts,
    collected: latencies.length,
    latencyMs: {
      min: Math.min(...latencies),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: Math.max(...latencies),
      avg: sum / latencies.length,
    },
    finalState: window.__numeronDebug.getState(),
  };
}
EOF
)"

bash "$PWCLI" close-all >/dev/null 2>&1 || true
bash "$PWCLI" open "$APP_URL" >/dev/null
bash "$PWCLI" eval "$JS_CODE"
