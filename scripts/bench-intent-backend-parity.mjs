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

const suiUrl = (args.get('sui-url') || process.env.DUBHE_PARITY_SUI_URL || 'http://127.0.0.1:18080').replace(/\/$/, '');
const riscvUrl = (args.get('riscv-url') || process.env.DUBHE_PARITY_RISCV_URL || 'http://127.0.0.1:18081').replace(/\/$/, '');
const samples = Number(args.get('samples') || process.env.DUBHE_PARITY_SAMPLES || 20);
const timeoutMs = Number(args.get('timeout-ms') || process.env.DUBHE_PARITY_TIMEOUT_MS || 15_000);
const sender = args.get('sender') || process.env.DUBHE_PARITY_SENDER || '0x15fde77101778fafe8382743171294dfd8e7900a547711ee375379c27a85fd31';
const clockObjectId = args.get('clock-object-id') || process.env.DUBHE_PARITY_CLOCK_OBJECT_ID || '0x6';
const packageId = args.get('package-id') || process.env.DUBHE_PARITY_PACKAGE_ID || '0x2';
const moduleName = args.get('module') || process.env.DUBHE_PARITY_MODULE || 'clock';
const functionName = args.get('function') || process.env.DUBHE_PARITY_FUNCTION || 'timestamp_ms';

if (samples <= 0) {
  throw new Error('samples must be > 0');
}

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const output = {};
    for (const key of keys) {
      output[key] = canonicalize(value[key]);
    }
    return output;
  }
  return value;
}

async function postJson(url, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const elapsedMs = performance.now() - start;
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Keep raw text for diagnostics.
    }
    return { ok: response.ok, status: response.status, elapsedMs, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function buildIntentPayload() {
  return {
    sender,
    intent: {
      kind: 'sui_move_call',
      package: packageId,
      module: moduleName,
      function: functionName,
      typeArguments: [],
      inputs: [{ $kind: 'UnresolvedObject', UnresolvedObject: { objectId: clockObjectId } }],
      arguments: [{ $kind: 'Input', Input: 0, type: 'object' }],
    },
  };
}

async function runSingleBackend(label, baseUrl) {
  const compileResponse = await postJson(`${baseUrl}/intent/compile`, buildIntentPayload());
  if (!compileResponse.ok || !compileResponse.json?.success || !compileResponse.json?.data?.submit) {
    return {
      ok: false,
      stage: 'compile',
      label,
      status: compileResponse.status,
      elapsedMs: compileResponse.elapsedMs,
      body: compileResponse.json ?? compileResponse.text,
    };
  }

  const submitPayload = compileResponse.json.data.submit;
  const submitResponse = await postJson(`${baseUrl}/submit`, submitPayload);
  if (!submitResponse.ok || !submitResponse.json?.success) {
    return {
      ok: false,
      stage: 'submit',
      label,
      status: submitResponse.status,
      elapsedMs: submitResponse.elapsedMs,
      body: submitResponse.json ?? submitResponse.text,
    };
  }

  return {
    ok: true,
    label,
    compileMs: compileResponse.elapsedMs,
    submitMs: submitResponse.elapsedMs,
    compileData: compileResponse.json.data,
    submitData: submitResponse.json.data,
  };
}

const metrics = {
  sui: { compile: [], submit: [] },
  riscv: { compile: [], submit: [] },
};
const mismatches = [];
const failures = [];

for (let i = 0; i < samples; i += 1) {
  const [sui, riscv] = await Promise.all([
    runSingleBackend('sui', suiUrl),
    runSingleBackend('riscv', riscvUrl),
  ]);

  if (!sui.ok) {
    failures.push({ sample: i + 1, backend: 'sui', detail: sui });
    continue;
  }
  if (!riscv.ok) {
    failures.push({ sample: i + 1, backend: 'riscv', detail: riscv });
    continue;
  }

  metrics.sui.compile.push(sui.compileMs);
  metrics.sui.submit.push(sui.submitMs);
  metrics.riscv.compile.push(riscv.compileMs);
  metrics.riscv.submit.push(riscv.submitMs);

  const suiPtb = JSON.stringify(canonicalize(sui.compileData.ptb));
  const riscvPtb = JSON.stringify(canonicalize(riscv.compileData.ptb));
  if (suiPtb !== riscvPtb) {
    mismatches.push({
      sample: i + 1,
      suiBackend: sui.compileData.backend,
      riscvBackend: riscv.compileData.backend,
      suiPtb: canonicalize(sui.compileData.ptb),
      riscvPtb: canonicalize(riscv.compileData.ptb),
    });
  }
}

for (const key of ['sui', 'riscv']) {
  metrics[key].compile.sort((a, b) => a - b);
  metrics[key].submit.sort((a, b) => a - b);
}

const summary = {
  config: {
    samples,
    timeoutMs,
    sender,
    intent: {
      packageId,
      moduleName,
      functionName,
      clockObjectId,
    },
    endpoints: { suiUrl, riscvUrl },
  },
  results: {
    completedSamples: metrics.sui.compile.length,
    failures: failures.length,
    parityMismatches: mismatches.length,
    parityRate:
      metrics.sui.compile.length === 0
        ? 0
        : Number(
            (
              ((metrics.sui.compile.length - mismatches.length) / metrics.sui.compile.length) *
              100
            ).toFixed(2),
          ),
    latencyMs: {
      sui: {
        compile: {
          p50: percentile(metrics.sui.compile, 50),
          p95: percentile(metrics.sui.compile, 95),
        },
        submit: {
          p50: percentile(metrics.sui.submit, 50),
          p95: percentile(metrics.sui.submit, 95),
        },
      },
      riscv: {
        compile: {
          p50: percentile(metrics.riscv.compile, 50),
          p95: percentile(metrics.riscv.compile, 95),
        },
        submit: {
          p50: percentile(metrics.riscv.submit, 50),
          p95: percentile(metrics.riscv.submit, 95),
        },
      },
    },
  },
  mismatchSamples: mismatches.slice(0, 3),
  failureSamples: failures.slice(0, 3),
};

console.log(JSON.stringify(summary, null, 2));

if (failures.length > 0 || mismatches.length > 0) {
  process.exit(1);
}
