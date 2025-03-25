#!/usr/bin/env node
import 'dotenv/config';
// import fs from "node:fs";
// import { eq } from "drizzle-orm";
import {BetterSQLite3Database, drizzle} from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
// import { webSocket, http, Transport } from "viem";
import Koa from 'koa';
import cors from '@koa/cors';
import { createKoaMiddleware } from 'trpc-koa-adapter';
// import { createAppRouter } from "@latticexyz/store-sync/trpc-indexer";
// import { chainState, schemaVersion, syncToSqlite } from "@latticexyz/store-sync/sqlite";
import { createQueryAdapter } from '../sqlite/createQueryAdapter';
// import { isDefined } from "@latticexyz/common/utils";
// import { combineLatest, filter, first } from "rxjs";
import { healthcheck } from '../koa-middleware/healthcheck';
import { helloWorld } from '../koa-middleware/helloWorld';
import { apiRoutes } from '../sqlite/apiRoutes';
import { sentry } from '../koa-middleware/sentry';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import {
	clearDatabase,
	dubheStoreEvents,
	dubheStoreTransactions,
	insertTx,
	OperationType,
	setupDatabase,
	syncToSqlite,
} from '../utils/tables';
import { desc } from 'drizzle-orm';
import { metrics } from '../koa-middleware/metrics';
import { createAppRouter } from '../sqlite/createAppRouter';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { getSchemaId } from '../utils/read-history';
import { DubheConfig, loadConfig, parseData, SubscribableType, SubscriptionKind } from '@0xobelisk/sui-common';
import { fetchAllEvents, fetchTransactionBlocks } from '../utils/graphql-query';
import fs from 'fs';
import pathModule from 'path';

const argv = await yargs(hideBin(process.argv))
	.option('network', {
		type: 'string',
		choices: ['mainnet', 'testnet', 'localnet'],
		default: 'localnet',
		desc: 'Node network (mainnet/testnet/localnet)',
	})
	.option('config-path', {
		type: 'string',
		default: 'dubhe.config.ts',
		desc: 'Configuration file path',
	})
	.option('force-regenesis', {
		type: 'boolean',
		default: false,
		desc: 'Force regenesis',
	})
	.option('url', {
		type: 'string',
		description: 'Node URL',
		// demandOption: true,
	})
	.option('schema-id', {
		type: 'string',
		description: 'Schema ID to filter transactions',
		// demandOption: true,
	})
	.option('host', {
		type: 'string',
		description: 'Host to listen on',
		default: '0.0.0.0',
	})
	.option('port', {
		type: 'number',
		description: 'Port to listen on',
		default: 3001,
	})
	.option('sqlite-filename', {
		type: 'string',
		description: 'SQLite database filename',
		default: '.data/indexer.db',
	})
	.option('sync-limit', {
		type: 'number',
		description: 'Number of transactions to sync per time',
		default: 50,
	})
	.option('default-page-size', {
		type: 'number',
		description: 'Default page size for pagination',
		default: 10,
	})
	.option('pagination-limit', {
		type: 'number',
		description: 'Maximum pagination limit',
		default: 100,
	})
	.option('sentry-dsn', {
		type: 'string',
		description: 'Sentry DSN for error tracking',
	})
	.help('help')
	.alias('help', 'h').argv;

// console.log(argv);

// const transports: Transport[] = [
//   // prefer WS when specified
//   env.RPC_WS_URL ? webSocket(env.RPC_WS_URL) : undefined,
//   // otherwise use or fallback to HTTP
//   env.RPC_HTTP_URL ? http(env.RPC_HTTP_URL) : undefined,
// ].filter(isDefined);

const publicClient = new SuiClient({
	url: argv.url ? argv.url : getFullnodeUrl(argv.network as any),
});

const graphqlEndpoint =
	argv.network === 'mainnet'
		? 'https://sui-mainnet.mystenlabs.com/graphql'
		: 'https://sui-testnet.mystenlabs.com/graphql';

const ensureDirectoryExists =  function (filePath: string) {
	const dir = pathModule.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

ensureDirectoryExists(argv.sqliteFilename);
const database = drizzle(new Database(argv.sqliteFilename));
if (argv.forceRegenesis) {
	clearDatabase(database);
}
setupDatabase(database);

async function getLastTxRecord(
	sqliteDB: BetterSQLite3Database
): Promise<{ cursor: string | undefined; checkpoint: string | undefined }> {
	const txRecord = await sqliteDB
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
			checkpoint: txRecord[0].checkpoint,
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
		isReady: () => isCaughtUp,
	})
);
app.use(
	metrics({
		isHealthy: () => true,
		isReady: () => isCaughtUp,
		followBlockTag: 'latest',
	})
);
app.use(helloWorld());
app.use(apiRoutes(database, argv.defaultPageSize, argv.paginationLimit));

app.use(
	createKoaMiddleware({
		prefix: '/trpc',
		router: createAppRouter(),
		createContext: async () => ({
			queryAdapter: await createQueryAdapter(database),
		}),
	})
);

const subscriptions = new Map<WebSocket, SubscribableType[]>();

wss.on('connection', ws => {
	console.log('New client connected');

	ws.on('message', message => {
		const subs: SubscribableType[] = JSON.parse(message.toString());
		if (subs) {
			subscriptions.set(ws, subs);
			console.log(`Client subscribed to event: ${subs}`);
		}
	});

	ws.on('close', () => {
		subscriptions.delete(ws);
		console.log('Client disconnected');
	});
});

server.listen({ host: argv.host, port: argv.port });
console.log(`sqlite indexer frontend exposed on port ${argv.port}`);
console.log(`  - HTTP:   http://${argv.host}:${argv.port}`);
console.log(`  - WS:     ws://${argv.host}:${argv.port}`);
console.log(`  - GraphQL:   http://${argv.host}:${argv.port}/graphql`);
const dubheConfig = (await loadConfig(argv.configPath)) as DubheConfig;

const path = process.cwd();
const projectPath = `${path}/contracts/${dubheConfig.name}`;

const schemaId =
	argv.schemaId || (await getSchemaId(projectPath, argv.network));

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

while (true) {
	const lastTxRecord = await getLastTxRecord(database);
	let txs;
	if (argv.network === 'mainnet' || argv.network === 'testnet') {
		await delay(2000);
		try {
			const graphqlResponse = await fetchTransactionBlocks({
				graphqlEndpoint,
				changedObject: schemaId,
				first: argv.syncLimit,
				afterCheckpoint: lastTxRecord.checkpoint
					? parseInt(lastTxRecord.checkpoint)
					: undefined,
			});

			txs = await Promise.all(
				graphqlResponse.transactionBlocks.edges.map(async edge => {
					const cursor = edge.cursor;
					const tx = edge.node;

					const allEvents = await fetchAllEvents({
						graphqlEndpoint,
						transactionDigest: tx.digest,
					});
					return {
						cursor,
						digest: tx.digest,
						checkpoint:
							tx.effects.checkpoint.sequenceNumber.toString(),
						timestampMs: new Date(tx.effects.timestamp)
							.getTime()
							.toString(),
						events: allEvents.map(event => ({
							parsedJson: event.contents.json,
						})),
						sender: ""
						// events: tx.effects.events.nodes.map(node => ({
						// 	parsedJson: node.contents.json,
						// })),
					};
				})
			);
		} catch (error) {
			console.error('Error fetching GraphQL data:', error);
			await delay(5000);
			continue;
		}
	} else {
		await delay(2000);
		let response = await publicClient.queryTransactionBlocks({
			filter: {
				ChangedObject: schemaId,
			},
			order: 'ascending',
			cursor: lastTxRecord.cursor,
			limit: argv.syncLimit,
			options: {
				showEvents: true,
				showInput: true,
			},
		});

		txs = response.data.map(tx => ({
			...tx,
			cursor: tx.digest,
			sender: tx.transaction?.data?.sender
		}));
	}

	for (const tx of txs) {
		await insertTx(
			database,
			// @ts-ignore
			tx.sender,
			tx.checkpoint?.toString() as string,
			tx.digest,
			tx.cursor,
			tx.timestampMs?.toString() as string
		);

		if (tx.events) {
			for (const event of tx.events) {
				console.log(
					'EventData: ',
					JSON.stringify(event.parsedJson, null, 2)
				);

				// @ts-ignore
				const name: string = event.parsedJson['name'];
				if (name.endsWith('_event')) {
					const eventData = parseData({
						sender: tx.sender,
						name,
						// @ts-ignore
						value: event.parsedJson['value'],
					});
					// Broadcast the event to subscribed WebSocket clients
					wss.clients.forEach(client => {
						if (client.readyState !== client.OPEN) return;
						const clientSubs = subscriptions.get(client);
						if (!clientSubs) return;
						clientSubs.forEach(sub => {
							if (
								sub.kind === SubscriptionKind.Event &&
								sub.name === (name + '_event') &&
								(!sub.sender || sub.sender === tx.sender)
							) {
								client.send(JSON.stringify(eventData));
							}
						});
					});
					await database.insert(dubheStoreEvents).values(parseData({
						sender: tx.sender,
						checkpoint: tx.checkpoint?.toString() as string,
						digest: tx.digest,
						created_at: tx.timestampMs?.toString() as string,
						name: name,
						// @ts-ignore
						value: event.parsedJson['value'],
					}));
					// Handle schema set events
					// @ts-ignore
				} else if (event.parsedJson.hasOwnProperty('value')) {
					const schemaData = parseData(event.parsedJson);
					wss.clients.forEach(client => {
						if (client.readyState !== client.OPEN) return;

						const clientSubs = subscriptions.get(client);
						if (!clientSubs) return;
						clientSubs.forEach(sub => {
							if (
								sub.kind === SubscriptionKind.Schema &&
								sub.name === name
							) {
								client.send(JSON.stringify(schemaData));
							}
						});
					});
					await syncToSqlite(
						database,
						tx.checkpoint?.toString() as string,
						tx.digest,
						tx.timestampMs?.toString() as string,
						event.parsedJson,
						OperationType.Set
					);
				} else {
					const schemaData = {
						// @ts-ignore
						...event.parsedJson,
						value: null
					};
					wss.clients.forEach(client => {
						if (client.readyState !== client.OPEN) return;

						const clientSubs = subscriptions.get(client);
						if (!clientSubs) return;

						clientSubs.forEach(sub => {
							if (
								sub.kind === SubscriptionKind.Schema &&
								sub.name.includes(name)
							) {
								client.send(JSON.stringify(schemaData));
							}
						});
					});

					await syncToSqlite(
						database,
						tx.checkpoint?.toString() as string,
						tx.digest,
						tx.timestampMs?.toString() as string,
						event.parsedJson,
						OperationType.Remove
					);
				}
			}
		}
	}
}
