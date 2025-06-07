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
} = process.env;

// 订阅功能默认启用，除非明确设置为false
const ENABLE_SUBSCRIPTIONS =
	process.env.ENABLE_SUBSCRIPTIONS !== 'false' ? 'true' : 'false';

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
			capabilities: {
				pgSubscriptions: config.capabilities.pgSubscriptions,
			},
			recommendedMethod: 'pg-subscriptions',
			walLevel: config.walLevel,
		});

		// 3. 预生成store表信息用于动态查询
		subscriptionLogger.info('预生成store表信息用于工具查询...');
		const storeTablesInfo = await generateStoreTablesInfo(pgPool);
		const storeTableNames = Object.keys(storeTablesInfo);

		subscriptionLogger.info(`发现store表: ${storeTableNames.join(', ')}`);

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

		// 使用简化的配置
		const postgraphileConfig = {
			...createPostGraphileConfig(postgraphileConfigOptions),
			...subscriptionConfig.generatePostGraphileConfig(),
		};

		// 添加工具查询插件
		const toolsPlugin = createUniversalSubscriptionsPlugin(storeTablesInfo);
		postgraphileConfig.appendPlugins = [
			...(postgraphileConfig.appendPlugins || []),
			toolsPlugin,
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

		// 7. 创建简化服务器管理器
		const serverManager = new EnhancedServerManager();

		// 8. 创建服务器
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
			nodeEnv: NODE_ENV,
			capabilities: {
				pgSubscriptions: config.capabilities.pgSubscriptions,
			},
		});

		// 10. 显示使用说明
		if (NODE_ENV === 'development') {
			console.log('\n' + '='.repeat(80));
			console.log('📖 快速访问:');
			console.log(`访问 http://localhost:${PORT}/ 查看主页`);
			console.log(
				`访问 http://localhost:${PORT}/playground 使用GraphQL Playground`
			);
			console.log(`访问 http://localhost:${PORT}/health 查看服务器状态`);
			console.log(
				`访问 http://localhost:${PORT}/subscription-config 获取客户端配置`
			);
			console.log(
				`访问 http://localhost:${PORT}/subscription-docs 查看配置指南`
			);
			console.log('='.repeat(80) + '\n');
		}

		// 11. 设置简单直接的关闭处理
		let isShuttingDown = false;
		const quickShutdown = (signal: string) => {
			if (isShuttingDown) {
				console.log(`\n⚡ 强制退出进程...`);
				process.exit(0);
			}

			isShuttingDown = true;
			console.log(`\n🛑 收到 ${signal} 信号，快速关闭服务器...`);

			// 设置1秒强制退出超时
			setTimeout(() => {
				console.log('⚡ 快速退出');
				process.exit(0);
			}, 1000);

			// 尝试快速关闭HTTP服务器
			serverManager.quickShutdown().finally(() => {
				process.exit(0);
			});
		};

		process.on('SIGINT', () => quickShutdown('SIGINT'));
		process.on('SIGTERM', () => quickShutdown('SIGTERM'));

		// 简化异常处理
		process.on('unhandledRejection', reason => {
			console.error('❌ 未处理的Promise拒绝:', reason);
		});

		process.on('uncaughtException', error => {
			console.error('❌ 未捕获的异常:', error.message);
			process.exit(1);
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
		systemLogger.info('4. 缺少依赖 - 运行 npm install');

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
