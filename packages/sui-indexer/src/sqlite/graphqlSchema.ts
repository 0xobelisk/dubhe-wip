import { makeExecutableSchema } from '@graphql-tools/schema';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { and, eq, gt, lt, asc, desc, sql } from 'drizzle-orm';
import {
	dubheStoreEvents,
	dubheStoreSchemas,
	dubheStoreTransactions,
} from '../utils/tables';

const typeDefs = `
  enum SchemaOrderField {
    ID_DESC
	ID_ASC
    CREATED_AT_DESC
	CREATED_AT_ASC
    UPDATED_AT_DESC
	UPDATED_AT_ASC
  }

  enum EventOrderField {
    ID_DESC
	ID_ASC
    CREATED_AT_DESC
	CREATED_AT_ASC
    CHECKPOINT_DESC
	CHECKPOINT_ASC
  }

  enum TransactionOrderField {
    ID_DESC
	ID_ASC
    CREATED_AT_DESC
	CREATED_AT_ASC
    CHECKPOINT_DESC
	CHECKPOINT_ASC
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type TransactionEdge {
    cursor: String!
    node: Transaction!
  }

  type TransactionConnection {
    edges: [TransactionEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type SchemaEdge {
    cursor: String!
    node: Schema!
  }

  type SchemaConnection {
    edges: [SchemaEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type EventEdge {
    cursor: String!
    node: Event!
  }

  type EventConnection {
    edges: [EventEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type Query {
    schemas(
      first: Int
      after: String
      name: String
      key1: String
      key2: String
      is_removed: Boolean
      last_update_checkpoint: String
      last_update_digest: String
      value: JSON
      orderBy: [SchemaOrderField!]
    ): SchemaConnection!

    events(
      first: Int
      after: String
      name: String
      checkpoint: String
      orderBy: [EventOrderField!]
    ): EventConnection!

    transactions(
      first: Int
      after: String
      checkpoint: Int
      orderBy: [TransactionOrderField!]
    ): TransactionConnection!
  }

  type Transaction {
    id: Int!
    checkpoint: Int!
    digest: String!
    created_at: String!
  }

  type Schema {
    id: Int!
    name: String!
    key1: String
    key2: String
    value: JSON!
    last_update_checkpoint: String!
    last_update_digest: String!
    is_removed: Boolean!
    created_at: String!
    updated_at: String!
  }

  type Event {
    id: Int!
    checkpoint: String!
    digest: String!
    name: String!
    value: JSON!
    created_at: String!
  }

  type Subscription {
    onNewTransaction: Transaction
    onNewSchema: Schema
    onNewEvent: Event
  }

  scalar JSON
`;

export function createResolvers(
	database: BaseSQLiteDatabase<'sync', any>,
	defaultPageSize: number,
	paginationLimit: number
) {
	const DEFAULT_PAGE_SIZE = defaultPageSize;
	const PAGINATION_LIMIT = paginationLimit;

	const encodeCursor = (id: number) =>
		Buffer.from(id.toString()).toString('base64');

	const decodeCursor = (cursor: string) =>
		parseInt(Buffer.from(cursor, 'base64').toString());

	const applyOrderBy = (query: any, table: any, orderBy?: string[]) => {
		if (!orderBy || orderBy.length === 0) {
			return query.orderBy(desc(table.created_at));
		}

		try {
			orderBy.forEach(order => {
				const isDesc = order.endsWith('_DESC');
				const isAsc = order.endsWith('_ASC');

				if (!isDesc && !isAsc) {
					console.warn('Invalid order format:', order);
					return query;
				}

				const direction = isDesc ? 'DESC' : 'ASC';
				const field = order.slice(0, -1 * (direction.length + 1));
				const orderFn = isDesc ? desc : asc;

				switch (field) {
					case 'ID':
						query = query.orderBy(orderFn(table.id));
						break;
					case 'CREATED_AT':
						query = query.orderBy(orderFn(table.created_at));
						break;
					case 'UPDATED_AT':
						query = query.orderBy(orderFn(table.updated_at));
						break;
					case 'CHECKPOINT':
						query = query.orderBy(orderFn(table.checkpoint));
						break;
					default:
						console.warn('Unknown orderBy field:', field);
				}
			});

			return query;
		} catch (error) {
			console.warn('Error applying orderBy:', orderBy, error);
			return query.orderBy(desc(table.created_at));
		}
	};

	const getTotalCount = (
		database: any,
		table: any,
		conditions: any[] = []
	) => {
		let query = database
			.select({ count: sql<number>`count(*)` })
			.from(table);

		if (conditions.length > 0) {
			query = query.where(and(...conditions));
		}

		const result = query.get();
		return result?.count ?? 0;
	};

	const resolvers = {
		JSON: {
			serialize: (value: any) => {
				if (value === null || value === undefined) {
					return null;
				}
				if (typeof value === 'string') {
					try {
						return JSON.parse(value);
					} catch {
						return value;
					}
				}
				return value;
			},
			parseValue: (value: any) => {
				if (value === null || value === undefined) {
					return null;
				}
				return value;
			},
			parseLiteral: (ast: any) => {
				return parseLiteral(ast);
			},
		},
		Query: {
			transactions: async (
				_: unknown,
				{
					first = DEFAULT_PAGE_SIZE,
					after,
					before,
					checkpoint,
					orderBy,
				}: {
					first?: number;
					after?: string;
					before?: string;
					checkpoint?: number;
					orderBy?: string[];
				}
			) => {
				try {
					const limit = Math.min(first, PAGINATION_LIMIT);
					let query = database.select().from(dubheStoreTransactions);

					// Collect filter conditions
					const conditions = [];
					if (checkpoint) {
						conditions.push(
							eq(
								dubheStoreTransactions.checkpoint,
								checkpoint.toString()
							)
						);
					}

					// Get total count (apply filter conditions)
					const totalCount = getTotalCount(
						database,
						dubheStoreTransactions,
						conditions
					);

					// Handle cursor (need to use with filter conditions AND)
					if (after) {
						const afterId = decodeCursor(after);
						if (!afterId) {
							throw new Error('Invalid cursor');
						}
						conditions.push(gt(dubheStoreTransactions.id, afterId));
					}

					if (before) {
						const beforeId = decodeCursor(before);
						if (!beforeId) {
							throw new Error('Invalid cursor');
						}
						conditions.push(
							lt(dubheStoreTransactions.id, beforeId)
						);
					}

					// Apply all conditions at once
					if (conditions.length > 0) {
						query = query.where(and(...conditions));
					}

					// Apply sorting
					query = applyOrderBy(
						query,
						dubheStoreTransactions,
						orderBy
					);

					// Get paginated data
					const records = query.limit(limit + 1).all();
					const hasNextPage = records.length > limit;
					const edges = records.slice(0, limit).map(record => ({
						cursor: encodeCursor(record.id),
						node: record,
					}));

					return {
						edges,
						pageInfo: {
							hasNextPage,
							endCursor: edges[edges.length - 1]?.cursor,
						},
						totalCount,
					};
				} catch (error) {
					console.error('Error in transactions resolver:', error);
					throw error;
				}
			},

			schemas: async (
				_: unknown,
				{
					first = DEFAULT_PAGE_SIZE,
					after,
					name,
					key1,
					key2,
					is_removed,
					last_update_checkpoint,
					last_update_digest,
					value,
					orderBy,
				}: {
					first?: number;
					after?: string;
					name?: string;
					key1?: string;
					key2?: string;
					is_removed?: boolean;
					last_update_checkpoint?: string;
					last_update_digest?: string;
					value?: any;
					orderBy?: string[];
				}
			) => {
				try {
					const limit = Math.min(first, PAGINATION_LIMIT);
					let query = database.select().from(dubheStoreSchemas);

					// Collect all filter conditions
					const conditions = [];

					// Apply all filters
					if (name) conditions.push(eq(dubheStoreSchemas.name, name));
					if (key1) conditions.push(eq(dubheStoreSchemas.key1, key1));
					if (key2) conditions.push(eq(dubheStoreSchemas.key2, key2));
					if (typeof is_removed === 'boolean')
						conditions.push(
							eq(dubheStoreSchemas.is_removed, is_removed)
						);
					if (last_update_checkpoint)
						conditions.push(
							eq(
								dubheStoreSchemas.last_update_checkpoint,
								last_update_checkpoint
							)
						);
					if (last_update_digest)
						conditions.push(
							eq(
								dubheStoreSchemas.last_update_digest,
								last_update_digest
							)
						);
					if (value !== undefined) {
						if (typeof value === 'boolean') {
							conditions.push(
								sql`${
									dubheStoreSchemas.value
								} = ${value.toString()}`
							);
						} else if (value === null) {
							conditions.push(
								sql`${dubheStoreSchemas.value} IS NULL`
							);
						} else if (Array.isArray(value)) {
							const jsonValue = JSON.stringify(value);
							conditions.push(sql`
								CASE 
									WHEN json_valid(${dubheStoreSchemas.value})
									THEN (
										CASE 
											WHEN json_type(${dubheStoreSchemas.value}) = 'array'
											THEN json(${dubheStoreSchemas.value}) = json(${jsonValue})
											ELSE FALSE
										END
									)
									ELSE FALSE 
								END
							`);
						} else if (typeof value === 'string') {
							conditions.push(
								sql`${
									dubheStoreSchemas.value
								} = ${value.toString()}`
							);
						} else if (typeof value === 'number') {
							conditions.push(
								sql`${
									dubheStoreSchemas.value
								} = ${value.toString()}`
							);
						} else if (typeof value === 'object') {
							const jsonValue = JSON.stringify(value);
							conditions.push(sql`
								CASE 
									WHEN json_valid(${dubheStoreSchemas.value})
									THEN json(${dubheStoreSchemas.value}) = json(${jsonValue})
									ELSE FALSE 
								END
							`);
						}
					}

					// Get filtered total count
					const totalCount = getTotalCount(
						database,
						dubheStoreSchemas,
						conditions
					);

					// Handle cursor pagination (need to use with filter conditions AND)
					if (after) {
						const afterId = decodeCursor(after);
						if (!afterId) {
							throw new Error('Invalid cursor');
						}
						conditions.push(gt(dubheStoreSchemas.id, afterId));
					}

					// Apply all conditions
					if (conditions.length > 0) {
						query = query.where(and(...conditions));
					}

					// Apply sorting
					query = applyOrderBy(query, dubheStoreSchemas, orderBy);

					// Get paginated data
					const records = query.limit(limit + 1).all();
					const hasNextPage = records.length > limit;
					const edges = records.slice(0, limit).map(record => ({
						cursor: encodeCursor(record.id),
						node: {
							...record,
							value: record.value,
						},
					}));

					return {
						edges,
						pageInfo: {
							hasNextPage,
							endCursor: edges[edges.length - 1]?.cursor,
						},
						totalCount,
					};
				} catch (error) {
					console.error('Error in schemas resolver:', error);
					throw error;
				}
			},

			events: async (
				_: unknown,
				{
					first = DEFAULT_PAGE_SIZE,
					after,
					name,
					checkpoint,
					orderBy,
				}: {
					first?: number;
					after?: string;
					name?: string;
					checkpoint?: string;
					orderBy?: string[];
				}
			) => {
				try {
					const limit = Math.min(first, PAGINATION_LIMIT);
					let query = database.select().from(dubheStoreEvents);

					// Collect filter conditions
					const conditions = [];
					if (name && checkpoint) {
						conditions.push(
							and(
								eq(dubheStoreEvents.name, name),
								eq(
									dubheStoreEvents.checkpoint,
									checkpoint.toString()
								)
							)
						);
					} else if (name) {
						conditions.push(eq(dubheStoreEvents.name, name));
					} else if (checkpoint) {
						conditions.push(
							eq(
								dubheStoreEvents.checkpoint,
								checkpoint.toString()
							)
						);
					}

					// Get total count (apply filter conditions)
					const totalCount = getTotalCount(
						database,
						dubheStoreEvents,
						conditions
					);

					// Handle cursor (need to use with filter conditions AND)
					if (after) {
						const afterId = decodeCursor(after);
						if (!afterId) {
							throw new Error('Invalid cursor');
						}
						conditions.push(gt(dubheStoreEvents.id, afterId));
					}

					// Apply all conditions at once
					if (conditions.length > 0) {
						query = query.where(and(...conditions));
					}

					// Apply sorting
					query = applyOrderBy(query, dubheStoreEvents, orderBy);

					// Get paginated data
					const records = query.limit(limit + 1).all();
					const hasNextPage = records.length > limit;
					const edges = records.slice(0, limit).map(record => ({
						cursor: encodeCursor(record.id),
						node: {
							...record,
							value: record.value,
						},
					}));

					return {
						edges,
						pageInfo: {
							hasNextPage,
							endCursor: edges[edges.length - 1]?.cursor,
						},
						totalCount,
					};
				} catch (error) {
					console.error('Error in events resolver:', error);
					throw error;
				}
			},
		},
	};

	return resolvers;
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

// 辅助函数来解析各种类型的字面量
function parseLiteral(ast: any): any {
	switch (ast.kind) {
		case 'ObjectValue':
			const obj: Record<string, any> = {};
			ast.fields.forEach((field: any) => {
				obj[field.name.value] = parseLiteral(field.value);
			});
			return obj;
		case 'ListValue':
			return ast.values.map((value: any) => parseLiteral(value));
		case 'IntValue':
			return parseInt(ast.value, 10);
		case 'FloatValue':
			return parseFloat(ast.value);
		case 'StringValue':
			return ast.value;
		case 'BooleanValue':
			return ast.value;
		case 'NullValue':
			return null;
		default:
			return ast.value;
	}
}
