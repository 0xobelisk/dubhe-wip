#!/usr/bin/env node
import "dotenv/config";
// import fs from "node:fs";
import {z} from "zod";
// import { eq } from "drizzle-orm";
import {drizzle} from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
// import { webSocket, http, Transport } from "viem";
import Koa from "koa";
import cors from "@koa/cors";
import {createKoaMiddleware} from "trpc-koa-adapter";
// import { createAppRouter } from "@latticexyz/store-sync/trpc-indexer";
// import { chainState, schemaVersion, syncToSqlite } from "@latticexyz/store-sync/sqlite";
import {createQueryAdapter} from "../sqlite/createQueryAdapter";
// import { isDefined } from "@latticexyz/common/utils";
// import { combineLatest, filter, first } from "rxjs";
import {frontendEnvSchema, indexerEnvSchema, parseEnv} from "./parseEnv";
import {healthcheck} from "../koa-middleware/healthcheck";
import {helloWorld} from "../koa-middleware/helloWorld";
import {apiRoutes} from "../sqlite/apiRoutes";
import {sentry} from "../koa-middleware/sentry";
import {getFullnodeUrl, SuiClient} from "@mysten/sui/client";
import {BaseSQLiteDatabase} from "drizzle-orm/sqlite-core/index";
import {dubheStoreEvents, dubheStoreTransactions, insertTx, OperationType, syncToSqlite} from "../utils/tables";
import {desc, sql} from "drizzle-orm";
import {metrics} from "../koa-middleware/metrics";
import {createAppRouter} from "../sqlite/createAppRouter";

const env = parseEnv(
  z.intersection(
    z.intersection(indexerEnvSchema, frontendEnvSchema),
    z.object({
      SQLITE_FILENAME: z.string().default("indexer.db"),
      SENTRY_DSN: z.string().optional(),
    }),
  ),
);

console.log(env);

// const transports: Transport[] = [
//   // prefer WS when specified
//   env.RPC_WS_URL ? webSocket(env.RPC_WS_URL) : undefined,
//   // otherwise use or fallback to HTTP
//   env.RPC_HTTP_URL ? http(env.RPC_HTTP_URL) : undefined,
// ].filter(isDefined);

const publicClient = new SuiClient({url: getFullnodeUrl(env.NETWORK) });

const chainId = await publicClient.getChainIdentifier();
console.log("chainId", chainId);
const database = drizzle(new Database(env.SQLITE_FILENAME));

database.run(sql`CREATE TABLE IF NOT EXISTS __dubheStoreTransactions (id INTEGER PRIMARY KEY AUTOINCREMENT, checkpoint INTEGER, digest TEXT)`);
database.run(sql`
        CREATE TABLE IF NOT EXISTS __dubheStoreSchemas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            last_update_checkpoint TEXT,
            last_update_digest TEXT,
            name TEXT,
            key1 TEXT,
            key2 TEXT,
            value TEXT,
            is_removed BOOLEAN DEFAULT FALSE
        )`);
database.run(sql`
        CREATE TABLE IF NOT EXISTS __dubheStoreEvents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checkpoint TEXT,
            digest TEXT,
            name TEXT,
            value TEXT
        )`);

async function getLastTxRecord(sqliteDB: BaseSQLiteDatabase<"sync", any>): Promise<string | undefined> {
    const txRecord = await sqliteDB
        .select()
        .from(dubheStoreTransactions)
        .orderBy(desc(dubheStoreTransactions.id))
        .limit(1)
        .execute();
    if (txRecord.length === 0) {
        return undefined;
    } else {
        return txRecord[0].digest;
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

const server = new Koa();

if (env.SENTRY_DSN) {
  server.use(sentry(env.SENTRY_DSN));
}

server.use(cors());
server.use(
  healthcheck({
    isReady: () => isCaughtUp,
  }),
);
server.use(
  metrics({
    isHealthy: () => true,
    isReady: () => isCaughtUp,
    // getLatestStoredBlockNumber,
    // getDistanceFromFollowBlock,
    followBlockTag: env.FOLLOW_BLOCK_TAG,
  }),
);
server.use(helloWorld());
server.use(apiRoutes(database));

server.use(
  createKoaMiddleware({
    prefix: "/trpc",
    router: createAppRouter(),
    createContext: async () => ({
      queryAdapter: await createQueryAdapter(database),
    }),
  }),
);

server.listen({ host: env.HOST, port: env.PORT });
console.log(`sqlite indexer frontend listening on http://${env.HOST}:${env.PORT}`);

const delay = (ms: number) =>
    new Promise(resolve => setTimeout(resolve, ms));


while (true) {
    await delay(2000);
    const lastTxRecord = await getLastTxRecord(database)
    const response = await publicClient.queryTransactionBlocks({
        filter: {
            ChangedObject: env.SCHEMA_ID
        },
        order: "ascending",
        cursor: lastTxRecord,
        limit: 10,
        options: {
            showEvents: true
        }
    });
    const txs = response.data
    for (const tx of txs) {
        await insertTx(database, tx.checkpoint?.toString() as string, tx.digest);
        if (tx.events) {
            for (const event of tx.events) {
                // console.log("EventData: ", event);
                console.log("EventData: ", event.parsedJson);

                // @ts-ignore
                const name: string = event.parsedJson["name"];
                if(name.endsWith('_event')) {
                    await database.insert(dubheStoreEvents).values({
                        checkpoint: tx.checkpoint?.toString() as string,
                        digest: tx.digest,
                        name: name,
                        // @ts-ignore
                        value: event.parsedJson["value"],
                    })
                    // @ts-ignore
                } else if (event.parsedJson.hasOwnProperty("value")) {
                    await syncToSqlite(database, tx.checkpoint?.toString() as string, tx.digest, event.parsedJson, OperationType.Set);
                } else {
                    await syncToSqlite(database, tx.checkpoint?.toString() as string, tx.digest, event.parsedJson, OperationType.Remove);
                }
            }
        }
    }
}
