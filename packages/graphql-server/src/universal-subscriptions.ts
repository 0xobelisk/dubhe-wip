import { makeExtendSchemaPlugin, gql } from 'postgraphile';
import { subscriptionLogger } from './utils/logger';

// 数据库表信息接口
interface TableInfo {
	tableName: string;
	fullTableName: string;
	columns: ColumnInfo[];
	primaryKeys: string[];
	statistics?: {
		rowCount: number;
		totalSize: string;
		tableSize: string;
	};
	generatedAt?: string;
}

interface ColumnInfo {
	columnName: string;
	dataType: string;
	isNullable: boolean;
	defaultValue?: any;
	maxLength?: number;
	precision?: number;
	scale?: number;
}

// 缓存的表信息
let cachedTables: Record<string, TableInfo> = {};
let schemaGenerated = false;

/**
 * 动态获取所有store表的schema信息
 */
async function discoverStoreTables(
	pgClient: any
): Promise<Record<string, TableInfo>> {
	if (schemaGenerated && Object.keys(cachedTables).length > 0) {
		return cachedTables;
	}

	try {
		subscriptionLogger.info('开始发现数据库store表结构...');

		// 1. 获取所有store_*表
		const tablesResult = await pgClient.query(`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = 'public' 
			AND table_name LIKE 'store_%'
			ORDER BY table_name
		`);

		const tables: Record<string, TableInfo> = {};

		// 2. 为每个表获取详细信息
		for (const tableRow of tablesResult.rows) {
			const fullTableName = tableRow.table_name;
			const tableName = fullTableName.replace(/^store_/, '');

			const tableInfo = await getTableInfo(pgClient, fullTableName);
			tables[tableName] = tableInfo;
		}

		cachedTables = tables;
		schemaGenerated = true;

		subscriptionLogger.info(
			`发现 ${Object.keys(tables).length} 个store表: ${Object.keys(
				tables
			).join(', ')}`
		);
		return tables;
	} catch (error) {
		subscriptionLogger.error('发现store表失败', error);
		return {};
	}
}

/**
 * 生成预建的表信息 - 在服务器启动时调用
 */
export async function generateStoreTablesInfo(
	pgPool: any
): Promise<Record<string, TableInfo>> {
	const pgClient = await pgPool.connect();
	try {
		const tables = await discoverStoreTables(pgClient);
		subscriptionLogger.info(
			`预生成了 ${Object.keys(tables).length} 个表的schema信息`
		);
		return tables;
	} finally {
		pgClient.release();
	}
}

/**
 * 简化的工具插件 - 只提供基础查询功能，让PostGraphile内置的listen订阅正常工作
 */
export function createUniversalSubscriptionsPlugin(
	preGeneratedTables?: Record<string, TableInfo>
) {
	return makeExtendSchemaPlugin(build => {
		subscriptionLogger.info('启用简化工具插件 - 只保留基础查询功能');

		// 如果有预生成的表信息，使用它
		if (preGeneratedTables && Object.keys(preGeneratedTables).length > 0) {
			cachedTables = preGeneratedTables;
			schemaGenerated = true;
		}

		const tableNames = Object.keys(cachedTables);
		subscriptionLogger.info(`已发现store表: ${tableNames.join(', ')}`);
		subscriptionLogger.info('💡 用户可以使用PostGraphile内置的listen订阅');
		subscriptionLogger.info(
			'💡 例如: subscription { listen(topic: "store_encounter") { relatedNodeId } }'
		);

		return {
			typeDefs: gql`
				extend type Query {
					"""
					获取所有store表的Schema信息
					"""
					storeSchema: JSON

					"""
					查询指定store表的数据
					"""
					storeData(table: String!): JSON

					"""
					获取所有可用的store表名列表
					"""
					availableStoreTables: [String!]!
				}
			`,

			resolvers: {
				Query: {
					storeSchema: async (
						root: any,
						args: any,
						context: any,
						info: any
					) => {
						const { pgClient } = context;
						try {
							const tables = await discoverStoreTables(pgClient);
							return {
								tables,
								generatedAt: new Date().toISOString(),
							};
						} catch (error) {
							return {
								error: (error as Error).message,
								tables: {},
							};
						}
					},

					storeData: async (
						root: any,
						args: any,
						context: any,
						info: any
					) => {
						return await executeTableQuery(context, args.table);
					},

					availableStoreTables: async (
						root: any,
						args: any,
						context: any,
						info: any
					) => {
						const { pgClient } = context;
						try {
							const tables = await discoverStoreTables(pgClient);
							return Object.keys(tables);
						} catch (error) {
							subscriptionLogger.error(
								'获取可用表列表失败',
								error
							);
							return [];
						}
					},
				},
			},
		};
	});
}

// 默认插件导出（为了向后兼容）
export const UniversalSubscriptionsPlugin =
	createUniversalSubscriptionsPlugin();

// =========================
// 数据库查询函数
// =========================

/**
 * 获取表的详细信息（列、主键、数据统计等）
 */
async function getTableInfo(
	pgClient: any,
	fullTableName: string
): Promise<TableInfo> {
	const tableName = fullTableName.replace(/^store_/, '');

	// 1. 获取列信息
	const columnsResult = await pgClient.query(
		`
		SELECT 
			column_name,
			data_type,
			is_nullable,
			column_default,
			character_maximum_length,
			numeric_precision,
			numeric_scale
		FROM information_schema.columns 
		WHERE table_name = $1 
		ORDER BY ordinal_position
	`,
		[fullTableName]
	);

	// 2. 获取主键信息
	const primaryKeysResult = await pgClient.query(
		`
		SELECT column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu 
			ON tc.constraint_name = kcu.constraint_name
		WHERE tc.table_name = $1 
		AND tc.constraint_type = 'PRIMARY KEY'
		ORDER BY kcu.ordinal_position
	`,
		[fullTableName]
	);

	// 3. 尝试从table_fields表获取主键信息（如果存在）
	let tableFieldsKeys: string[] = [];
	try {
		const tableFieldsResult = await pgClient.query(
			`
			SELECT field_name 
			FROM table_fields 
			WHERE table_name = $1 AND is_key = true 
			ORDER BY field_name
		`,
			[tableName]
		);
		tableFieldsKeys = tableFieldsResult.rows.map(
			(row: any) => row.field_name
		);
	} catch (e) {
		// table_fields表可能不存在，忽略错误
	}

	// 4. 获取数据统计
	const statsResult = await pgClient.query(`
		SELECT count(*) as row_count 
		FROM ${fullTableName}
	`);

	// 5. 获取表大小信息
	const sizeResult = await pgClient.query(
		`
		SELECT 
			pg_size_pretty(pg_total_relation_size($1)) as total_size,
			pg_size_pretty(pg_relation_size($1)) as table_size
	`,
		[fullTableName]
	);

	const columns: ColumnInfo[] = columnsResult.rows.map((row: any) => ({
		columnName: row.column_name,
		dataType: row.data_type,
		isNullable: row.is_nullable === 'YES',
		defaultValue: row.column_default,
		maxLength: row.character_maximum_length,
		precision: row.numeric_precision,
		scale: row.numeric_scale,
	}));

	const primaryKeys = primaryKeysResult.rows.map(
		(row: any) => row.column_name
	);

	return {
		tableName,
		fullTableName,
		columns,
		primaryKeys: primaryKeys.length > 0 ? primaryKeys : tableFieldsKeys,
		statistics: {
			rowCount: parseInt(statsResult.rows[0]?.row_count || '0'),
			totalSize: sizeResult.rows[0]?.total_size || 'unknown',
			tableSize: sizeResult.rows[0]?.table_size || 'unknown',
		},
		generatedAt: new Date().toISOString(),
	};
}

/**
 * 动态执行表查询
 */
async function executeTableQuery(
	context: any,
	tableName: string
): Promise<any> {
	const { pgClient } = context;
	const fullTableName = `store_${tableName}`;

	try {
		subscriptionLogger.debug(`执行表查询: ${fullTableName}`);

		// 1. 获取表信息
		const tableInfo =
			cachedTables[tableName] ||
			(await getTableInfo(pgClient, fullTableName));

		if (tableInfo.columns.length === 0) {
			return {
				nodes: [],
				totalCount: 0,
				tableName,
				generatedAt: new Date().toISOString(),
			};
		}

		// 2. 构建动态的nodeId表达式
		const nodeIdExpression = buildNodeIdExpression(tableInfo);

		// 3. 构建查询字段
		const columnFields = tableInfo.columns
			.map(col => `'${col.columnName}', ${col.columnName}`)
			.join(', ');

		// 4. 构建WHERE条件
		const whereCondition = buildWhereCondition(tableInfo);

		// 5. 执行查询
		const sql = `
			SELECT 
				COALESCE(
					json_agg(
						json_build_object(
							'nodeId', ${nodeIdExpression},
							${columnFields}
						) 
					), 
					'[]'::json
				) as nodes,
				count(*) as total_count
			FROM ${fullTableName}
			WHERE ${whereCondition}
		`;

		subscriptionLogger.debug(`执行SQL: ${sql}`);
		const result = await pgClient.query(sql);

		const row = result.rows[0];
		const data = {
			nodes: row?.nodes || [],
			totalCount: parseInt(row?.total_count || '0'),
			tableName,
			generatedAt: new Date().toISOString(),
		};

		subscriptionLogger.debug(
			`查询结果: ${fullTableName} 找到 ${data.totalCount} 条记录`
		);
		return data;
	} catch (error) {
		subscriptionLogger.error(`查询${fullTableName}失败`, error);
		return {
			nodes: [],
			totalCount: 0,
			tableName,
			generatedAt: new Date().toISOString(),
			error: (error as Error).message,
		};
	}
}

/**
 * 动态构建NodeId表达式
 */
function buildNodeIdExpression(tableInfo: TableInfo): string {
	const { tableName, primaryKeys, columns } = tableInfo;

	if (primaryKeys.length > 0) {
		// 使用主键构建nodeId
		const keyExpression = primaryKeys
			.map(key => `COALESCE(${key}::text, 'null')`)
			.join(" || ':' || ");
		return `encode(('${tableName}:' || ${keyExpression})::bytea, 'base64')`;
	}

	// 如果没有主键，使用第一个字段
	const firstColumn = columns[0]?.columnName || 'unknown';
	return `encode(('${tableName}:' || COALESCE(${firstColumn}::text, 'unknown'))::bytea, 'base64')`;
}

/**
 * 动态构建WHERE条件 - 完全通用，无任何硬编码字段名
 */
function buildWhereCondition(tableInfo: TableInfo): string {
	const { primaryKeys, columns } = tableInfo;

	// 1. 优先使用主键字段作为过滤条件（最可靠）
	if (primaryKeys.length > 0) {
		const conditions = primaryKeys.map(key => `${key} IS NOT NULL`);
		return conditions.join(' AND ');
	}

	// 2. 如果没有主键，查找第一个非空字段（减少空数据）
	const nonNullableColumns = columns.filter(col => !col.isNullable);
	if (nonNullableColumns.length > 0) {
		return `${nonNullableColumns[0].columnName} IS NOT NULL`;
	}

	// 3. 如果所有字段都可为空，使用第一个字段进行基本过滤
	if (columns.length > 0) {
		return `${columns[0].columnName} IS NOT NULL`;
	}

	// 4. 最后的fallback - 返回所有行（无过滤）
	return 'true';
}
