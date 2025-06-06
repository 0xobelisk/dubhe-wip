// 增强的服务器管理器 - 统一管理三种订阅模式

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
import { RealtimeSubscriptionServer } from '../realtime-server';
import { UnifiedRealtimeEngine } from '../realtime-engine';
import {
	systemLogger,
	wsLogger,
	serverLogger,
	logPerformance,
} from '../utils/logger';
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
	private realtimeServer: RealtimeSubscriptionServer | null = null;
	private unifiedEngine: UnifiedRealtimeEngine | null = null;

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

				// 处理增强版 GraphQL Playground
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

				// 测试数据插入端点（仅开发环境）
				if (
					url === '/test-data' &&
					req.method === 'POST' &&
					process.env.NODE_ENV === 'development'
				) {
					this.handleTestDataInsertion(req, res, serverConfig);
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
		const { postgraphileMiddleware, pgPool, tableNames, databaseUrl } =
			serverConfig;

		// 创建HTTP服务器
		this.httpServer = createServer(this.createRequestHandler(serverConfig));

		// 根据配置启用不同的订阅模式
		await this.setupSubscriptionServices(serverConfig);

		serverLogger.info('🚀 增强服务器创建完成', {
			graphqlPort: this.config.graphqlPort,
			capabilities: this.config.capabilities,
			recommendedMethod:
				subscriptionConfig.getRecommendedSubscriptionMethod(),
		});

		return this.httpServer;
	}

	// 设置订阅服务
	private async setupSubscriptionServices(
		serverConfig: EnhancedServerConfig
	) {
		const { postgraphileMiddleware, pgPool, tableNames, databaseUrl } =
			serverConfig;

		// 1. PostGraphile订阅增强（Live Queries + 传统订阅）
		if (
			this.config.capabilities.liveQueries ||
			this.config.capabilities.pgSubscriptions
		) {
			enhanceHttpServerWithSubscriptions(
				this.httpServer!,
				postgraphileMiddleware
			);
			systemLogger.info('✅ PostGraphile WebSocket订阅已启用', {
				liveQueries: this.config.capabilities.liveQueries,
				pgSubscriptions: this.config.capabilities.pgSubscriptions,
			});
		}

		// 2. 原生WebSocket服务器（仅在指定独立端口时启动）
		if (
			this.config.capabilities.nativeWebSocket &&
			this.config.websocketPort &&
			this.config.websocketPort !== this.config.graphqlPort
		) {
			this.realtimeServer = new RealtimeSubscriptionServer(
				this.config.websocketPort,
				databaseUrl,
				tableNames
			);

			wsLogger.info('✅ 原生WebSocket服务器已启动（独立端口）', {
				port: this.config.websocketPort,
				tablesCount: tableNames.length,
			});
		} else if (this.config.capabilities.nativeWebSocket) {
			wsLogger.info(
				'✅ 原生WebSocket将通过主HTTP服务器提供（共享端口）',
				{
					port: this.config.graphqlPort,
					note: '通过PostGraphile的WebSocket功能提供',
				}
			);
		}

		// 3. 统一实时引擎（可选的高级模式）
		if (process.env.ENABLE_UNIFIED_ENGINE === 'true') {
			const engineConfig = {
				port: this.config.websocketPort || this.config.graphqlPort + 1,
				dbUrl: databaseUrl,
				enableLiveQueries: this.config.capabilities.liveQueries,
				enableNativeWebSocket: this.config.capabilities.nativeWebSocket,
				tableNames,
				maxConnections: this.config.maxConnections,
				heartbeatInterval: this.config.heartbeatInterval,
			};

			this.unifiedEngine = new UnifiedRealtimeEngine(engineConfig);
			systemLogger.info('✅ 统一实时引擎已启动', engineConfig);
		}
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

		serverLogger.info('🎉 增强GraphQL服务器启动成功!', {
			port: this.config.graphqlPort,
			endpoints: {
				home: `http://localhost:${this.config.graphqlPort}/`,
				playground: `http://localhost:${this.config.graphqlPort}/playground`,
				graphql: clientConfig.graphqlEndpoint,
				subscription: clientConfig.subscriptionEndpoint,
				nativeWebSocket: clientConfig.nativeWebSocketEndpoint,
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
		console.log('🌟'.repeat(30) + '\n');

		// 显示能力状态
		serverLogger.info('📡 订阅能力状态:', this.config.capabilities);

		// 显示推荐使用方法
		const recommendedMethod =
			subscriptionConfig.getRecommendedSubscriptionMethod();
		serverLogger.info(`💡 推荐使用: ${recommendedMethod}`);

		// 显示示例用法
		this.logUsageExamples();
	}

	// 记录使用示例
	private logUsageExamples() {
		console.log('\n' + '='.repeat(80));
		console.log('📚 订阅使用示例:');
		console.log('='.repeat(80));

		if (this.config.capabilities.liveQueries) {
			console.log('\n🔥 Live Queries (推荐):');
			console.log(`subscription {
  encounters @live {
    nodes { player monster exists }
    totalCount
  }
}`);
		}

		if (this.config.capabilities.pgSubscriptions) {
			console.log('\n⚡ PostgreSQL Subscriptions:');
			console.log(`subscription {
  listen(topic: "store_encounter") {
    relatedNodeId
    relatedNode { nodeId }
  }
}`);
		}

		if (this.config.capabilities.nativeWebSocket) {
			console.log('\n🌐 Native WebSocket:');
			console.log(`const ws = new WebSocket('${
				subscriptionConfig.generateClientConfig()
					.nativeWebSocketEndpoint
			}');
ws.send(JSON.stringify({
  action: 'subscribe',
  table: 'encounter'
}));`);
		}

		console.log('\n' + '='.repeat(80) + '\n');
	}

	// 获取订阅状态
	getSubscriptionStatus() {
		return {
			config: this.config,
			services: {
				postgraphile:
					this.config.capabilities.liveQueries ||
					this.config.capabilities.pgSubscriptions,
				realtimeServer: this.realtimeServer !== null,
				unifiedEngine: this.unifiedEngine !== null,
			},
			clientConfig: subscriptionConfig.generateClientConfig(),
		};
	}

	// 优雅关闭
	async gracefulShutdown(pgPool: Pool): Promise<void> {
		systemLogger.info('🛑 开始优雅关闭服务器...');

		const shutdownPromises: Promise<void>[] = [];

		// 关闭原生WebSocket服务器
		if (this.realtimeServer) {
			shutdownPromises.push(this.realtimeServer.close());
		}

		// 关闭统一实时引擎
		if (this.unifiedEngine) {
			shutdownPromises.push(this.unifiedEngine.shutdown());
		}

		// 关闭HTTP服务器
		if (this.httpServer) {
			shutdownPromises.push(
				new Promise(resolve => {
					this.httpServer!.close(() => {
						systemLogger.info('HTTP服务器已关闭');
						resolve();
					});
				})
			);
		}

		// 等待所有服务关闭
		await Promise.all(shutdownPromises);

		// 关闭数据库连接池
		await pgPool.end();
		systemLogger.info('数据库连接池已关闭');

		systemLogger.info('✅ 服务器优雅关闭完成');
		process.exit(0);
	}

	// 发送测试消息（用于调试）
	sendTestUpdate(table: string = 'encounter', data: any = { test: true }) {
		if (this.realtimeServer) {
			this.realtimeServer.sendTestMessage(table);
		}

		if (this.unifiedEngine) {
			this.unifiedEngine.triggerTestUpdate(table, data);
		}

		systemLogger.info('📤 测试消息已发送', { table, data });
	}

	// 获取实时指标
	getMetrics() {
		const metrics: any = {
			timestamp: new Date().toISOString(),
			config: this.config,
		};

		if (this.realtimeServer) {
			metrics.realtimeServer = this.realtimeServer.getStatus();
		}

		if (this.unifiedEngine) {
			metrics.unifiedEngine = this.unifiedEngine.getStatus();
		}

		return metrics;
	}

	// 处理测试数据插入（仅开发环境）
	private handleTestDataInsertion(
		req: IncomingMessage,
		res: ServerResponse,
		serverConfig: EnhancedServerConfig
	) {
		try {
			// 模拟数据插入，触发数据库通知
			const testData = {
				type: 'test_data_insertion',
				timestamp: new Date().toISOString(),
				message: '这是一个测试数据插入，用于触发订阅更新',
			};

			// 发送测试消息给所有活跃的订阅
			if (this.realtimeServer) {
				this.realtimeServer.sendTestMessage('encounter');
			}

			if (this.unifiedEngine) {
				this.unifiedEngine.triggerTestUpdate('encounter', testData);
			}

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					success: true,
					message: '测试数据已插入，检查订阅客户端是否收到更新',
					data: testData,
					timestamp: new Date().toISOString(),
				})
			);

			systemLogger.info('📤 手动触发测试数据插入', testData);
		} catch (error) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : '未知错误',
				})
			);
		}
	}
}
