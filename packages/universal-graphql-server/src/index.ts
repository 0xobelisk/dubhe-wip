import { createServer } from 'http';
import { postgraphile, makePluginHook } from 'postgraphile';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import {
	createDynamicSubscriptionPlugin,
	SystemTableSubscriptionPlugin,
	createSubscriptionAuthorizationFunction,
} from './subscriptions';
import { RealtimeSubscriptionServer } from './realtime-server';

// 加载环境变量
dotenv.config();

const {
	DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
	PORT = 4000,
	NODE_ENV = 'development',
	GRAPHQL_ENDPOINT = '/graphql',
	PG_SCHEMA = 'public',
	ENABLE_CORS = 'true',
	ENABLE_SUBSCRIPTIONS = 'true',
} = process.env;

// 创建数据库连接池
const pgPool = new Pool({
	connectionString: DATABASE_URL,
});

// 数据库表结构接口
interface TableField {
	field_name: string;
	field_type: string;
	field_index: number | null;
	is_key: boolean;
}

interface DynamicTable {
	table_name: string;
	fields: TableField[];
}

// 扫描数据库表结构
class DatabaseIntrospector {
	constructor(private pool: Pool) {}

	// 获取所有动态创建的 store_* 表
	async getStoreTables(): Promise<string[]> {
		const result = await this.pool.query(
			`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = $1 
				AND table_name LIKE 'store_%'
			ORDER BY table_name
		`,
			[PG_SCHEMA]
		);

		return result.rows.map(row => row.table_name);
	}

	// 获取系统表（dubhe 相关表）
	async getSystemTables(): Promise<string[]> {
		const result = await this.pool.query(
			`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = $1 
				AND (table_name LIKE '__dubhe%' OR table_name = 'table_fields')
			ORDER BY table_name
		`,
			[PG_SCHEMA]
		);

		return result.rows.map(row => row.table_name);
	}

	// 从 table_fields 表获取动态表的字段信息
	async getDynamicTableFields(tableName: string): Promise<TableField[]> {
		// 提取表名（去掉 store_ 前缀）
		const baseTableName = tableName.replace('store_', '');

		const result = await this.pool.query(
			`
			SELECT field_name, field_type, field_index, is_key
			FROM table_fields 
			WHERE table_name = $1
			ORDER BY is_key DESC, field_index ASC
		`,
			[baseTableName]
		);

		return result.rows;
	}

	// 从系统表获取字段信息
	async getSystemTableFields(tableName: string): Promise<TableField[]> {
		const result = await this.pool.query(
			`
			SELECT 
				column_name as field_name,
				data_type as field_type,
				ordinal_position as field_index,
				CASE WHEN column_name = 'id' THEN true ELSE false END as is_key
			FROM information_schema.columns 
			WHERE table_schema = $1 AND table_name = $2
			ORDER BY ordinal_position
		`,
			[PG_SCHEMA, tableName]
		);

		return result.rows;
	}

	// 获取所有表的完整信息
	async getAllTables(): Promise<DynamicTable[]> {
		const storeTables = await this.getStoreTables();
		const systemTables = await this.getSystemTables();
		const allTables: DynamicTable[] = [];

		// 处理动态表
		for (const tableName of storeTables) {
			const fields = await this.getDynamicTableFields(tableName);
			allTables.push({
				table_name: tableName,
				fields,
			});
		}

		// 处理系统表
		for (const tableName of systemTables) {
			const fields = await this.getSystemTableFields(tableName);
			allTables.push({
				table_name: tableName,
				fields,
			});
		}

		return allTables;
	}
}

// 创建自定义欢迎页面
const createWelcomePage = (tables: DynamicTable[]) => {
	const tableList = tables
		.map(table => {
			const keyFields = table.fields
				.filter(f => f.is_key)
				.map(f => f.field_name);
			const valueFields = table.fields
				.filter(f => !f.is_key)
				.map(f => f.field_name);
			return `
			<div class="table-info">
				<h3>📊 ${table.table_name}</h3>
				<div class="fields">
					<div><strong>键字段:</strong> ${keyFields.join(', ') || '无'}</div>
					<div><strong>值字段:</strong> ${valueFields.join(', ')}</div>
				</div>
			</div>
		`;
		})
		.join('');

	return `
		<!DOCTYPE html>
		<html>
			<head>
				<title>🚀 Sui Indexer GraphQL API</title>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1">
				<style>
					body { 
						font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
						margin: 0; 
						padding: 20px; 
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
						color: #333;
						min-height: 100vh;
					}
					.container { 
						max-width: 1200px; 
						margin: 0 auto; 
						background: white; 
						padding: 40px; 
						border-radius: 16px; 
						box-shadow: 0 20px 40px rgba(0,0,0,0.1);
					}
					h1 { 
						color: #2c3e50; 
						text-align: center; 
						margin-bottom: 10px; 
						font-size: 2.5em;
					}
					.subtitle {
						text-align: center;
						color: #7f8c8d;
						margin-bottom: 40px;
						font-size: 1.2em;
					}
					.link { 
						display: inline-block; 
						margin: 10px; 
						padding: 15px 25px; 
						background: linear-gradient(135deg, #74b9ff, #0984e3); 
						color: white; 
						text-decoration: none; 
						border-radius: 8px; 
						text-align: center; 
						font-weight: 500;
						transition: transform 0.2s ease;
					}
					.link:hover { 
						transform: translateY(-2px);
						box-shadow: 0 8px 15px rgba(116, 185, 255, 0.4);
					}
					.status { 
						color: #00b894; 
						font-weight: bold; 
						text-align: center;
						font-size: 1.1em;
						margin: 20px 0;
					}
					.warning {
						background: #ffeaa7;
						border-left: 4px solid #fdcb6e;
						padding: 15px;
						margin: 20px 0;
						border-radius: 4px;
					}
					.warning h4 {
						margin-top: 0;
						color: #e17055;
					}
					.table-info {
						background: #f8f9fa;
						padding: 20px;
						margin: 15px 0;
						border-radius: 8px;
						border-left: 4px solid #74b9ff;
					}
					.table-info h3 {
						margin: 0 0 10px 0;
						color: #2c3e50;
					}
					.fields div {
						margin: 5px 0;
						color: #555;
					}
					.info-grid {
						display: grid;
						grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
						gap: 20px;
						margin: 30px 0;
					}
					.info-card {
						background: #f8f9fa;
						padding: 20px;
						border-radius: 8px;
						border: 1px solid #e9ecef;
					}
					.info-card h3 {
						color: #495057;
						margin-top: 0;
					}
					.center {
						text-align: center;
					}
					.highlight {
						background: linear-gradient(135deg, #fdcb6e, #e17055);
						color: white;
						padding: 2px 8px;
						border-radius: 4px;
						font-weight: 500;
					}
				</style>
			</head>
			<body>
				<div class="container">
					<h1>🚀 Sui Indexer GraphQL API</h1>
					<p class="subtitle">动态扫描数据库，自动生成 GraphQL API</p>
					<p class="status">● 服务器状态：正常运行 | 已扫描 <span class="highlight">${
						tables.length
					}</span> 个表</p>
					
					${
						ENABLE_SUBSCRIPTIONS === 'false'
							? `
					<div class="warning">
						<h4>⚠️ WebSocket 订阅功能已临时禁用</h4>
						<p>正在修复 subscription 配置问题。基本的 GraphQL 查询和变更功能完全正常。</p>
					</div>
					`
							: `
					<div class="status">
						<p>📡 实时订阅功能：${ENABLE_SUBSCRIPTIONS === 'true' ? '已启用' : '已禁用'}</p>
					</div>
					`
					}
					
					<div class="center">
						<a href="${GRAPHQL_ENDPOINT}" class="link">📊 GraphQL API</a>
						<a href="/graphiql" class="link">🎮 GraphiQL 查询界面</a>
					</div>

					<div class="info-grid">
						<div class="info-card">
							<h3>🎯 核心特性</h3>
							<ul>
								<li>✨ 自动扫描 sui-rust-indexer 数据库</li>
								<li>🔄 动态生成 GraphQL schema</li>
								<li>📡 支持实时订阅功能 ${ENABLE_SUBSCRIPTIONS === 'true' ? '✅' : '⚠️'}</li>
								<li>🚀 完整的 CRUD 操作</li>
								<li>🛡️ PostGraphile 强大功能</li>
							</ul>
						</div>
						
						<div class="info-card">
							<h3>📊 服务器信息</h3>
							<ul>
								<li>环境: ${NODE_ENV}</li>
								<li>端口: ${PORT}</li>
								<li>数据库模式: ${PG_SCHEMA}</li>
								<li>CORS: ${ENABLE_CORS === 'true' ? '启用' : '禁用'}</li>
								<li>订阅: ${ENABLE_SUBSCRIPTIONS === 'true' ? '启用' : '禁用'}</li>
							</ul>
						</div>
					</div>

					<h2>📋 检测到的数据表</h2>
					${tableList}
					
					<div style="margin-top: 40px; padding: 20px; background: #e3f2fd; border-radius: 8px;">
						<h3>💡 使用提示</h3>
						<p>1. 访问 <strong>GraphiQL</strong> 查看完整的 API 文档和 schema</p>
						<p>2. 所有表都支持标准的 GraphQL 查询、变更${
							ENABLE_SUBSCRIPTIONS === 'true' ? '和订阅' : ''
						}操作</p>
						<p>3. 动态表（store_*）会根据 table_fields 元数据自动生成字段</p>
						<p>4. 系统表提供 sui-indexer 的核心数据访问</p>
						${
							ENABLE_SUBSCRIPTIONS === 'true'
								? '<p>5. 使用 WebSocket 进行实时数据订阅</p>'
								: ''
						}
					</div>
				</div>
			</body>
		</html>
	`;
};

// 创建 PostGraphile 配置
const createPostGraphileConfig = (availableTables: string[]) => {
	return {
		// 基础配置
		graphiql: true,
		enhanceGraphiql: true,
		showErrorStack: NODE_ENV === 'development',
		extendedErrors:
			NODE_ENV === 'development' ? ['hint', 'detail', 'errcode'] : [],

		// 功能配置
		subscriptions: ENABLE_SUBSCRIPTIONS === 'true',
		live: ENABLE_SUBSCRIPTIONS === 'true',
		enableQueryBatching: true,
		enableCors: ENABLE_CORS === 'true',

		// Schema 配置
		dynamicJson: true,
		setofFunctionsContainNulls: false,
		ignoreRBAC: false,
		ignoreIndexes: false,

		// GraphQL 端点
		graphqlRoute: GRAPHQL_ENDPOINT,
		graphiqlRoute: '/graphiql',

		// 只包含检测到的表
		includeExtensionResources: false,

		// 排除不需要的表
		ignoreTable: (tableName: string) => {
			return !availableTables.includes(tableName);
		},

		// 自定义 GraphiQL 配置
		graphiqlOptions: {
			headerEditorEnabled: true,
			requestCredentials: 'same-origin',
		},

		// 导出 schema（开发环境）
		exportGqlSchemaPath:
			NODE_ENV === 'development'
				? 'sui-indexer-schema.graphql'
				: undefined,

		// 重要：为订阅功能添加必要配置
		...(ENABLE_SUBSCRIPTIONS === 'true' && {
			// 使用非池化连接确保订阅正常工作
			ownerConnectionString: DATABASE_URL,
			// 启用订阅功能，但不使用简单模式
			subscriptions: true,
			// 启用实时查询
			live: true,
			// 配置WebSocket端点
			websocketMiddlewares: [],
			// 启用实时查询（让标准查询支持subscription）
			watchPg: true,
			// 启用查询缓存以支持实时更新
			pgSettings: {
				statement_timeout: '30s',
			},
		}),
	};
};

// 启动服务器
const startServer = async (): Promise<void> => {
	try {
		// 测试数据库连接
		await pgPool.query('SELECT NOW() as current_time');
		console.log('✅ 数据库连接成功');

		// 创建数据库内省器
		const introspector = new DatabaseIntrospector(pgPool);

		// 扫描数据库表结构
		console.log('🔍 正在扫描数据库表结构...');
		const allTables = await introspector.getAllTables();
		const tableNames = allTables.map(t => t.table_name);

		console.log('📊 发现的表：');
		allTables.forEach(table => {
			const keyFields = table.fields
				.filter(f => f.is_key)
				.map(f => f.field_name);
			const valueFields = table.fields
				.filter(f => !f.is_key)
				.map(f => f.field_name);
			console.log(`  - ${table.table_name}`);
			console.log(`    键字段: [${keyFields.join(', ')}]`);
			console.log(`    值字段: [${valueFields.join(', ')}]`);
		});

		// 创建插件钩子，加载 @graphile/pg-pubsub 插件
		let pluginHook;
		const appendPlugins = [];

		if (ENABLE_SUBSCRIPTIONS === 'true') {
			try {
				console.log('🔌 正在加载 subscription 插件...');
				const PgPubsub = require('@graphile/pg-pubsub').default;

				// 重新启用自定义订阅插件
				const dynamicSubscriptionPlugin =
					createDynamicSubscriptionPlugin(tableNames);
				appendPlugins.push(dynamicSubscriptionPlugin);
				appendPlugins.push(SystemTableSubscriptionPlugin);

				pluginHook = makePluginHook([PgPubsub, ...appendPlugins]);

				console.log('✅ Subscription 插件加载成功');
				console.log('✅ 自定义订阅插件已启用');
			} catch (error) {
				console.warn(
					'⚠️  无法加载 @graphile/pg-pubsub 插件，将禁用 subscription 功能'
				);
				console.warn('   请运行: npm install @graphile/pg-pubsub');
				console.warn('   错误详情:', error);
				process.env.ENABLE_SUBSCRIPTIONS = 'false';
			}
		}

		// 创建 PostGraphile 中间件
		const postgraphileConfig = createPostGraphileConfig(tableNames);
		const postgraphileMiddleware = postgraphile(pgPool, PG_SCHEMA, {
			...postgraphileConfig,
			...(pluginHook ? { pluginHook } : {}),
		});

		// 创建 HTTP 服务器
		const server = createServer(async (req, res) => {
			const url = req.url || '';

			try {
				// 根路径返回欢迎页面
				if (url === '/' || url === '') {
					res.writeHead(200, {
						'Content-Type': 'text/html; charset=utf-8',
					});
					res.end(createWelcomePage(allTables));
					return;
				}

				// GraphQL 和 GraphiQL 请求交给 PostGraphile 处理
				if (
					url.startsWith(GRAPHQL_ENDPOINT) ||
					url.startsWith('/graphiql')
				) {
					return postgraphileMiddleware(req, res);
				}

				// 404 处理
				res.writeHead(404, { 'Content-Type': 'text/plain' });
				res.end('Not Found');
			} catch (error) {
				console.error('❌ 请求处理错误:', error);
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				res.end('Internal Server Error');
			}
		});

		// PostGraphile 内置的实时查询支持（作为订阅的替代方案）
		if (ENABLE_SUBSCRIPTIONS === 'true') {
			console.log('✅ 实时查询功能已启用 (live queries)');
			console.log('   注意：使用实时查询而不是传统的 WebSocket 订阅');
			console.log('   这提供了类似的实时数据更新功能');
		}

		// 声明实时订阅服务器变量
		let realtimeServer: RealtimeSubscriptionServer | null = null;

		// 优雅关闭处理
		process.on('SIGINT', async () => {
			console.log('\n⏹️  正在关闭服务器...');

			// 关闭实时订阅服务器
			if (realtimeServer) {
				await realtimeServer.close();
			}

			await pgPool.end();
			server.close();
			process.exit(0);
		});

		// 启动服务器
		server.listen(PORT, () => {
			console.log('🚀 Sui Indexer GraphQL 服务器启动成功！');
			console.log('');
			console.log(`📍 服务器地址: http://localhost:${PORT}`);
			console.log(
				`📊 GraphQL API: http://localhost:${PORT}${GRAPHQL_ENDPOINT}`
			);
			console.log(`🎮 GraphiQL: http://localhost:${PORT}/graphiql`);
			if (ENABLE_SUBSCRIPTIONS === 'true') {
				console.log(
					`📡 WebSocket 订阅: ws://localhost:${PORT}${GRAPHQL_ENDPOINT}`
				);
			}
			console.log('');
			console.log(`📝 环境: ${NODE_ENV}`);
			console.log(`🗄️  数据库模式: ${PG_SCHEMA}`);
			console.log(`📊 动态表数量: ${allTables.length}`);
			console.log(`🔒 CORS: ${ENABLE_CORS === 'true' ? '启用' : '禁用'}`);
			console.log(
				`📡 订阅: ${ENABLE_SUBSCRIPTIONS === 'true' ? '启用' : '禁用'}`
			);
			console.log('');
			console.log('💡 访问根路径查看详细信息和使用指南');
			console.log('按 Ctrl+C 停止服务器');
		});

		// 启动实时订阅服务器
		try {
			const REALTIME_PORT = parseInt(process.env.REALTIME_PORT || '4001');
			realtimeServer = new RealtimeSubscriptionServer(
				REALTIME_PORT,
				DATABASE_URL
			);

			console.log('');
			console.log('🔥 实时推送服务已启动！');
			console.log(
				`📡 WebSocket实时推送: ws://localhost:${REALTIME_PORT}`
			);
			console.log('💡 客户端可以连接到此端口接收实时数据更新');
		} catch (error) {
			console.error('❌ 启动实时订阅服务器失败:', error);
			console.log('⚠️  将继续运行GraphQL服务器，但没有实时推送功能');
		}

		// 可选：监听数据库变更（用于调试）
		if (ENABLE_SUBSCRIPTIONS === 'true') {
			try {
				const notifyClient = new Pool({
					connectionString: DATABASE_URL,
				});
				const client = await notifyClient.connect();

				// 监听表结构变更
				await client.query('LISTEN table_structure_changes');

				client.on('notification', async msg => {
					if (msg.channel === 'table_structure_changes') {
						console.log(
							'📡 检测到数据库结构变更，建议重启服务器以更新 GraphQL schema'
						);
					}
				});

				console.log('👂 数据库结构变更监听已启动');
			} catch (error) {
				console.log(
					'⚠️  数据库变更监听启动失败，将继续运行（这不影响基本功能）'
				);
				console.log('   错误详情:', error);
			}
		}
	} catch (error) {
		console.error('❌ 启动服务器失败:');
		console.error(error);
		console.log('');
		console.log('💡 可能的原因：');
		console.log('1. 数据库连接失败 - 检查 DATABASE_URL');
		console.log(
			'2. 数据库中没有预期的表结构 - 确保 sui-rust-indexer 已运行'
		);
		console.log('3. 权限问题 - 确保数据库用户有足够权限');
		console.log('4. 缺少 subscription 依赖 - 运行 npm install');
		process.exit(1);
	}
};

// 启动应用
startServer();
