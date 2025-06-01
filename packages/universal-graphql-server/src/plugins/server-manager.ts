import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Pool } from 'pg';
import { RealtimeSubscriptionServer } from '../realtime-server';
import type { DynamicTable } from './database-introspector';
import { createWelcomePage, WelcomePageConfig } from './welcome-page';
import {
	createPlaygroundHtml,
	PostGraphileConfigOptions,
} from './postgraphile-config';
import {
	serverLogger,
	systemLogger,
	dbLogger,
	wsLogger,
	perfLogger,
	logPerformance,
} from '../logger';

export interface ServerConfig {
	port: string | number;
	graphqlEndpoint: string;
	enableSubscriptions: string;
	databaseUrl: string;
	realtimePort?: string | number;
}

export class ServerManager {
	private realtimeServer: RealtimeSubscriptionServer | null = null;

	constructor(private config: ServerConfig) {
		serverLogger.info('初始化服务器管理器', {
			port: config.port,
			endpoint: config.graphqlEndpoint,
			subscriptions: config.enableSubscriptions,
			realtimePort: config.realtimePort,
		});
	}

	// 创建HTTP服务器
	createHttpServer(
		postgraphileMiddleware: any,
		allTables: DynamicTable[],
		welcomeConfig: WelcomePageConfig,
		postgraphileConfig: PostGraphileConfigOptions
	) {
		return createServer(
			async (req: IncomingMessage, res: ServerResponse) => {
				const url = req.url || '';
				const method = req.method || 'GET';
				const startTime = Date.now();

				try {
					serverLogger.debug('处理HTTP请求', {
						method,
						url,
						userAgent: req.headers['user-agent']?.substring(0, 100),
					});

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
						res.end(createPlaygroundHtml(postgraphileConfig));
						logPerformance(`HTTP ${method} ${url}`, startTime, {
							statusCode: 200,
							contentType: 'text/html',
						});
						return;
					}

					// GraphQL 请求交给 PostGraphile 处理
					if (url.startsWith(this.config.graphqlEndpoint)) {
						const result = postgraphileMiddleware(req, res);
						logPerformance(`GraphQL ${method}`, startTime, {
							endpoint: this.config.graphqlEndpoint,
						});
						return result;
					}

					// 如果访问旧的 /graphiql 路径，重定向到新的 /playground
					if (url.startsWith('/graphiql')) {
						res.writeHead(301, {
							Location: '/playground',
						});
						res.end();
						serverLogger.info('重定向旧的GraphiQL路径', {
							from: url,
							to: '/playground',
						});
						return;
					}

					// 404 处理
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
			}
		);
	}

	// 启动实时订阅服务器
	async startRealtimeServer(): Promise<void> {
		try {
			const realtimePort = parseInt(
				(this.config.realtimePort as string) || '4001'
			);

			wsLogger.info('启动实时订阅服务器', { port: realtimePort });

			this.realtimeServer = new RealtimeSubscriptionServer(
				realtimePort,
				this.config.databaseUrl
			);

			wsLogger.info('🔥 实时推送服务已启动！', {
				port: realtimePort,
				webSocketUrl: `ws://localhost:${realtimePort}`,
			});
		} catch (error) {
			wsLogger.error('启动实时订阅服务器失败', error, {
				port: this.config.realtimePort,
			});
			systemLogger.warn('将继续运行GraphQL服务器，但没有实时推送功能');
		}
	}

	// 启动数据库变更监听
	async startDatabaseListener(databaseUrl: string): Promise<void> {
		if (this.config.enableSubscriptions !== 'true') {
			dbLogger.info('数据库变更监听已禁用', {
				enableSubscriptions: this.config.enableSubscriptions,
			});
			return;
		}

		try {
			const notifyClient = new Pool({
				connectionString: databaseUrl,
			});
			const client = await notifyClient.connect();

			// 监听表结构变更
			await client.query('LISTEN table_structure_changes');

			client.on('notification', async msg => {
				if (msg.channel === 'table_structure_changes') {
					dbLogger.warn(
						'检测到数据库结构变更，建议重启服务器以更新 GraphQL schema',
						{
							channel: msg.channel,
							payload: msg.payload,
						}
					);
				}
			});

			dbLogger.info('👂 数据库结构变更监听已启动', {
				channel: 'table_structure_changes',
			});
		} catch (error) {
			dbLogger.warn(
				'数据库变更监听启动失败，将继续运行（这不影响基本功能）',
				error
			);
		}
	}

	// 优雅关闭
	async gracefulShutdown(httpServer: any, pgPool: Pool): Promise<void> {
		systemLogger.info('⏹️  正在关闭服务器...');

		const shutdownStart = Date.now();
		try {
			// 关闭实时订阅服务器
			if (this.realtimeServer) {
				await this.realtimeServer.close();
			}

			// 关闭数据库连接池
			await pgPool.end();
			dbLogger.info('数据库连接池已关闭');

			// 关闭HTTP服务器
			httpServer.close();
			serverLogger.info('HTTP服务器已关闭');

			logPerformance('服务器关闭', shutdownStart);
			systemLogger.info('✅ 服务器已优雅关闭');
		} catch (error) {
			systemLogger.error('关闭服务器时出错', error);
		} finally {
			process.exit(0);
		}
	}

	// 输出服务器启动信息
	logServerInfo(
		allTables: DynamicTable[],
		welcomeConfig: WelcomePageConfig
	): void {
		const storeTableCount = allTables.filter(t =>
			t.table_name.startsWith('store_')
		).length;

		serverLogger.info('🚀 Sui Indexer GraphQL 服务器启动成功！');
		serverLogger.info('服务器地址', {
			url: `http://localhost:${this.config.port}`,
		});
		serverLogger.info('GraphQL API', {
			url: `http://localhost:${this.config.port}${this.config.graphqlEndpoint}`,
		});
		serverLogger.info('增强版 GraphQL Playground', {
			url: `http://localhost:${this.config.port}/playground`,
			features: ['现代化界面', 'Schema Explorer', '代码导出'],
			note: '旧路径 /graphiql 会自动重定向到 /playground',
		});

		if (this.config.enableSubscriptions === 'true') {
			serverLogger.info('WebSocket 订阅', {
				url: `ws://localhost:${this.config.port}${this.config.graphqlEndpoint}`,
			});
		}

		serverLogger.info('服务器配置', {
			environment: welcomeConfig.nodeEnv,
			schema: welcomeConfig.schema,
			totalTables: allTables.length,
			storeTables: storeTableCount,
			systemTables: allTables.length - storeTableCount,
			cors: welcomeConfig.enableCors === 'true' ? '启用' : '禁用',
			subscriptions:
				this.config.enableSubscriptions === 'true' ? '启用' : '禁用',
		});

		systemLogger.info('💡 访问根路径查看详细信息和使用指南');
		systemLogger.info('按 Ctrl+C 停止服务器');
	}
}
