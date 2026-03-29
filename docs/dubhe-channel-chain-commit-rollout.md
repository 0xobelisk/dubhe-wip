# Dubhe Channel Chain Commit 上线与回滚手册

## 1. 开关与前置条件

- 必开：`DUBHE_CHANNEL_CHAIN_COMMIT_ENABLED=true`
- 必填：`PRIVATE_KEY=<sui keypair>`
- 可选：`DUBHE_CHANNEL_DUBHE_CONFIG_PATH=./dubhe.config.json`（默认 `dubhe.config.json`）
- 多实例强烈建议：配置 `--redis-url`，否则仅进程内可见 outbox/lease。

## 2. 观测接口

- `GET /ready`

  - `chain_commit.enabled`
  - `chain_commit.outbox_size`
  - `chain_commit.dead_letter_size`
  - `alerts.submit_chain_commit_outbox_active`
  - `alerts.submit_chain_commit_dead_letter_active`

- `GET /ops/materialization/chain_commit/status`（需 `x-obelisk-admin-token`）

  - writer lease owner/ttl
  - outbox/dead-letter backlog
  - dead-letter 预览（`?limit=20`）
  - retry 与 marker 配置

- `GET /metrics`
  - `dubhe_channel_submit_chain_commit_outbox_size`
  - `dubhe_channel_submit_chain_commit_dead_letter_size`
  - `dubhe_channel_submit_chain_commit_outbox_enqueued_total`
  - `dubhe_channel_submit_chain_commit_outbox_retries_total`
  - `dubhe_channel_submit_chain_commit_outbox_recovered_total`
  - `dubhe_channel_submit_chain_commit_outbox_dropped_total`
  - `dubhe_channel_submit_chain_commit_failures_total`
  - `dubhe_channel_submit_chain_commit_writer_lease_acquired_total`
  - `dubhe_channel_submit_chain_commit_writer_lease_conflicts_total`

## 3. 灰度步骤

1. 单实例灰度

- 仅开启 1 个实例的 `DUBHE_CHANNEL_CHAIN_COMMIT_ENABLED=true`。
- 观察 `/ready` 和 `/ops/materialization/chain_commit/status`，确保 outbox 不持续增长。

2. 双实例验证

- 开到 2 个实例并共享同一 Redis namespace。
- 确认 writer lease 在实例间互斥；`outbox_size` 能持续归零。

3. 全量放开

- 按业务容量扩实例。
- 重点盯 `dead_letter.size` 和 `alerts.submit_chain_commit_*`。

## 4. 回滚步骤

1. 关闭开关：`DUBHE_CHANNEL_CHAIN_COMMIT_ENABLED=false`。
2. 重启 channel 进程。
3. 确认 `/ready` 中 `chain_commit.enabled=false`。
4. 若需恢复，先处理 `ops/materialization/chain_commit/status` 中 dead-letter，再重新灰度开启。

## 5. 语义说明

- Redis 模式下：
  - 共享 outbox + writer lease 保证同一时刻只有一个 writer 提交。
  - `commit_id` marker 提供去重窗口（默认 24h）。
- 非 Redis 模式下：
  - 仅进程内 lease/outbox，可用作单机开发验证，不建议多实例生产。
