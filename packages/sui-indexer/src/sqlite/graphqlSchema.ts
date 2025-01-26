import { makeExecutableSchema } from '@graphql-tools/schema';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { and, eq, gt, lt, asc, desc } from 'drizzle-orm';
import {
	dubheStoreEvents,
	dubheStoreSchemas,
	dubheStoreTransactions,
} from '../utils/tables';

const typeDefs = `
  enum OrderDirection {
    ASC
    DESC
  }

  input TransactionOrderBy {
    field: String!
    direction: OrderDirection!
  }

  input SchemaOrderBy {
    field: String!
    direction: OrderDirection!
  }

  input EventOrderBy {
    field: String!
    direction: OrderDirection!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type TransactionEdge {
    cursor: String!
    node: Transaction!
  }

  type TransactionConnection {
    edges: [TransactionEdge!]!
    pageInfo: PageInfo!
  }

  type SchemaEdge {
    cursor: String!
    node: Schema!
  }

  type SchemaConnection {
    edges: [SchemaEdge!]!
    pageInfo: PageInfo!
  }

  type EventEdge {
    cursor: String!
    node: Event!
  }

  type EventConnection {
    edges: [EventEdge!]!
    pageInfo: PageInfo!
  }

  type Query {
    transactions(
      first: Int
      after: String
      last: Int
      before: String
      checkpoint: Int
      orderBy: TransactionOrderBy
      distinct: Boolean
    ): TransactionConnection!

    schemas(
      first: Int
      after: String
      last: Int
      before: String
      name: String
      key1: String
      key2: String
      orderBy: SchemaOrderBy
      distinct: Boolean
    ): SchemaConnection!

    events(
      first: Int
      after: String
      last: Int
      before: String
      name: String
      checkpoint: String
      orderBy: EventOrderBy
      distinct: Boolean
    ): EventConnection!
  }

  type Transaction {
    id: Int!
    checkpoint: Int!
    digest: String!
  }

  type Schema {
    id: Int!
    name: String!
    key1: String
    key2: String
    value: String!
    last_update_checkpoint: String!
    last_update_digest: String!
    is_removed: Boolean!
  }

  type Event {
    id: Int!
    checkpoint: String!
    digest: String!
    name: String!
    value: String!
  }
`;

export function createResolvers(
	database: BaseSQLiteDatabase<'sync', any>,
	defaultPageSize: number,
	paginationLimit: number
) {
	const DEFAULT_PAGE_SIZE = defaultPageSize;
	const PAGINATION_LIMIT = paginationLimit;

	// 辅助函数：编码游标
	const encodeCursor = (id: number) =>
		Buffer.from(id.toString()).toString('base64');

	// 解码游标
	const decodeCursor = (cursor: string) =>
		parseInt(Buffer.from(cursor, 'base64').toString());

	const applyOrderBy = (
		query: any,
		table: any,
		orderBy?: { field: string; direction: 'ASC' | 'DESC' }
	) => {
		if (!orderBy) return query.orderBy(asc(table.id));

		const direction = orderBy.direction === 'ASC' ? asc : desc;
		return query.orderBy(
			direction(table[orderBy.field as keyof typeof table])
		);
	};

	return {
		Query: {
			transactions: async (
				_: unknown,
				{
					first = DEFAULT_PAGE_SIZE,
					after,
					last,
					before,
					checkpoint,
					orderBy,
					distinct,
				}: {
					first?: number;
					after?: string;
					last?: number;
					before?: string;
					checkpoint?: number;
					orderBy?: { field: string; direction: 'ASC' | 'DESC' };
					distinct?: boolean;
				}
			) => {
				const limit = Math.min(
					first || last || DEFAULT_PAGE_SIZE,
					PAGINATION_LIMIT
				);
				let query;

				if (distinct) {
					query = database.selectDistinct();
				} else {
					query = database.select();
				}

				// if (distinct) {
				// 	query = query.from(dubheStoreTransactions).;
				// }

				query = query.from(dubheStoreTransactions);

				if (checkpoint) {
					query = query.where(
						eq(
							dubheStoreTransactions.checkpoint,
							checkpoint.toString()
						)
					);
				}

				// 处理游标
				if (after) {
					const afterId = decodeCursor(after);
					query = query.where(gt(dubheStoreTransactions.id, afterId));
				}

				if (before) {
					const beforeId = decodeCursor(before);
					query = query.where(
						lt(dubheStoreTransactions.id, beforeId)
					);
				}

				query = applyOrderBy(query, dubheStoreTransactions, orderBy);

				const records = query.limit(limit + 1).all();
				const hasNextPage = records.length > limit;
				const edges = records
					.slice(0, limit)
					.map(
						(record: {
							id: number;
							checkpoint: string;
							digest: string;
						}) => ({
							cursor: encodeCursor(record.id),
							node: record,
						})
					);

				return {
					edges,
					pageInfo: {
						hasNextPage,
						hasPreviousPage: !!after,
						startCursor: edges[0]?.cursor,
						endCursor: edges[edges.length - 1]?.cursor,
					},
				};
			},

			schemas: async (
				_: unknown,
				{
					first = DEFAULT_PAGE_SIZE,
					after,
					last,
					before,
					name,
					key1,
					key2,
					orderBy,
					distinct,
				}: {
					first?: number;
					after?: string;
					last?: number;
					before?: string;
					name?: string;
					key1?: string;
					key2?: string;
					orderBy?: { field: string; direction: 'ASC' | 'DESC' };
					distinct?: boolean;
				}
			) => {
				const limit = Math.min(
					first || last || DEFAULT_PAGE_SIZE,
					PAGINATION_LIMIT
				);
				let query;

				if (distinct) {
					query = database.selectDistinct();
				} else {
					query = database.select();
				}

				query = query.from(dubheStoreSchemas);

				if (name) {
					query = query.where(eq(dubheStoreSchemas.name, name));
				}
				if (key1) {
					query = query.where(eq(dubheStoreSchemas.key1, key1));
				}
				if (key2) {
					query = query.where(eq(dubheStoreSchemas.key2, key2));
				}

				if (after) {
					const afterId = decodeCursor(after);
					query = query.where(gt(dubheStoreSchemas.id, afterId));
				}

				if (before) {
					const beforeId = decodeCursor(before);
					query = query.where(lt(dubheStoreSchemas.id, beforeId));
				}

				query = applyOrderBy(query, dubheStoreSchemas, orderBy);

				const records = query.limit(limit + 1).all();

				const hasNextPage = records.length > limit;
				const edges = records
					.slice(0, limit)
					.map(
						(record: {
							id: number;
							name: string;
							key1: string;
							key2: string;
							value: string;
							last_update_checkpoint: string;
							last_update_digest: string;
							is_removed: boolean;
						}) => ({
							cursor: encodeCursor(record.id),
							node: {
								...record,
								value: JSON.stringify(record.value),
								key1: JSON.stringify(record.key1),
								key2: JSON.stringify(record.key2),
							},
						})
					);

				return {
					edges,
					pageInfo: {
						hasNextPage,
						hasPreviousPage: !!after,
						startCursor: edges[0]?.cursor,
						endCursor: edges[edges.length - 1]?.cursor,
					},
				};
			},

			events: async (
				_: unknown,
				{
					first = DEFAULT_PAGE_SIZE,
					after,
					last,
					before,
					name,
					checkpoint,
					orderBy,
					distinct,
				}: {
					first?: number;
					after?: string;
					last?: number;
					before?: string;
					name?: string;
					checkpoint?: string;
					orderBy?: { field: string; direction: 'ASC' | 'DESC' };
					distinct?: boolean;
				}
			) => {
				const limit = Math.min(
					first || last || DEFAULT_PAGE_SIZE,
					PAGINATION_LIMIT
				);
				let query;

				if (distinct) {
					query = database.selectDistinct();
				} else {
					query = database.select();
				}

				query = query.from(dubheStoreEvents);

				if (name && checkpoint) {
					query = query.where(
						and(
							eq(dubheStoreEvents.name, name),
							eq(
								dubheStoreEvents.checkpoint,
								checkpoint.toString()
							)
						)
					);
				} else if (name) {
					query = query.where(eq(dubheStoreEvents.name, name));
				} else if (checkpoint) {
					query = query.where(
						eq(dubheStoreEvents.checkpoint, checkpoint.toString())
					);
				}

				if (after) {
					const afterId = decodeCursor(after);
					query = query.where(gt(dubheStoreEvents.id, afterId));
				}

				if (before) {
					const beforeId = decodeCursor(before);
					query = query.where(lt(dubheStoreEvents.id, beforeId));
				}

				query = applyOrderBy(query, dubheStoreEvents, orderBy);

				const records = query.limit(limit + 1).all();

				const hasNextPage = records.length > limit;
				const edges = records
					.slice(0, limit)
					.map(
						(record: {
							id: number;
							checkpoint: string;
							digest: string;
							name: string;
							value: string;
						}) => ({
							cursor: encodeCursor(record.id),
							node: {
								...record,
								value: JSON.stringify(record.value),
							},
						})
					);

				return {
					edges,
					pageInfo: {
						hasNextPage,
						hasPreviousPage: !!after,
						startCursor: edges[0]?.cursor,
						endCursor: edges[edges.length - 1]?.cursor,
					},
				};
			},
		},
	};
}

export function createSchema(
	database: BaseSQLiteDatabase<'sync', any>,
	defaultPageSize: number,
	paginationLimit: number
) {
	return makeExecutableSchema({
		typeDefs,
		resolvers: createResolvers(database, defaultPageSize, paginationLimit),
	});
}
