import {and, eq, getTableName, isNull, or } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/better-sqlite3";

export enum OperationType {
    Set = "Set",
    Remove = "Remove"
}


type EventData = {
    name: string,
    key1: string | object,
    key2: string | object,
    value: string | object
}

export const dubheStoreTransactions = sqliteTable("__dubheStoreTransactions", {
    id: integer("id").notNull().primaryKey().unique(),
    checkpoint: text("checkpoint").notNull(),
    digest: text("digest").notNull(),
});

export const dubheStoreSchemas = sqliteTable("__dubheStoreSchemas", {
    id: integer("id").notNull().primaryKey().unique(),
    name: text("name").notNull(),
    key1: text("key1", { mode: "json" }),
    key2: text("key2", { mode: "json" }),
    value: text("value", { mode: "json" }).notNull(),
    last_update_checkpoint: text("last_update_checkpoint").notNull(),
    last_update_digest: text("last_update_digest").notNull(),
    is_removed: integer("is_removed", { mode: "boolean" }).notNull().default(false),
});

export const dubheStoreEvents = sqliteTable("__dubheStoreEvents", {
    id: integer("id").notNull().primaryKey().unique(),
    name: text("name").notNull(),
    value: text("value", { mode: "json" }).notNull(),
    checkpoint: text("checkpoint").notNull(),
    digest: text("digest").notNull(),
});

export async function insertTx(sqliteDB: ReturnType<typeof drizzle>, checkpoint: string, digest: string) {
    await sqliteDB.insert(dubheStoreTransactions).values({
        checkpoint,
        digest
    })
}

export async function syncToSqlite(sqliteDB: ReturnType<typeof drizzle>, checkpoint: string, digest: string, event: unknown, operationType: OperationType) {
    let res = event as EventData;
    if (operationType === OperationType.Remove) {
        sqliteDB.update(dubheStoreSchemas).set({ is_removed: true }).where(
            and(
                eq(dubheStoreSchemas.name, res.name),
                and(
                    or(eq(dubheStoreSchemas.key1, res.key1), isNull(dubheStoreSchemas.key1))
                ),
                and(
                    or(eq(dubheStoreSchemas.key2, res.key2), isNull(dubheStoreSchemas.key2))
                )
            )
        )
            .execute();
    } else {
        const existingRecord = await sqliteDB
            .select()
            .from(dubheStoreSchemas)
            .where(
                and(
                    eq(dubheStoreSchemas.name, res.name),
                    and(
                        or(eq(dubheStoreSchemas.key1, res.key1), isNull(dubheStoreSchemas.key1))
                    ),
                    and(
                        or(eq(dubheStoreSchemas.key2, res.key2), isNull(dubheStoreSchemas.key2))
                    )
                )
            )
            .execute();

        // existingRecord

        console.log("existingRecord", existingRecord);

        if (existingRecord.length > 0) {
            const id = existingRecord[0].id;
            await sqliteDB
                .update(dubheStoreSchemas)
                .set({
                    last_update_checkpoint: checkpoint,
                    last_update_digest: digest,
                    value: res.value,
                    is_removed: false
                })
                .where(eq(dubheStoreSchemas.id, id))
                .execute();
            console.log("Data updated successfully:", checkpoint, digest, res.name);
        } else {
            await sqliteDB
                .insert(dubheStoreSchemas)
                .values({
                    last_update_checkpoint: checkpoint,
                    last_update_digest: digest,
                    name: res.name,
                    key1: res.key1,
                    key2: res.key2,
                    value: res.value,
                    is_removed: false
                })
                .execute();
            console.log("Data inserted successfully:", checkpoint, digest, res.name);
        }
    }
}

export const internalTables = [dubheStoreTransactions, dubheStoreSchemas];
export const internalTableNames = internalTables.map(getTableName);
