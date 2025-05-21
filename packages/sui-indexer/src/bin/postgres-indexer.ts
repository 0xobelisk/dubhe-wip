#!/usr/bin/env node
import 'dotenv/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import Koa from 'koa';
import cors from '@koa/cors';
import { createKoaMiddleware } from 'trpc-koa-adapter';
import { createQueryAdapter } from '../postgres/createQueryAdapter';
import { healthcheck } from '../koa-middleware/healthcheck';
import { helloWorld } from '../koa-middleware/helloWorld';
import { apiRoutes } from '../postgres/apiRoutes';
import { sentry } from '../koa-middleware/sentry';
import { SuiClient } from '@mysten/sui/client';
import {
  // clearDatabase,
  dubheStoreTransactions,
  // OperationType,
  // setupDatabase,
  // syncToPostgres,
  bulkInsertTx,
  bulkInsertEvents,
  bulkUpsertSchemas,
  bulkRemoveSchemas
} from '../postgres/tables';
import { desc } from 'drizzle-orm';
import { metrics } from '../koa-middleware/metrics';
import { createAppRouter } from '../postgres/createAppRouter';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getSchemaId } from '../utils/read-history';
import { DubheConfig, loadConfig, parseData, SubscribableType } from '@0xobelisk/sui-common';
import pino, { Logger } from 'pino';

const argv = await yargs(hideBin(process.argv))
  .option('network', {
    type: 'string',
    choices: ['localnet', 'testnet', 'mainnet'],
    default: 'localnet',
    desc: 'Node network (mainnet/testnet/localnet)'
  })
  .option('config-path', {
    type: 'string',
    default: 'dubhe.config.ts',
    desc: 'Configuration file path'
  })
  .option('force-regenesis', {
    type: 'boolean',
    default: false,
    desc: 'Force regenesis'
  })
  .option('rpc-url', {
    type: 'string',
    description: 'Node URL'
  })
  .option('schema-id', {
    type: 'string',
    description: 'Schema ID to filter transactions'
  })
  .option('host', {
    type: 'string',
    description: 'Host to listen on',
    default: '0.0.0.0'
  })
  .option('port', {
    type: 'number',
    description: 'Port to listen on',
    default: 3001
  })
  .option('database-url', {
    type: 'string',
    description: 'Database URL',
    default: 'postgres://postgres:postgres@127.0.0.1:5432/postgres'
  })
  .option('sync-limit', {
    type: 'number',
    description: 'Number of transactions to sync per time (Max: 50)',
    default: 50
  })
  .option('sync-interval', {
    type: 'number',
    description: 'Number of milliseconds to wait between syncs',
    default: 1000
  })
  .option('default-page-size', {
    type: 'number',
    description: 'Default page size for pagination',
    default: 10
  })
  .option('pagination-limit', {
    type: 'number',
    description: 'Maximum pagination limit',
    default: 100
  })
  .option('sentry-dsn', {
    type: 'string',
    description: 'Sentry DSN for error tracking'
  })
  .option('debug', {
    type: 'boolean',
    description: 'Debug mode',
    default: false
  })
  .help('help')
  .alias('help', 'h').argv;

const logger: Logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss'
      // ignore: 'pid,hostname',
    }
  }
});

function getFullnodeUrl(network: 'mainnet' | 'testnet' | 'localnet'): string {
  switch (network) {
    case 'mainnet':
      return 'https://rpc-mainnet.suiscan.xyz/';
    case 'testnet':
      return 'https://rpc-testnet.suiscan.xyz/';
    case 'localnet':
      return 'http://127.0.0.1:9000/';
    default:
      throw new Error('Invalid network type');
  }
}

const rpcUrl = argv.rpcUrl || getFullnodeUrl(argv.network as 'mainnet' | 'testnet' | 'localnet');

const publicClient = new SuiClient({
  url: rpcUrl
});

const pgConnection = postgres(argv.databaseUrl, { prepare: false });
const database = drizzle(pgConnection, {
  logger: argv.debug
    ? {
        logQuery: (query, params) => {
          logger.info(`Executing SQL: ${query} - Params: ${JSON.stringify(params)}`);
        }
      }
    : undefined
});

// if (argv.forceRegenesis) {
//   clearDatabase(database);
// }
// setupDatabase(database);

async function getLastTxRecord(
  database: PostgresJsDatabase
): Promise<{ cursor: string | undefined; checkpoint: string | undefined }> {
  const txRecord = await database
    .select()
    .from(dubheStoreTransactions)
    .orderBy(desc(dubheStoreTransactions.id))
    .limit(1)
    .execute();
  if (txRecord.length === 0) {
    return { cursor: undefined, checkpoint: undefined };
  } else {
    return {
      cursor: txRecord[0].cursor,
      checkpoint: txRecord[0].checkpoint
    };
  }
}

let isCaughtUp = false;
// combineLatest([latestBlockNumber$, storedBlockLogs$])
//   .pipe(
//     filter(
//       ([latestBlockNumber, { blockNumber: lastBlockNumberProcessed }]) =>
//         latestBlockNumber === lastBlockNumberProcessed,
//     ),
//     first(),
//   )
//   .subscribe(() => {
//     isCaughtUp = true;
//     console.log("all caught up");
//   });

const app = new Koa();
const server = createServer(app.callback());
const wss = new WebSocketServer({ server });

if (argv.sentryDsn) {
  app.use(sentry(argv.sentryDsn));
}

app.use(cors());
app.use(
  healthcheck({
    isReady: () => isCaughtUp
  })
);
app.use(
  metrics({
    isHealthy: () => true,
    isReady: () => isCaughtUp,
    followBlockTag: 'latest'
  })
);
app.use(helloWorld());
app.use(apiRoutes(database, argv.defaultPageSize, argv.paginationLimit));

app.use(
  createKoaMiddleware({
    prefix: '/trpc',
    router: createAppRouter(),
    createContext: async () => ({
      queryAdapter: await createQueryAdapter(database)
    })
  })
);

const subscriptions = new Map<WebSocket, SubscribableType[]>();

wss.on('connection', (ws) => {
  logger.info('New client connected');

  ws.on('message', (message) => {
    const subs: SubscribableType[] = JSON.parse(message.toString());
    if (subs) {
      subscriptions.set(ws, subs);
      logger.info(`Client subscribed to event: ${message.toString()}`);
    }
  });

  ws.on('close', () => {
    subscriptions.delete(ws);
    logger.info('Client disconnected');
  });
});

server.listen({ host: argv.host, port: argv.port });
logger.info(`sqlite indexer frontend exposed on port ${argv.port}`);
logger.info(`  - HTTP:   http://${argv.host}:${argv.port}`);
logger.info(`  - WS:     ws://${argv.host}:${argv.port}`);
logger.info(`  - GraphQL:   http://${argv.host}:${argv.port}/graphql`);
const dubheConfig = (await loadConfig(argv.configPath)) as DubheConfig;

const path = process.cwd();
const projectPath = `${path}/src/${dubheConfig.name}`;

const schemaId = argv.schemaId || (await getSchemaId(projectPath, argv.network));

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const syncInterval = argv.network === 'localnet' ? 500 : argv.syncInterval;

// 批量去重函数，确保 (name, key1, key2) 唯一
function deduplicateSchemas(
  schemas: Array<{
    last_update_checkpoint: string;
    last_update_digest: string;
    name: string;
    key1: string | null;
    key2: string | null;
    value: string;
    is_removed: boolean;
    created_at: string;
    updated_at: string;
  }>
) {
  const map = new Map<string, (typeof schemas)[0]>();
  for (const s of schemas) {
    const key = `${s.name}|${s.key1 ?? ''}|${s.key2 ?? ''}`;
    map.set(key, s); // 保留最后一条
  }
  return Array.from(map.values());
}

// 同步进度监控数据
interface SyncProgress {
  startTime: number;
  startCheckpoint: number;
  lastCheckTime: number;
  lastCheckpoint: number;
  latestCheckpoint: number;
  syncRate: number; // checkpoints/second
}

const syncProgress: SyncProgress = {
  startTime: Date.now(),
  startCheckpoint: 0,
  lastCheckTime: Date.now(),
  lastCheckpoint: 0,
  latestCheckpoint: 0,
  syncRate: 0
};

// 更新同步进度
async function updateSyncProgress(publicClient: SuiClient, currentCheckpoint: number) {
  const now = Date.now();

  // 每30秒检查一次进度
  if (now - syncProgress.lastCheckTime < 30000) {
    return;
  }

  try {
    // 获取链上最新 checkpoint
    const latestCheckpointData = await publicClient.getLatestCheckpointSequenceNumber();
    const latestCheckpoint = Number(latestCheckpointData);

    // 更新进度数据
    if (syncProgress.startCheckpoint === 0) {
      // 初始化起始值
      syncProgress.startCheckpoint = currentCheckpoint;
      syncProgress.lastCheckpoint = currentCheckpoint;
      syncProgress.latestCheckpoint = latestCheckpoint;
      syncProgress.lastCheckTime = now;
      return;
    }

    // 计算同步速率 (checkpoints/second)
    const elapsedSeconds = (now - syncProgress.lastCheckTime) / 1000;
    const checkpointsDone = currentCheckpoint - syncProgress.lastCheckpoint;

    if (elapsedSeconds > 0) {
      syncProgress.syncRate = checkpointsDone / elapsedSeconds;
    }

    // 计算剩余时间
    const remainingCheckpoints = latestCheckpoint - currentCheckpoint;
    let estimatedSeconds =
      syncProgress.syncRate > 0 ? remainingCheckpoints / syncProgress.syncRate : 0;

    // 构建人性化时间格式
    let timeRemaining = '未知';
    if (syncProgress.syncRate > 0) {
      const hours = Math.floor(estimatedSeconds / 3600);
      const minutes = Math.floor((estimatedSeconds % 3600) / 60);
      const seconds = Math.floor(estimatedSeconds % 60);

      timeRemaining =
        hours > 0
          ? `${hours}小时${minutes}分钟`
          : minutes > 0
            ? `${minutes}分钟${seconds}秒`
            : `${seconds}秒`;
    }

    // 计算进度百分比
    const totalToSync = latestCheckpoint - syncProgress.startCheckpoint;
    const syncedSoFar = currentCheckpoint - syncProgress.startCheckpoint;
    const progressPercent =
      totalToSync > 0 ? ((syncedSoFar / totalToSync) * 100).toFixed(2) : '0.00';

    // 输出进度信息
    logger.info(`========== 同步进度报告 ==========`);
    logger.info(
      `当前 checkpoint: ${currentCheckpoint} / ${latestCheckpoint} (${progressPercent}%)`
    );
    logger.info(`同步速度: ${(syncProgress.syncRate * 60).toFixed(2)} checkpoints/分钟`);
    logger.info(`预计剩余时间: ${timeRemaining}`);
    logger.info(`距离链头差距: ${remainingCheckpoints} checkpoints`);
    logger.info(`==================================`);

    // 更新最后检查时间和检查点
    syncProgress.lastCheckTime = now;
    syncProgress.lastCheckpoint = currentCheckpoint;
    syncProgress.latestCheckpoint = latestCheckpoint;
  } catch (error) {
    logger.error(`更新同步进度时出错: ${error}`);
  }
}

while (true) {
  const lastTxRecord = await getLastTxRecord(database);
  await delay(syncInterval);
  if (argv.debug) {
    logger.info('Syncing transactions...');
  }

  // 获取当前checkpoint，用于更新进度
  const currentCheckpoint = lastTxRecord.checkpoint ? Number(lastTxRecord.checkpoint) : 0;

  // 更新同步进度
  await updateSyncProgress(publicClient, currentCheckpoint);

  let response = await publicClient.queryTransactionBlocks({
    filter: {
      ChangedObject: schemaId
    },
    order: 'ascending',
    cursor: lastTxRecord.cursor,
    limit: argv.syncLimit,
    options: {
      showEvents: true,
      showInput: true
    }
  });

  // 调试日志：打印 RPC 响应数据
  logger.info(`==== 本次批量拉取到的交易数量: ${response.data.length} ====`);
  for (const tx of response.data) {
    // // 随机抽查部分交易详细内容
    // if (Math.random() < 0.1) {
    //   // 10%概率打印详细信息
    if (argv.debug) {
      logger.info(`交易 ${tx.digest} 的 events 数量: ${tx.events ? tx.events.length : 0}`);

      logger.info(
        `交易 ${tx.digest} 的完整结构: ${JSON.stringify({
          events: tx.events,
          sender: tx.transaction?.data?.sender,
          checkpoint: tx.checkpoint
        })}`
      );
    }
  }

  // 批量收集
  const txInserts: Array<{
    sender: string;
    checkpoint: string;
    digest: string;
    pkg: string;
    mod: string;
    func: string;
    args: string;
    cursor: string;
    created_at: string;
  }> = [];
  const eventInserts: Array<{
    sender: string;
    checkpoint: string;
    digest: string;
    name: string;
    value: string;
    created_at: string;
  }> = [];
  const schemaOps: Array<{
    type: 'set' | 'remove';
    tx: any;
    event: any;
  }> = [];

  const txs = response.data.map((tx: any) => ({
    ...tx,
    cursor: tx.digest,
    sender: tx.transaction?.data?.sender
  }));

  for (const tx of txs) {
    if (tx.events && tx.events.length !== 0) {
      if (argv.debug) {
        logger.info(`处理有 events 的交易 ${tx.digest}, events 数量: ${tx.events.length}`);
      }

      for (const moveCall of (tx.transaction?.data?.transaction?.transactions || []) as any[]) {
        if (moveCall.MoveCall) {
          txInserts.push({
            sender: tx.sender,
            checkpoint: tx.checkpoint!.toString(),
            digest: tx.digest,
            pkg: moveCall.MoveCall.package,
            mod: moveCall.MoveCall.module,
            func: moveCall.MoveCall.function,
            args: JSON.stringify(tx.transaction?.data?.transaction?.inputs ?? []),
            cursor: tx.cursor,
            created_at: tx.timestampMs!.toString()
          });
        }
      }

      for (const event of tx.events as any[]) {
        const parsedJson = event.parsedJson as any;
        const name = parsedJson['name'];
        if (argv.debug) {
          logger.info(`处理 event: ${name}, value 类型: ${JSON.stringify(parsedJson['value'])}`);
        }

        if (name && typeof name === 'string' && name.endsWith('_event')) {
          let eventData = parseData({
            sender: tx.sender,
            name,
            value: parsedJson['value']
          });
          eventData.value =
            typeof eventData.value === 'object' ? JSON.stringify(eventData.value) : eventData.value;
          eventInserts.push({
            sender: tx.sender,
            checkpoint: tx.checkpoint?.toString() as string,
            digest: tx.digest,
            name: name,
            value: eventData.value,
            created_at: tx.timestampMs?.toString() as string
          });
          if (argv.debug) {
            logger.info(
              `添加到 eventInserts: ${name}, 当前 eventInserts 数量: ${eventInserts.length}`
            );
          }
        } else if (parsedJson && Object.prototype.hasOwnProperty.call(parsedJson, 'value')) {
          schemaOps.push({
            type: 'set',
            tx,
            event
          });
        } else {
          schemaOps.push({
            type: 'remove',
            tx,
            event
          });
        }
      }
    } else {
      if (argv.debug) {
        logger.warn(`No events found for transaction ${tx.digest}`);
        logger.warn(`Please replace rpc-url to get events`);
        logger.warn(`Current rpc-url: ${rpcUrl}`);
      }
    }
  }

  const schemaSetInserts: Array<{
    last_update_checkpoint: string;
    last_update_digest: string;
    name: string;
    key1: string | null;
    key2: string | null;
    value: string;
    is_removed: boolean;
    created_at: string;
    updated_at: string;
  }> = [];
  const schemaRemoveOps: Array<{
    name: string;
    key1: string | null;
    key2: string | null;
    updated_at: string;
  }> = [];

  for (const op of schemaOps) {
    if (op.type === 'set') {
      const parsed = parseData(op.event.parsedJson);
      schemaSetInserts.push({
        last_update_checkpoint: op.tx.checkpoint!.toString(),
        last_update_digest: op.tx.digest,
        name: parsed.name,
        key1: parsed.key1 ?? null,
        key2: parsed.key2 ?? null,
        value: typeof parsed.value === 'object' ? JSON.stringify(parsed.value) : parsed.value,
        is_removed: false,
        created_at: op.tx.timestampMs!.toString(),
        updated_at: op.tx.timestampMs!.toString()
      });
    } else {
      const parsed = parseData(op.event.parsedJson);
      schemaRemoveOps.push({
        name: parsed.name,
        key1: parsed.key1 ?? null,
        key2: parsed.key2 ?? null,
        updated_at: op.tx.timestampMs!.toString()
      });
    }
  }

  // 批量写入，包裹在事务里
  logger.info(`==== 准备批量写入数据库 ====`);
  logger.info(`txInserts 数量: ${txInserts.length}`);
  logger.info(`eventInserts 数量: ${eventInserts.length}`);
  logger.info(`schemaSetInserts 数量: ${schemaSetInserts.length}`);
  logger.info(`schemaRemoveOps 数量: ${schemaRemoveOps.length}`);

  await database.transaction(async (trx) => {
    await bulkInsertTx(trx, txInserts);
    await bulkInsertEvents(trx, eventInserts);
    const dedupedSchemaSetInserts = deduplicateSchemas(schemaSetInserts);
    await bulkUpsertSchemas(trx, dedupedSchemaSetInserts);
    await bulkRemoveSchemas(trx, schemaRemoveOps);
  });
}
