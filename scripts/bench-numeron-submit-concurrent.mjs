#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';

function parseArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--') || arg === '--') {
      continue;
    }

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args.set(key, next);
      i += 1;
    } else {
      args.set(key, 'true');
    }
  }
  return args;
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function accountLabel(address) {
  if (!address) {
    return null;
  }

  const normalized = address.startsWith('0x') ? address.slice(2) : address;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

const args = parseArgs(process.argv);
const appUrl = args.get('app-url') || process.env.NUMERON_APP_URL || 'http://127.0.0.1:3003';
const concurrency = Number(
  args.get('concurrency') || process.env.NUMERON_SUBMIT_BENCH_CONCURRENCY || 4,
);
const targetSamples = Number(
  args.get('target-samples') || process.env.NUMERON_SUBMIT_BENCH_TARGET_SAMPLES || 16,
);
const maxAttempts = Number(
  args.get('max-attempts') || process.env.NUMERON_SUBMIT_BENCH_MAX_ATTEMPTS || targetSamples * 4,
);
const settleTimeoutMs = Number(
  args.get('settle-timeout-ms') || process.env.NUMERON_SUBMIT_BENCH_SETTLE_TIMEOUT_MS || 8000,
);
const headless = (args.get('headless') || process.env.NUMERON_SUBMIT_BENCH_HEADLESS || 'true') !== 'false';
const benchmarkMode = args.get('mode') || process.env.NUMERON_SUBMIT_BENCH_MODE || 'settlement';
const directions = (
  args.get('directions') || process.env.NUMERON_SUBMIT_BENCH_DIRECTIONS || 'RIGHT,LEFT'
)
  .split(',')
  .map(value => value.trim().toUpperCase())
  .filter(Boolean);
const playerAddresses = (
  args.get('player-addresses') || process.env.NUMERON_SUBMIT_BENCH_PLAYER_ADDRESSES || ''
)
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const playerPrivateKeys = (
  args.get('player-private-keys') || process.env.NUMERON_SUBMIT_BENCH_PLAYER_PRIVATE_KEYS || ''
)
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const registerSender =
  args.get('register-sender') || process.env.NUMERON_SUBMIT_BENCH_REGISTER_SENDER || null;
const channelUrls = (
  args.get('channel-urls') || process.env.NUMERON_SUBMIT_BENCH_CHANNEL_URLS || ''
)
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const expectedSummaries = (
  args.get('summaries') || process.env.NUMERON_SUBMIT_BENCH_SUMMARIES || 'position'
)
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

if (concurrency <= 0) {
  throw new Error('concurrency must be > 0');
}

if (targetSamples <= 0) {
  throw new Error('target-samples must be > 0');
}

if (maxAttempts <= 0) {
  throw new Error('max-attempts must be > 0');
}

if (directions.length === 0) {
  throw new Error('At least one direction is required');
}

if (expectedSummaries.length === 0) {
  throw new Error('At least one summary is required');
}

if (!['settlement', 'pipeline'].includes(benchmarkMode)) {
  throw new Error(`Unsupported mode: ${benchmarkMode}`);
}

function buildLatencyStats(values) {
  if (values.length === 0) {
    return {
      min: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
      avg: 0,
    };
  }

  return {
    min: Math.min(...values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: Math.max(...values),
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless,
});

const samples = [];
const failures = [];
const workerAssignments = [];
let nextAttemptId = 0;

async function setupWorker(workerIndex) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(appUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__numeronDebug), { timeout: 20_000 });
  await page.waitForFunction(() => window.__numeronDebug.getActiveSceneKeys().length > 0, {
    timeout: 20_000,
  });
  await page.waitForTimeout(1000);

  const assignedPlayer = playerAddresses.length > 0 ? playerAddresses[workerIndex % playerAddresses.length] : null;
  const assignedPrivateKey =
    playerPrivateKeys.length > 0 ? playerPrivateKeys[workerIndex % playerPrivateKeys.length] : null;
  const assignedChannelUrl = channelUrls.length > 0 ? channelUrls[workerIndex % channelUrls.length] : null;
  if (assignedChannelUrl) {
    await page.evaluate(channelUrl => window.__numeronDebug.setChannelUrl(channelUrl), assignedChannelUrl);
  }
  if (registerSender) {
    await page.evaluate(
      sender => window.__numeronDebug.setRegisterSenderAddress(sender),
      registerSender,
    );
  }
  if (assignedPrivateKey) {
    await page.evaluate(secretKey => window.__numeronDebug.setCurrentPlayerSecretKey(secretKey), assignedPrivateKey);
  }
  const initialState = assignedPlayer
    ? await page.evaluate(address => window.__numeronDebug.enterWorldAs(address), assignedPlayer)
    : await page.evaluate(() => window.__numeronDebug.selectCurrentPlayerAndEnterWorld());

  workerAssignments.push({
    worker: workerIndex,
    assignedPlayer,
    assignedPrivateKey: assignedPrivateKey ? '[configured]' : null,
    assignedChannelUrl,
    currentPlayer: initialState.currentPlayer,
    selectedPlayer: initialState.selectedPlayer,
  });

  return {
    assignedPlayer: assignedPlayer || initialState.selectedPlayer || initialState.currentPlayer,
    assignedPrivateKey,
    assignedChannelUrl: assignedChannelUrl || initialState.world?.channelUrl || null,
    context,
    page,
  };
}

async function runWorker(workerIndex) {
  let page;
  let context;
  let assignedPlayer = null;
  let assignedPrivateKey = null;
  let assignedChannelUrl = null;

  try {
    const worker = await setupWorker(workerIndex);
    page = worker.page;
    context = worker.context;
    assignedPlayer = worker.assignedPlayer;
    assignedPrivateKey = worker.assignedPrivateKey;
    assignedChannelUrl = worker.assignedChannelUrl;
  } catch (error) {
    failures.push({
      worker: workerIndex,
      player: null,
      playerPrivateKey: null,
      channelUrl: null,
      direction: null,
      error: `setup_failed: ${String(error)}`,
      state: null,
    });
    return;
  }

  try {
    while (true) {
      if (samples.length >= targetSamples || nextAttemptId >= maxAttempts) {
        return;
      }

      const attemptId = nextAttemptId;
      nextAttemptId += 1;
      const direction = directions[attemptId % directions.length];

      try {
        const result =
          benchmarkMode === 'pipeline'
            ? await page.evaluate(
                ({ attemptDirection, timeoutMs, expectedDetail }) =>
                  window.__numeronDebug.measureMovePipeline(attemptDirection, {
                    settlementTimeoutMs: timeoutMs,
                    settlementDetail: expectedDetail,
                  }),
                {
                  attemptDirection: direction,
                  timeoutMs: settleTimeoutMs,
                  expectedDetail: accountLabel(assignedPlayer),
                },
              )
            : await page.evaluate(
                ({ attemptDirection, timeoutMs, expectedDetail, summaries }) =>
                  window.__numeronDebug.measureMoveSettlement(attemptDirection, {
                    source: 'subscription',
                    summaries,
                    detail: expectedDetail,
                    timeoutMs,
                  }),
                {
                  attemptDirection: direction,
                  timeoutMs: settleTimeoutMs,
                  expectedDetail: accountLabel(assignedPlayer),
                  summaries: expectedSummaries,
                },
              );

        if (samples.length < targetSamples) {
          samples.push({
            worker: workerIndex,
            player: assignedPlayer,
            playerPrivateKey: assignedPrivateKey ? '[configured]' : null,
            channelUrl: assignedChannelUrl,
            direction,
            latencyMs:
              benchmarkMode === 'pipeline' ? result.phases.settlementLatencyMs ?? 0 : result.latencyMs,
            matchedEntry:
              benchmarkMode === 'pipeline' ? result.phases.settlementEntry ?? result.phases.submitAckEntry : result.matchedEntry,
            phases: benchmarkMode === 'pipeline' ? result.phases : undefined,
          });
        }
      } catch (error) {
        const state = await page.evaluate(() => window.__numeronDebug.getState());
        failures.push({
          worker: workerIndex,
          player: assignedPlayer,
          playerPrivateKey: assignedPrivateKey ? '[configured]' : null,
          channelUrl: assignedChannelUrl,
          direction,
          error: String(error),
          state,
        });
      }
    }
  } finally {
    await context.close();
  }
}

const startedAtMs = performance.now();

try {
  await Promise.all(
    Array.from({ length: concurrency }, (_, workerIndex) => runWorker(workerIndex)),
  );
} finally {
  await browser.close();
}

const finishedAtMs = performance.now();
const latencies = samples.map(sample => sample.latencyMs);
const fastPathLatencies = samples
  .map(sample => sample.phases?.fastPathLatencyMs)
  .filter(value => typeof value === 'number');
const submitAckLatencies = samples
  .map(sample => sample.phases?.submitAckLatencyMs)
  .filter(value => typeof value === 'number');
const settlementLatencies = samples
  .map(sample => sample.phases?.settlementLatencyMs)
  .filter(value => typeof value === 'number');
const perWorker = workerAssignments.map(assignment => {
  const workerSamples = samples.filter(sample => sample.worker === assignment.worker);
  const workerFailures = failures.filter(failure => failure.worker === assignment.worker);
  const workerLatencies = workerSamples.map(sample => sample.latencyMs);

  return {
    ...assignment,
    successes: workerSamples.length,
    failures: workerFailures.length,
    latencyMs: {
      min: workerLatencies.length > 0 ? Math.min(...workerLatencies) : 0,
      p50: percentile(workerLatencies, 50),
      p95: percentile(workerLatencies, 95),
      max: workerLatencies.length > 0 ? Math.max(...workerLatencies) : 0,
      avg:
        workerLatencies.length > 0
          ? workerLatencies.reduce((sum, value) => sum + value, 0) / workerLatencies.length
          : 0,
    },
  };
});

const summary = {
  appUrl,
  benchmarkMode,
  concurrency,
  targetSamples,
  maxAttempts,
  attempts: nextAttemptId,
  successes: samples.length,
  failures: failures.length,
  requestsPerSecond:
    finishedAtMs > startedAtMs ? (samples.length / (finishedAtMs - startedAtMs)) * 1000 : 0,
  directions,
  playerAddresses:
    playerAddresses.length > 0
      ? playerAddresses
      : Array.from(new Set(workerAssignments.map(assignment => assignment.currentPlayer))),
  playerPrivateKeysConfigured: playerPrivateKeys.length,
  channelUrls:
    channelUrls.length > 0
      ? channelUrls
      : Array.from(new Set(workerAssignments.map(assignment => assignment.assignedChannelUrl).filter(Boolean))),
  registerSender,
  summaries: expectedSummaries,
  latencyMs: buildLatencyStats(latencies),
  phaseLatencyMs:
    benchmarkMode === 'pipeline'
      ? {
          fastPath: buildLatencyStats(fastPathLatencies),
          submitAck: buildLatencyStats(submitAckLatencies),
          settlement: buildLatencyStats(settlementLatencies),
        }
      : null,
  perWorker,
  sampleSuccess: samples[0] || null,
  sampleFailure: failures[0] || null,
};

console.log(JSON.stringify(summary, null, 2));

if (samples.length === 0) {
  process.exitCode = 1;
} else if (samples.length < targetSamples) {
  process.exitCode = 1;
}
