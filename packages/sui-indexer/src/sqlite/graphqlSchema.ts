import { makeExecutableSchema } from '@graphql-tools/schema';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import {and, eq } from 'drizzle-orm';
import {dubheStoreEvents, dubheStoreSchemas, dubheStoreTransactions} from "../utils/tables";

const typeDefs = `
  type Query {
    transactions(checkpoint: Int): [Transaction!]!
    schemas(name: String): [Schema!]!
    events(name: String, checkpoint: String): [Event!]!
  }

  type Transaction {
    id: Int!
    checkpoint: Int!
    digest: String!
  }

  type Schema {
    id: Int!
    lastUpdateCheckpoint: String
    lastUpdateDigest: String
    name: String!
    key1: String
    key2: String
    value: String
    isRemoved: Boolean!
  }

  type Event {
    id: Int!
    checkpoint: String!
    digest: String!
    name: String!
    value: String!
  }
`;

export function createResolvers(database: BaseSQLiteDatabase<'sync', any>) {
	return {
		Query: {
			transactions: async (
				_: unknown,
				{ checkpoint }: { checkpoint?: number }
			) => {
				if(checkpoint) {
					return database
						.select()
						.from(dubheStoreTransactions)
						.where(
							eq(dubheStoreTransactions.checkpoint, checkpoint.toString())
						).all();
				} else {
					return database
						.select()
						.from(dubheStoreTransactions)
						.all();
				}
			},

			schemas: async (
				_: unknown,
				{
					name,
				}: {
					name?: string;
				}
			) => {
				const records = name
					? database
						.select()
						.from(dubheStoreSchemas)
						.where(
							eq(dubheStoreSchemas.name, name)
						).all()
					: database
						.select()
						.from(dubheStoreTransactions)
						.all();

				return records.map((record: any) => {
					return {
						...record,
						value: JSON.stringify(record.value),
						key1: JSON.stringify(record.key1),
						key2: JSON.stringify(record.key2),
					};
				});
			},

			events: async (
				_: unknown,
				{ name, checkpoint }: { name?: string; checkpoint?: string }
			) => {
				if (name && checkpoint) {
					const records =  database.select().from(dubheStoreEvents).where(
						and(
							eq(dubheStoreEvents.name, name),
							eq(dubheStoreEvents.checkpoint, checkpoint.toString())
						)
					).all();
					return records.map((record: any) => {
						return {
							...record,
							value: JSON.stringify(record.value),
						};
					})
				} else if (name) {
					const records = database.select().from(dubheStoreEvents).where(
						eq(dubheStoreEvents.name, name)
					).all();
					return records.map((record: any) => {
						return {
							...record,
							value: JSON.stringify(record.value),
						};
					});
				} else if (checkpoint) {
					const records = database.select().from(dubheStoreEvents).where(
						eq(dubheStoreEvents.checkpoint, checkpoint.toString())
					).all();
					return records.map((record: any) => {
						return {
							...record,
							value: JSON.stringify(record.value),
						};
					});
				} else {
					const records = database.select().from(dubheStoreEvents).all();
					return records.map((record: any) => {
						return {
							...record,
							value: JSON.stringify(record.value),
						};
					})
				}
			},
		},
	};
}

export function createSchema(database: BaseSQLiteDatabase<'sync', any>) {
	return makeExecutableSchema({
		typeDefs,
		resolvers: createResolvers(database),
	});
}
