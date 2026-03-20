#!/usr/bin/env bash

set -euo pipefail

APP_URL="${NUMERON_APP_URL:-http://127.0.0.1:3003}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

if [ ! -f "$PWCLI" ]; then
  echo "Playwright wrapper not found at $PWCLI" >&2
  exit 1
fi

curl -fsS "$APP_URL" >/dev/null

bash "$PWCLI" close-all >/dev/null 2>&1 || true
bash "$PWCLI" open "$APP_URL"
bash "$PWCLI" eval 'async () => await window.__numeronDebug.selectCurrentPlayerAndEnterWorld()'
bash "$PWCLI" eval 'async () => {
  const directions = ["RIGHT", "DOWN", "LEFT", "UP"];
  for (const direction of directions) {
    await window.__numeronDebug.move(direction);
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const state = window.__numeronDebug.getState();
      if (state.world && state.world.feedEntries && state.world.feedEntries.length > 0) {
        return state;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw new Error("No feed entries observed after movement attempts");
}'
bash "$PWCLI" eval '() => window.render_game_to_text()'
