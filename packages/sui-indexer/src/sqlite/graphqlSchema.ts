import { makeExecutableSchema } from '@graphql-tools/schema';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

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
				const query = checkpoint
					? sql`SELECT * FROM __dubheStoreTransactions WHERE checkpoint = ${checkpoint}`
					: sql`SELECT * FROM __dubheStoreTransactions`;

				return await database.all(query);
			},

			schemas: async (
				_: unknown,
				{
					name,
				}: {
					name?: string;
				}
			) => {
				const query = name
					? sql`SELECT * FROM __dubheStoreSchemas WHERE name = ${name}`
					: sql`SELECT * FROM __dubheStoreSchemas`;

				const results = await database.all(query);
				return results.map((schema: unknown) => {
					const typedSchema = schema as {
						last_update_checkpoint: string;
						last_update_digest: string;
						is_removed: boolean;
						[key: string]: any;
					};
					return {
						...typedSchema,
						lastUpdateCheckpoint:
							typedSchema.last_update_checkpoint,
						lastUpdateDigest: typedSchema.last_update_digest,
						isRemoved: typedSchema.is_removed,
					};
				});
			},

			events: async (
				_: unknown,
				{ name, checkpoint }: { name?: string; checkpoint?: string }
			) => {
				let query = sql`SELECT * FROM __dubheStoreEvents`;

				if (name && checkpoint) {
					query = sql`SELECT * FROM __dubheStoreEvents WHERE name = ${name} AND checkpoint = ${checkpoint}`;
				} else if (name) {
					query = sql`SELECT * FROM __dubheStoreEvents WHERE name = ${name}`;
				} else if (checkpoint) {
					query = sql`SELECT * FROM __dubheStoreEvents WHERE checkpoint = ${checkpoint}`;
				}

				return await database.all(query);
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
