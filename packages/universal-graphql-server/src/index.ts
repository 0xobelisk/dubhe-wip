import { postgraphile } from 'postgraphile';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
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
	try {
		// 1. 测试数据库连接并扫描表结构
		console.log('🔍 正在初始化数据库连接和扫描表结构...');
		const introspector = new DatabaseIntrospector(pgPool, PG_SCHEMA);

		const isConnected = await introspector.testConnection();
		if (!isConnected) {
			throw new Error('数据库连接失败');
		}
		console.log('✅ 数据库连接成功');

		const allTables = await introspector.getAllTables();
		const tableNames = allTables.map(t => t.table_name);
		introspector.logTableInfo(allTables);

		// 2. 配置和加载订阅插件
		const subscriptionManager = new SubscriptionManager({
			enableSubscriptions: ENABLE_SUBSCRIPTIONS,
			tableNames,
		});

		const { pluginHook, success: subscriptionSuccess } =
			await subscriptionManager.loadSubscriptionPlugins();
		subscriptionManager.logSubscriptionStatus(subscriptionSuccess);

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
		});

		// 8. 启动实时订阅服务器
		await serverManager.startRealtimeServer();

		// 9. 启动数据库变更监听
		await serverManager.startDatabaseListener(DATABASE_URL);

		// 10. 设置优雅关闭处理
		process.on('SIGINT', async () => {
			await serverManager.gracefulShutdown(httpServer, pgPool);
		});
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
console.log('🚀 启动 Sui Indexer GraphQL 服务器...');
startServer();
