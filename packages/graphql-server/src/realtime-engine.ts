import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Pool, PoolClient } from 'pg';
import { EventEmitter } from 'events';
import { systemLogger, wsLogger, dbLogger } from './utils/logger';

// 实时数据类型定义
export interface RealtimeMessage {
	type:
		| 'update'
		| 'delete'
		| 'insert'
		| 'batch'
		| 'ping'
		| 'pong'
		| 'connection'
		| 'subscription_confirmed'
		| 'initial_data'
		| 'error';
	table?: string;
	id?: string | number;
	data?: any;
	filter?: Record<string, any>;
	timestamp?: string;
}

export interface ClientSubscription {
	// Live Queries 订阅
	liveQueries: Set<string>;
	// WebSocket 原生订阅
	nativeSubscriptions: Map<
		string,
		{
			table: string;
			filter?: Record<string, any>;
			fields?: string[];
		}
	>;
	// 客户端元信息
	clientId: string;
	userId?: string;
	tags: Set<string>;
}

export interface RealtimeConfig {
	port: number;
	dbUrl: string;
	enableLiveQueries: boolean;
	enableNativeWebSocket: boolean;
	tableNames: string[];
	maxConnections?: number;
	heartbeatInterval?: number;
}

// 统一的实时数据引擎
export class UnifiedRealtimeEngine extends EventEmitter {
	private wss: WebSocketServer;
	private pgPool: Pool;
	private pgClient: PoolClient | null = null;
	private clients: Map<WebSocket, ClientSubscription> = new Map();
	private config: RealtimeConfig;
	private isListening = false;
	private heartbeatInterval: NodeJS.Timeout | null = null;

	constructor(config: RealtimeConfig) {
		super();
		this.config = config;

		// 创建PostgreSQL连接池
		this.pgPool = new Pool({
			connectionString: config.dbUrl,
			keepAlive: true,
			keepAliveInitialDelayMillis: 10000,
		});

		// 创建WebSocket服务器
		this.wss = new WebSocketServer({
			port: config.port,
			perMessageDeflate: true, // 启用压缩
			maxPayload: 16 * 1024, // 16KB max payload
		});

		systemLogger.info('🚀 统一实时引擎启动', {
			port: config.port,
			enableLiveQueries: config.enableLiveQueries,
			enableNativeWebSocket: config.enableNativeWebSocket,
			tablesCount: config.tableNames.length,
		});

		this.setupWebSocketHandlers();
		this.setupDatabaseListener();
		this.startHeartbeat();
	}

	// 设置WebSocket连接处理
	private setupWebSocketHandlers() {
		this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
			const clientId = `${req.socket.remoteAddress}:${
				req.socket.remotePort
			}_${Date.now()}`;

			// 初始化客户端订阅信息
			this.clients.set(ws, {
				liveQueries: new Set(),
				nativeSubscriptions: new Map(),
				clientId,
				tags: new Set(),
			});

			wsLogger.info('新客户端连接', {
				clientId,
				totalClients: this.clients.size,
			});

			// 发送连接确认和引擎能力
			this.sendToClient(ws, {
				type: 'connection',
				data: {
					clientId,
					capabilities: {
						liveQueries: this.config.enableLiveQueries,
						nativeWebSocket: this.config.enableNativeWebSocket,
						availableTables: this.config.tableNames,
					},
				},
			});

			// 处理客户端消息
			ws.on('message', (data: Buffer) => {
				try {
					const message = JSON.parse(
						data.toString()
					) as RealtimeMessage & {
						action?: 'subscribe' | 'unsubscribe' | 'ping';
						subscriptionType?: 'live' | 'native';
						queryId?: string;
					};

					this.handleClientMessage(ws, message, clientId);
				} catch (error) {
					wsLogger.error('解析客户端消息失败', error, { clientId });
					this.sendError(ws, '消息格式错误');
				}
			});

			// 处理连接关闭
			ws.on('close', () => {
				wsLogger.info('客户端断开连接', {
					clientId,
					remainingClients: this.clients.size - 1,
				});
				this.clients.delete(ws);
			});

			// 处理连接错误
			ws.on('error', error => {
				wsLogger.error('WebSocket连接错误', error, { clientId });
				this.clients.delete(ws);
			});
		});
	}

	// 处理客户端消息
	private handleClientMessage(ws: WebSocket, message: any, clientId: string) {
		const subscription = this.clients.get(ws);
		if (!subscription) return;

		switch (message.action) {
			case 'subscribe':
				this.handleSubscription(ws, message, subscription);
				break;

			case 'unsubscribe':
				this.handleUnsubscription(ws, message, subscription);
				break;

			case 'ping':
				this.sendToClient(ws, {
					type: 'pong',
					timestamp: new Date().toISOString(),
				});
				break;

			default:
				wsLogger.warn('未知的客户端动作', {
					action: message.action,
					clientId,
				});
		}
	}

	// 处理订阅请求
	private handleSubscription(
		ws: WebSocket,
		message: any,
		subscription: ClientSubscription
	) {
		const { subscriptionType, table, filter, fields, queryId } = message;

		if (subscriptionType === 'live' && this.config.enableLiveQueries) {
			// Live Queries订阅 - 由PostGraphile处理
			if (queryId) {
				subscription.liveQueries.add(queryId);
				wsLogger.info('Live Query订阅已添加', {
					clientId: subscription.clientId,
					queryId,
					table,
				});
			}
		} else if (
			subscriptionType === 'native' &&
			this.config.enableNativeWebSocket
		) {
			// 原生WebSocket订阅
			if (table && this.config.tableNames.includes(table)) {
				const subscriptionKey = `${table}_${JSON.stringify(
					filter || {}
				)}`;
				subscription.nativeSubscriptions.set(subscriptionKey, {
					table,
					filter,
					fields,
				});

				wsLogger.info('原生WebSocket订阅已添加', {
					clientId: subscription.clientId,
					table,
					filter,
					subscriptionKey,
				});

				// 发送当前数据（可选）
				this.sendCurrentData(ws, table, filter, fields);
			}
		}

		// 发送订阅确认
		this.sendToClient(ws, {
			type: 'subscription_confirmed',
			data: {
				subscriptionType,
				table,
				filter,
				queryId,
			},
		});
	}

	// 处理取消订阅
	private handleUnsubscription(
		ws: WebSocket,
		message: any,
		subscription: ClientSubscription
	) {
		const { subscriptionType, table, filter, queryId } = message;

		if (subscriptionType === 'live' && queryId) {
			subscription.liveQueries.delete(queryId);
		} else if (subscriptionType === 'native' && table) {
			const subscriptionKey = `${table}_${JSON.stringify(filter || {})}`;
			subscription.nativeSubscriptions.delete(subscriptionKey);
		}

		wsLogger.info('订阅已取消', {
			clientId: subscription.clientId,
			subscriptionType,
			table,
			queryId,
		});
	}

	// 设置数据库变更监听
	private async setupDatabaseListener() {
		if (!this.config.enableNativeWebSocket) {
			dbLogger.info('原生WebSocket已禁用，跳过数据库监听器设置');
			return;
		}

		try {
			this.pgClient = await this.pgPool.connect();

			// 监听所有相关表的变更
			const channels = this.config.tableNames.map(
				table => `table_change_${table}`
			);

			for (const channel of channels) {
				await this.pgClient.query(`LISTEN "${channel}"`);
				dbLogger.info('开始监听数据库通道', { channel });
			}

			// 设置通知处理器
			this.pgClient.on('notification', msg => {
				this.handleDatabaseNotification(msg);
			});

			this.pgClient.on('error', err => {
				dbLogger.error('PostgreSQL连接错误', err);
				this.reconnectDatabase();
			});

			this.isListening = true;
			dbLogger.info('✅ 数据库变更监听器设置完成');
		} catch (error) {
			dbLogger.error('设置数据库监听器失败', error);
			setTimeout(() => this.setupDatabaseListener(), 5000);
		}
	}

	// 处理数据库通知
	private handleDatabaseNotification(msg: any) {
		try {
			const { channel, payload } = msg;
			const data = JSON.parse(payload || '{}');

			// 提取表名
			const tableName = channel.replace('table_change_', '');

			dbLogger.debug('收到数据库变更通知', {
				table: tableName,
				operation: data.operation,
				id: data.id,
			});

			// 广播给订阅该表的客户端
			this.broadcastNativeUpdate({
				type: data.operation.toLowerCase(),
				table: tableName,
				id: data.id,
				data: data.new_data || data.data,
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			dbLogger.error('处理数据库通知失败', error);
		}
	}

	// 广播原生WebSocket更新
	private broadcastNativeUpdate(message: RealtimeMessage) {
		const { table, filter: messageFilter } = message;
		let sentCount = 0;

		this.clients.forEach((subscription, ws) => {
			// 检查是否有匹配的原生订阅
			subscription.nativeSubscriptions.forEach((sub, key) => {
				if (sub.table === table) {
					// 检查过滤条件是否匹配
					if (this.matchesFilter(message.data, sub.filter)) {
						this.sendToClient(ws, message);
						sentCount++;
					}
				}
			});
		});

		wsLogger.debug('原生WebSocket更新已广播', {
			table,
			sentToClients: sentCount,
			totalClients: this.clients.size,
		});
	}

	// 检查数据是否匹配过滤条件
	private matchesFilter(data: any, filter?: Record<string, any>): boolean {
		if (!filter || !data) return true;

		return Object.entries(filter).every(([key, value]) => {
			if (typeof value === 'object' && value !== null) {
				// 支持复杂过滤条件
				if (value.equalTo !== undefined) {
					return data[key] === value.equalTo;
				}
				if (value.in !== undefined) {
					return (
						Array.isArray(value.in) && value.in.includes(data[key])
					);
				}
				if (value.notEqualTo !== undefined) {
					return data[key] !== value.notEqualTo;
				}
			}
			return data[key] === value;
		});
	}

	// 发送当前数据给新订阅的客户端
	private async sendCurrentData(
		ws: WebSocket,
		table: string,
		filter?: Record<string, any>,
		fields?: string[]
	) {
		try {
			// 构建查询
			let query = `SELECT * FROM ${table}`;
			const params: any[] = [];

			if (filter) {
				const conditions = Object.entries(filter).map(
					([key, value], index) => {
						params.push(value);
						return `${key} = $${index + 1}`;
					}
				);

				if (conditions.length > 0) {
					query += ` WHERE ${conditions.join(' AND ')}`;
				}
			}

			query += ' LIMIT 100'; // 限制初始数据量

			const conn = await this.pgPool.connect();
			const result = await conn.query(query, params);
			conn.release();

			// 发送当前数据
			this.sendToClient(ws, {
				type: 'initial_data',
				table,
				data: result.rows,
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			dbLogger.error('获取当前数据失败', error, { table, filter });
		}
	}

	// 重连数据库
	private async reconnectDatabase() {
		this.isListening = false;
		if (this.pgClient) {
			try {
				this.pgClient.release();
			} catch (e) {
				// 忽略释放错误
			}
			this.pgClient = null;
		}

		setTimeout(() => this.setupDatabaseListener(), 2000);
	}

	// 发送消息给客户端
	private sendToClient(ws: WebSocket, message: RealtimeMessage) {
		if (ws.readyState === WebSocket.OPEN) {
			try {
				ws.send(JSON.stringify(message));
			} catch (error) {
				wsLogger.error('发送消息给客户端失败', error);
			}
		}
	}

	// 发送错误消息
	private sendError(ws: WebSocket, message: string) {
		this.sendToClient(ws, {
			type: 'error',
			data: { message },
			timestamp: new Date().toISOString(),
		});
	}

	// 启动心跳检测
	private startHeartbeat() {
		const interval = this.config.heartbeatInterval || 30000; // 30秒

		this.heartbeatInterval = setInterval(() => {
			this.clients.forEach((subscription, ws) => {
				if (ws.readyState === WebSocket.OPEN) {
					this.sendToClient(ws, {
						type: 'ping',
						timestamp: new Date().toISOString(),
					});
				}
			});
		}, interval);
	}

	// 手动触发测试更新
	public triggerTestUpdate(table: string, data: any) {
		this.broadcastNativeUpdate({
			type: 'update',
			table,
			id: 'test',
			data,
			timestamp: new Date().toISOString(),
		});

		systemLogger.info('测试更新已触发', { table, data });
	}

	// 获取引擎状态
	public getStatus() {
		return {
			isListening: this.isListening,
			clientCount: this.clients.size,
			pgConnected: this.pgClient !== null,
			capabilities: {
				liveQueries: this.config.enableLiveQueries,
				nativeWebSocket: this.config.enableNativeWebSocket,
			},
			subscriptions: {
				live: Array.from(this.clients.values()).reduce(
					(acc, sub) => acc + sub.liveQueries.size,
					0
				),
				native: Array.from(this.clients.values()).reduce(
					(acc, sub) => acc + sub.nativeSubscriptions.size,
					0
				),
			},
		};
	}

	// 优雅关闭
	public async shutdown() {
		systemLogger.info('🛑 开始关闭统一实时引擎...');

		// 清理心跳
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
		}

		// 关闭所有WebSocket连接
		this.wss.clients.forEach(ws => {
			ws.close(1000, '服务器关闭');
		});

		// 关闭WebSocket服务器
		this.wss.close();

		// 释放数据库连接
		if (this.pgClient) {
			try {
				this.pgClient.release();
			} catch (e) {
				// 忽略
			}
		}

		await this.pgPool.end();

		systemLogger.info('✅ 统一实时引擎已关闭');
	}
}
