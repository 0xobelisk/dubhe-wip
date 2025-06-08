// Express服务器管理器 - 使用Express框架和PostgreSQL订阅

import express, { Express, Request, Response } from 'express';
import { createServer, Server as HttpServer } from 'http';
import cors from 'cors';
import { Pool } from 'pg';
import { enhanceHttpServerWithSubscriptions } from 'postgraphile';
import {
	subscriptionConfig,
	SubscriptionConfig,
} from '../config/subscription-config';
import { systemLogger, serverLogger, logExpress } from '../utils/logger';
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
	private app: Express | null = null;
	private httpServer: HttpServer | null = null;

	constructor() {
		this.config = subscriptionConfig.getConfig();
	}

	// 创建Express应用
	private createExpressApp(serverConfig: EnhancedServerConfig): Express {
		const {
			postgraphileMiddleware,
			allTables,
			welcomeConfig,
			postgraphileConfigOptions,
		} = serverConfig;

		const app = express();

		// 中间件配置
		app.use(
			cors({
				origin: '*',
				methods: ['GET', 'POST', 'OPTIONS'],
				allowedHeaders: ['Content-Type', 'Authorization'],
			})
		);

		// 请求日志中间件
		app.use((req: Request, res: Response, next) => {
			const startTime = Date.now();

			res.on('finish', () => {
				logExpress(req.method, req.path, res.statusCode, startTime, {
					userAgent: req.get('user-agent')?.substring(0, 50),
				});
			});

			next();
		});

		// 路由配置

		// 根路径 - 欢迎页面
		app.get('/', (req: Request, res: Response) => {
			res.set('Content-Type', 'text/html; charset=utf-8');
			res.send(createWelcomePage(allTables, welcomeConfig));
		});

		// GraphQL Playground
		app.get('/playground', (req: Request, res: Response) => {
			res.set('Content-Type', 'text/html; charset=utf-8');
			res.send(createPlaygroundHtml(postgraphileConfigOptions));
		});

		// 重定向旧的GraphiQL路径
		app.get('/graphiql*', (req: Request, res: Response) => {
			serverLogger.info('重定向旧的GraphiQL路径', {
				from: req.path,
				to: '/playground',
			});
			res.redirect(301, '/playground');
		});

		// 健康检查端点
		app.get('/health', (req: Request, res: Response) => {
			res.json({
				status: 'healthy',
				subscriptions: this.getSubscriptionStatus(),
				timestamp: new Date().toISOString(),
			});
		});

		// 订阅配置端点
		app.get('/subscription-config', (req: Request, res: Response) => {
			res.json(subscriptionConfig.generateClientConfig());
		});

		// 配置文档端点
		app.get('/subscription-docs', (req: Request, res: Response) => {
			res.set('Content-Type', 'text/plain');
			res.send(subscriptionConfig.generateDocumentation());
		});

		// PostGraphile中间件 - 在根路径挂载，让PostGraphile自己处理路由
		app.use((req: Request, res: Response, next) => {
			// 检查PostGraphile中间件是否存在
			if (!postgraphileMiddleware) {
				console.error('❌ PostGraphile中间件为空!');
				if (req.path.startsWith('/graphql')) {
					res.status(500).json({
						error: 'PostGraphile中间件未正确初始化',
					});
					return;
				}
				next();
				return;
			}

			try {
				postgraphileMiddleware(req, res, next);
			} catch (error) {
				console.error('❌ PostGraphile中间件执行错误:', error);
				if (req.path.startsWith('/graphql')) {
					res.status(500).json({
						error: 'PostGraphile执行错误',
						details:
							error instanceof Error
								? error.message
								: String(error),
					});
					return;
				}
				next();
			}
		});

		// 错误处理中间件
		app.use(
			(
				err: Error,
				req: Request,
				res: Response,
				next: express.NextFunction
			) => {
				serverLogger.error('Express错误处理', err, {
					url: req.originalUrl,
					method: req.method,
					userAgent: req.get('user-agent')?.substring(0, 50),
				});
				res.status(500).send('Internal Server Error');
			}
		);

		return app;
	}

	// 创建和配置HTTP服务器
	async createEnhancedServer(
		serverConfig: EnhancedServerConfig
	): Promise<HttpServer> {
		const { postgraphileMiddleware } = serverConfig;

		// 创建Express应用
		this.app = this.createExpressApp(serverConfig);

		// 创建HTTP服务器
		this.httpServer = createServer(this.app);

		// 启用PostgreSQL订阅和WebSocket支持
		if (this.config.capabilities.pgSubscriptions) {
			enhanceHttpServerWithSubscriptions(
				this.httpServer,
				postgraphileMiddleware,
				{
					// 启用WebSocket传输
					graphqlRoute: '/graphql',
				}
			);
			systemLogger.info('✅ PostgreSQL订阅和WebSocket已启用', {
				pgSubscriptions: this.config.capabilities.pgSubscriptions,
				webSocket: true,
			});
		}

		serverLogger.info('🚀 Express服务器创建完成', {
			framework: 'Express',
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

		serverLogger.info('🎉 Express GraphQL服务器启动成功!', {
			port: this.config.graphqlPort,
			framework: 'Express',
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
		console.log('🔗 GraphQL: ' + clientConfig.graphqlEndpoint);
		console.log('📡 WebSocket: ' + clientConfig.subscriptionEndpoint);
		console.log('🌟'.repeat(30) + '\n');
	}

	// 获取订阅状态
	private getSubscriptionStatus() {
		return {
			enabled: this.config.capabilities.pgSubscriptions,
			method: 'pg-subscriptions',
			config: subscriptionConfig.generateClientConfig(),
		};
	}

	// 快速关闭
	async quickShutdown(): Promise<void> {
		systemLogger.info('🛑 开始快速关闭Express服务器...');

		if (this.httpServer) {
			this.httpServer.close();
			systemLogger.info('✅ HTTP服务器已关闭');
		}

		systemLogger.info('🎯 Express服务器快速关闭完成');
	}

	// 优雅关闭
	async gracefulShutdown(pgPool: Pool): Promise<void> {
		systemLogger.info('🛑 开始优雅关闭Express服务器...');

		const shutdownPromises: Promise<void>[] = [];

		// 关闭HTTP服务器
		if (this.httpServer) {
			shutdownPromises.push(
				new Promise(resolve => {
					this.httpServer!.close(() => {
						systemLogger.info('✅ HTTP服务器已关闭');
						resolve();
					});
				})
			);
		}

		// 关闭数据库连接池
		shutdownPromises.push(
			pgPool.end().then(() => {
				systemLogger.info('✅ 数据库连接池已关闭');
			})
		);

		try {
			await Promise.all(shutdownPromises);
			systemLogger.info('🎯 Express服务器优雅关闭完成');
		} catch (error) {
			systemLogger.error('❌ 关闭过程中出现错误', error);
			throw error;
		}
	}
}
