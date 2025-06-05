import { postgraphile } from 'postgraphile';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import {
	dbLogger,
	serverLogger,
	systemLogger,
	subscriptionLogger,
	logPerformance,
	logDatabaseOperation,
} from './utils/logger';
import {
	DatabaseIntrospector,
	createPostGraphileConfig,
	PostGraphileConfigOptions,
	SubscriptionManager,
	ServerManager,
	WelcomePageConfig,
} from './plugins';

// 加载环境变量
dotenv.config();

// 环境变量配置
const {
	DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
	PORT = 4000,
	NODE_ENV = 'development',
	GRAPHQL_ENDPOINT = '/graphql',
	PG_SCHEMA = 'public',
	ENABLE_CORS = 'true',
	ENABLE_SUBSCRIPTIONS = 'true',
	REALTIME_PORT = '4001',
} = process.env;

// 创建数据库连接池
const pgPool = new Pool({
	connectionString: DATABASE_URL,
});

// 启动服务器
const startServer = async (): Promise<void> => {
	const startTime = Date.now();

	try {
		// 1. 测试数据库连接并扫描表结构
		systemLogger.info('正在初始化数据库连接和扫描表结构...', {
			schema: PG_SCHEMA,
			databaseUrl: DATABASE_URL.replace(/:[^:]*@/, ':****@'), // 隐藏密码
		});

		const introspector = new DatabaseIntrospector(pgPool, PG_SCHEMA);

		const isConnected = await introspector.testConnection();
		if (!isConnected) {
			throw new Error('数据库连接失败');
		}
		dbLogger.info('数据库连接成功', { schema: PG_SCHEMA });

		const allTables = await introspector.getAllTables();
		const tableNames = allTables.map(t => t.table_name);

		dbLogger.info('扫描表结构完成', {
			tableCount: allTables.length,
			storeTableCount: tableNames.filter(name =>
				name.startsWith('store_')
			).length,
			tableNames: tableNames.slice(0, 10), // 只显示前10个表名
		});

		// 2. 配置和加载订阅插件
		subscriptionLogger.info('配置订阅管理器', {
			enableSubscriptions: ENABLE_SUBSCRIPTIONS,
			availableTableCount: tableNames.length,
		});

		const subscriptionManager = new SubscriptionManager({
			enableSubscriptions: ENABLE_SUBSCRIPTIONS,
			tableNames,
		});

		const { pluginHook, success: subscriptionSuccess } =
			await subscriptionManager.loadSubscriptionPlugins();

		// 3. 创建 PostGraphile 配置
		const postgraphileConfigOptions: PostGraphileConfigOptions = {
			port: PORT,
			nodeEnv: NODE_ENV,
			graphqlEndpoint: GRAPHQL_ENDPOINT,
			enableSubscriptions: ENABLE_SUBSCRIPTIONS,
			enableCors: ENABLE_CORS,
			databaseUrl: DATABASE_URL,
			availableTables: tableNames,
		};

		serverLogger.info('创建 PostGraphile 配置', {
			endpoint: GRAPHQL_ENDPOINT,
			enableCors: ENABLE_CORS,
			enableSubscriptions: ENABLE_SUBSCRIPTIONS,
		});

		const postgraphileConfig = createPostGraphileConfig(
			postgraphileConfigOptions
		);

		// 4. 创建 PostGraphile 中间件
		const postgraphileMiddleware = postgraphile(pgPool, PG_SCHEMA, {
			...postgraphileConfig,
			...(pluginHook ? { pluginHook } : {}),
		});

		// 5. 配置欢迎页面
		const welcomeConfig: WelcomePageConfig = {
			port: PORT,
			graphqlEndpoint: GRAPHQL_ENDPOINT,
			nodeEnv: NODE_ENV,
			schema: PG_SCHEMA,
			enableCors: ENABLE_CORS,
			enableSubscriptions: ENABLE_SUBSCRIPTIONS,
		};

		// 6. 创建和启动服务器
		const serverManager = new ServerManager({
			port: PORT,
			graphqlEndpoint: GRAPHQL_ENDPOINT,
			enableSubscriptions: ENABLE_SUBSCRIPTIONS,
			databaseUrl: DATABASE_URL,
			realtimePort: REALTIME_PORT,
		});

		const httpServer = serverManager.createHttpServer(
			postgraphileMiddleware,
			allTables,
			welcomeConfig,
			postgraphileConfigOptions
		);

		// 7. 启动HTTP服务器
		httpServer.listen(PORT, () => {
			serverManager.logServerInfo(allTables, welcomeConfig);
			logPerformance('服务器启动', startTime, {
				port: PORT,
				tableCount: allTables.length,
				nodeEnv: NODE_ENV,
			});
		});

		// 8. 启动实时订阅服务器
		await serverManager.startRealtimeServer(tableNames);

		// 9. 启动数据库变更监听
		await serverManager.startDatabaseListener(DATABASE_URL);

		// 10. 设置优雅关闭处理
		process.on('SIGINT', async () => {
			systemLogger.info('收到 SIGINT 信号，开始优雅关闭服务器...');
			await serverManager.gracefulShutdown(httpServer, pgPool);
		});

		process.on('SIGTERM', async () => {
			systemLogger.info('收到 SIGTERM 信号，开始优雅关闭服务器...');
			await serverManager.gracefulShutdown(httpServer, pgPool);
		});
	} catch (error) {
		systemLogger.error('启动服务器失败', error, {
			databaseUrl: DATABASE_URL.replace(/:[^:]*@/, ':****@'),
			schema: PG_SCHEMA,
			port: PORT,
		});

		systemLogger.info('💡 可能的原因：');
		systemLogger.info('1. 数据库连接失败 - 检查 DATABASE_URL');
		systemLogger.info(
			'2. 数据库中没有预期的表结构 - 确保 sui-rust-indexer 已运行'
		);
		systemLogger.info('3. 权限问题 - 确保数据库用户有足够权限');
		systemLogger.info('4. 缺少 subscription 依赖 - 运行 npm install');

		process.exit(1);
	}
};

// 启动应用
systemLogger.info('🚀 启动 Sui Indexer GraphQL 服务器...', {
	nodeVersion: process.version,
	platform: process.platform,
	pid: process.pid,
});

startServer();
