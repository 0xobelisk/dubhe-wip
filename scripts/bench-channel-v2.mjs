#!/usr/bin/env node

import { performance } from 'node:perf_hooks';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) {
    continue;
  }

  const key = arg.slice(2);
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    i += 1;
  } else {
    args.set(key, 'true');
  }
}

const urls = (args.get('urls') || process.env.DUBHE_BENCH_URLS || 'http://127.0.0.1:18080')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const endpoint = args.get('endpoint') || process.env.DUBHE_BENCH_ENDPOINT || 'nonce';
const concurrency = Number(args.get('concurrency') || process.env.DUBHE_BENCH_CONCURRENCY || 32);
const requests = Number(args.get('requests') || process.env.DUBHE_BENCH_REQUESTS || 500);
const warmup = Number(args.get('warmup') || process.env.DUBHE_BENCH_WARMUP || 50);
const timeoutMs = Number(args.get('timeout-ms') || process.env.DUBHE_BENCH_TIMEOUT_MS || 10_000);
const queryBody = args.get('query-body') || process.env.DUBHE_BENCH_QUERY_BODY || '';

if (urls.length === 0) {
  throw new Error('At least one URL is required');
}

if (!['health', 'nonce', 'query'].includes(endpoint)) {
  throw new Error(`Unsupported endpoint: ${endpoint}`);
}

if (endpoint === 'query' && !queryBody) {
  throw new Error('query benchmark requires --query-body or DUBHE_BENCH_QUERY_BODY');
}

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function makeNonceBody(requestId) {
  const sender = `0x${requestId.toString(16).padStart(64, '0')}`;
  return JSON.stringify({ sender });
}

function buildRequest(requestId) {
  if (endpoint === 'health') {
    return {
      url: `${urls[requestId % urls.length]}/health`,
      init: {
        method: 'GET',
      },
    };
  }

  if (endpoint === 'nonce') {
    return {
      url: `${urls[requestId % urls.length]}/v2/nonce`,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: makeNonceBody(requestId),
      },
    };
  }

  return {
    url: `${urls[requestId % urls.length]}/v2/query`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: queryBody,
    },
  };
}

async function runSingle(requestId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const { url, init } = buildRequest(requestId);
  const start = performance.now();

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const elapsedMs = performance.now() - start;
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs,
      body: text,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: performance.now() - start,
      body: String(error),
      url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runBatch(totalRequests) {
  const results = [];
  let nextRequestId = 0;

  async function worker() {
    while (true) {
      const requestId = nextRequestId;
      nextRequestId += 1;
      if (requestId >= totalRequests) {
        return;
      }
      results[requestId] = await runSingle(requestId);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker()),
  );

  return results;
}

function summarize(results, startedAtMs, finishedAtMs) {
  const failures = results.filter(result => !result.ok);
  const successes = results.filter(result => result.ok);
  const latencies = successes.map(result => result.elapsedMs).sort((a, b) => a - b);
  const totalDurationMs = finishedAtMs - startedAtMs;

  return {
    endpoint,
    urls,
    concurrency,
    requests: results.length,
    successes: successes.length,
    failures: failures.length,
    requestsPerSecond: totalDurationMs > 0 ? (results.length / totalDurationMs) * 1000 : 0,
    latencyMs: {
      min: latencies[0] || 0,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies[latencies.length - 1] || 0,
      avg:
        latencies.length > 0
          ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
          : 0,
    },
    sampleFailure: failures[0]
      ? {
          url: failures[0].url,
          status: failures[0].status,
          body: failures[0].body.slice(0, 400),
        }
      : null,
  };
}

async function main() {
  if (warmup > 0) {
    await runBatch(warmup);
  }

  const startedAtMs = performance.now();
  const results = await runBatch(requests);
  const finishedAtMs = performance.now();
  const summary = summarize(results, startedAtMs, finishedAtMs);

  console.log(JSON.stringify(summary, null, 2));

  if (summary.failures > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
