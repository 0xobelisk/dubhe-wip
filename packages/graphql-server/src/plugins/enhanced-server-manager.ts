// 简化的服务器管理器 - 只支持基本HTTP服务器和PostgreSQL listen订阅

import {
	createServer,
	Server as HttpServer,
	IncomingMessage,
	ServerResponse,
} from 'http';
import { Pool } from 'pg';
import { enhanceHttpServerWithSubscriptions } from 'postgraphile';
import {
	subscriptionConfig,
	SubscriptionConfig,
} from '../config/subscription-config';
import { systemLogger, serverLogger, logPerformance } from '../utils/logger';
import { createWelcomePage, WelcomePageConfig } from './welcome-page';
import {
	createPlaygroundHtml,
	PostGraphileConfigOptions,
} from './postgraphile-config';
import type { DynamicTable } from './database-introspector';

export interface EnhancedServerConfig {
	postgraphileMiddleware: any;
	pgPool: Pool;
	tableNames: string[];
	databaseUrl: string;
	allTables: DynamicTable[];
	welcomeConfig: WelcomePageConfig;
	postgraphileConfigOptions: PostGraphileConfigOptions;
}

export class EnhancedServerManager {
	private config: SubscriptionConfig;
	private httpServer: HttpServer | null = null;

	constructor() {
		this.config = subscriptionConfig.getConfig();
	}

	// 创建HTTP请求处理器
	private createRequestHandler(serverConfig: EnhancedServerConfig) {
		const {
			postgraphileMiddleware,
			allTables,
			welcomeConfig,
			postgraphileConfigOptions,
		} = serverConfig;

		return (req: IncomingMessage, res: ServerResponse) => {
			const url = req.url || '';
			const method = req.method || 'GET';
			const startTime = Date.now();

			// 设置CORS头
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			res.setHeader(
				'Access-Control-Allow-Headers',
				'Content-Type, Authorization'
			);

			// 处理预检请求
			if (req.method === 'OPTIONS') {
				res.writeHead(200);
				res.end();
				return;
			}

			try {
				// 根路径返回欢迎页面
				if (url === '/' || url === '') {
					res.writeHead(200, {
						'Content-Type': 'text/html; charset=utf-8',
					});
					res.end(createWelcomePage(allTables, welcomeConfig));
					logPerformance(`HTTP ${method} ${url}`, startTime, {
						statusCode: 200,
						contentType: 'text/html',
					});
					return;
				}

				// 处理GraphQL Playground
				if (url.startsWith('/playground')) {
					res.writeHead(200, {
						'Content-Type': 'text/html; charset=utf-8',
					});
					res.end(createPlaygroundHtml(postgraphileConfigOptions));
					logPerformance(`HTTP ${method} ${url}`, startTime, {
						statusCode: 200,
						contentType: 'text/html',
					});
					return;
				}

				// 如果访问旧的 /graphiql 路径，重定向到新的 /playground
				if (url.startsWith('/graphiql')) {
					res.writeHead(301, { Location: '/playground' });
					res.end();
					serverLogger.info('重定向旧的GraphiQL路径', {
						from: url,
						to: '/playground',
					});
					return;
				}

				// GraphQL请求交给PostGraphile处理
				if (url.startsWith('/graphql')) {
					postgraphileMiddleware(req, res);
					logPerformance(`GraphQL ${method}`, startTime, {
						endpoint: '/graphql',
					});
					return;
				}

				// 健康检查端点
				if (url === '/health') {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify({
							status: 'healthy',
							subscriptions: this.getSubscriptionStatus(),
							timestamp: new Date().toISOString(),
						})
					);
					return;
				}

				// 订阅配置端点
				if (url === '/subscription-config') {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(
						JSON.stringify(
							subscriptionConfig.generateClientConfig()
						)
					);
					return;
				}

				// 配置文档端点
				if (url === '/subscription-docs') {
					res.writeHead(200, { 'Content-Type': 'text/plain' });
					res.end(subscriptionConfig.generateDocumentation());
					return;
				}

				// 404处理
				res.writeHead(404, { 'Content-Type': 'text/plain' });
				res.end('Not Found');
				serverLogger.warn('404 - 路径未找到', {
					url,
					method,
					userAgent: req.headers['user-agent']?.substring(0, 50),
				});
			} catch (error) {
				serverLogger.error('请求处理错误', error, {
					url,
					method,
					userAgent: req.headers['user-agent']?.substring(0, 50),
				});
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				res.end('Internal Server Error');
			}
		};
	}

	// 创建和配置HTTP服务器
	async createEnhancedServer(
		serverConfig: EnhancedServerConfig
	): Promise<HttpServer> {
		const { postgraphileMiddleware } = serverConfig;

		// 创建HTTP服务器
		this.httpServer = createServer(this.createRequestHandler(serverConfig));

		// 只启用PostgreSQL订阅（listen）
		if (this.config.capabilities.pgSubscriptions) {
			enhanceHttpServerWithSubscriptions(
				this.httpServer,
				postgraphileMiddleware
			);
			systemLogger.info('✅ PostgreSQL listen订阅已启用', {
				pgSubscriptions: this.config.capabilities.pgSubscriptions,
			});
		}

		serverLogger.info('🚀 简化服务器创建完成', {
			graphqlPort: this.config.graphqlPort,
			capabilities: {
				pgSubscriptions: this.config.capabilities.pgSubscriptions,
			},
			recommendedMethod: 'pg-subscriptions',
		});

		return this.httpServer;
	}

	// 启动服务器
	async startServer(): Promise<void> {
		if (!this.httpServer) {
			throw new Error('服务器未创建，请先调用 createEnhancedServer()');
		}

		return new Promise((resolve, reject) => {
			this.httpServer!.listen(this.config.graphqlPort, (err?: Error) => {
				if (err) {
					reject(err);
					return;
				}

				this.logServerStatus();
				resolve();
			});
		});
	}

	// 记录服务器状态
	private logServerStatus() {
		const clientConfig = subscriptionConfig.generateClientConfig();

		serverLogger.info('🎉 GraphQL服务器启动成功!', {
			port: this.config.graphqlPort,
			endpoints: {
				home: `http://localhost:${this.config.graphqlPort}/`,
				playground: `http://localhost:${this.config.graphqlPort}/playground`,
				graphql: clientConfig.graphqlEndpoint,
				subscription: clientConfig.subscriptionEndpoint,
				health: `http://localhost:${this.config.graphqlPort}/health`,
				config: `http://localhost:${this.config.graphqlPort}/subscription-config`,
				docs: `http://localhost:${this.config.graphqlPort}/subscription-docs`,
			},
		});

		// 显示主要访问链接
		console.log('\n' + '🌟'.repeat(30));
		console.log(
			'🏠 主页: ' + `http://localhost:${this.config.graphqlPort}/`
		);
		console.log(
			'🎮 Playground: ' +
				`http://localhost:${this.config.graphqlPort}/playground`
		);
		console.log(
			'🔗 GraphQL: ' +
				`http://localhost:${this.config.graphqlPort}/graphql`
		);
		console.log('🌟'.repeat(30) + '\n');

		// 显示订阅使用示例
		this.logUsageExamples();
	}

	// 记录使用示例
	private logUsageExamples() {
		console.log('\n' + '='.repeat(80));
		console.log('📚 订阅使用示例:');
		console.log('='.repeat(80));

		if (this.config.capabilities.pgSubscriptions) {
			console.log('\n⚡ PostgreSQL Listen Subscriptions:');
			console.log(`subscription {
  listen(topic: "store_encounter") {
    relatedNodeId
    relatedNode { nodeId }
  }
}`);
		}

		console.log('\n💡 发送测试通知:');
		console.log(
			`psql ${process.env.DATABASE_URL} -c "NOTIFY store_encounter, 'test message';"`
		);

		console.log('\n' + '='.repeat(80) + '\n');
	}

	// 获取订阅状态
	getSubscriptionStatus() {
		return {
			config: {
				enableSubscriptions: this.config.enableSubscriptions,
				capabilities: {
					liveQueries: false,
					pgSubscriptions: this.config.capabilities.pgSubscriptions,
					nativeWebSocket: false,
				},
				walLevel: this.config.walLevel,
				pgVersion: this.config.pgVersion,
				graphqlPort: this.config.graphqlPort,
				maxConnections: this.config.maxConnections,
				heartbeatInterval: this.config.heartbeatInterval,
				enableNotificationLogging:
					this.config.enableNotificationLogging,
				enablePerformanceMetrics: this.config.enablePerformanceMetrics,
			},
			services: {
				postgraphile: this.config.capabilities.pgSubscriptions,
				realtimeServer: false,
				unifiedEngine: false,
			},
			clientConfig: subscriptionConfig.generateClientConfig(),
		};
	}

	// 优雅关闭
	async gracefulShutdown(pgPool: Pool): Promise<void> {
		systemLogger.info('🛑 开始优雅关闭服务器...');

		// 关闭HTTP服务器
		if (this.httpServer) {
			await new Promise<void>(resolve => {
				this.httpServer!.close(() => {
					systemLogger.info('HTTP服务器已关闭');
					resolve();
				});
			});
		}

		// 关闭数据库连接池
		await pgPool.end();
		systemLogger.info('数据库连接池已关闭');

		systemLogger.info('✅ 服务器优雅关闭完成');
		process.exit(0);
	}
}
