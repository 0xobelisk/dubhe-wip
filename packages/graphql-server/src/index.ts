import { postgraphile } from 'postgraphile';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import {
	dbLogger,
	serverLogger,
	systemLogger,
	subscriptionLogger,
	logPerformance,
} from './utils/logger';
import {
	DatabaseIntrospector,
	createPostGraphileConfig,
	PostGraphileConfigOptions,
	WelcomePageConfig,
} from './plugins';
import { EnhancedServerManager } from './plugins/enhanced-server-manager';
import { subscriptionConfig } from './config/subscription-config';
import {
	generateStoreTablesInfo,
	createUniversalSubscriptionsPlugin,
} from './universal-subscriptions';

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

		// 2. 显示订阅配置状态
		const config = subscriptionConfig.getConfig();
		subscriptionLogger.info('📡 订阅系统配置状态', {
			enableSubscriptions: config.enableSubscriptions,
			capabilities: config.capabilities,
			recommendedMethod:
				subscriptionConfig.getRecommendedSubscriptionMethod(),
			walLevel: config.walLevel,
		});

		// 3. 预生成store表信息用于动态订阅
		subscriptionLogger.info('预生成store表信息用于动态订阅...');
		const storeTablesInfo = await generateStoreTablesInfo(pgPool);
		const storeTableNames = Object.keys(storeTablesInfo);

		subscriptionLogger.info(`发现store表: ${storeTableNames.join(', ')}`);
		subscriptionLogger.info(
			`将生成以下订阅字段: ${storeTableNames
				.map(name =>
					name.replace(/_([a-z])/g, (match, letter) =>
						letter.toUpperCase()
					)
				)
				.join(', ')}`
		);

		// 4. 创建 PostGraphile 配置
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

		// 使用增强的配置管理器，并添加预生成的动态订阅插件
		const postgraphileConfig = {
			...createPostGraphileConfig(postgraphileConfigOptions),
			...subscriptionConfig.generatePostGraphileConfig(),
		};

		// 添加动态生成的订阅插件
		const dynamicSubscriptionPlugin =
			createUniversalSubscriptionsPlugin(storeTablesInfo);
		postgraphileConfig.appendPlugins = [
			...(postgraphileConfig.appendPlugins || []),
			dynamicSubscriptionPlugin,
		];

		// 5. 创建 PostGraphile 中间件
		const postgraphileMiddleware = postgraphile(pgPool, PG_SCHEMA, {
			...postgraphileConfig,
		});

		// 6. 配置欢迎页面
		const welcomeConfig: WelcomePageConfig = {
			port: PORT,
			graphqlEndpoint: GRAPHQL_ENDPOINT,
			nodeEnv: NODE_ENV,
			schema: PG_SCHEMA,
			enableCors: ENABLE_CORS,
			enableSubscriptions: ENABLE_SUBSCRIPTIONS,
		};

		// 7. 创建增强服务器管理器
		const serverManager = new EnhancedServerManager();

		// 8. 创建增强服务器
		const httpServer = await serverManager.createEnhancedServer({
			postgraphileMiddleware,
			pgPool,
			tableNames,
			databaseUrl: DATABASE_URL,
			allTables,
			welcomeConfig,
			postgraphileConfigOptions,
		});

		// 9. 启动服务器
		await serverManager.startServer();

		logPerformance('服务器启动', startTime, {
			port: PORT,
			tableCount: allTables.length,
			storeTableCount: storeTableNames.length,
			generatedSubscriptionFields: storeTableNames.length,
			nodeEnv: NODE_ENV,
			capabilities: config.capabilities,
		});

		// 10. 显示配置文档
		if (NODE_ENV === 'development') {
			console.log('\n' + '='.repeat(80));
			console.log('📖 配置文档:');
			console.log(
				`访问 http://localhost:${PORT}/subscription-docs 查看完整配置指南`
			);
			console.log(
				`访问 http://localhost:${PORT}/subscription-config 获取客户端配置`
			);
			console.log(`访问 http://localhost:${PORT}/health 查看服务器状态`);
			console.log('='.repeat(80) + '\n');
		}

		// 11. 设置优雅关闭处理
		process.on('SIGINT', async () => {
			systemLogger.info('收到 SIGINT 信号，开始优雅关闭服务器...');
			await serverManager.gracefulShutdown(pgPool);
		});

		process.on('SIGTERM', async () => {
			systemLogger.info('收到 SIGTERM 信号，开始优雅关闭服务器...');
			await serverManager.gracefulShutdown(pgPool);
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
		systemLogger.info('4. 缺少 subscription 依赖 - 运行 pnpm install');

		// 显示订阅配置帮助
		console.log('\n' + subscriptionConfig.generateDocumentation());

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
