import { WebSocketServer, WebSocket } from 'ws';
import { Pool, PoolClient } from 'pg';
import { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';
import {
	wsLogger,
	dbLogger,
	systemLogger,
	logWebSocketEvent,
	logDatabaseOperation,
} from './logger';

interface ClientSubscription {
	tables: Set<string>;
	channels: Set<string>;
}

interface NotificationMessage {
	type: 'store_change' | 'connection' | 'error' | 'pong';
	channel?: string;
	data?: any;
	message?: string;
}

export class RealtimeSubscriptionServer {
	private wss: WebSocketServer;
	private pgPool: Pool;
	private pgClient: PoolClient | null = null;
	private clients: Map<WebSocket, ClientSubscription> = new Map();
	private isListening = false;
	private tableNames: string[];

	constructor(port: number, dbUrl: string, tableNames: string[] = []) {
		this.tableNames = tableNames;
		this.pgPool = new Pool({
			connectionString: dbUrl,
			// 保持连接活跃
			keepAlive: true,
			keepAliveInitialDelayMillis: 10000,
		});

		this.wss = new WebSocketServer({
			port,
			perMessageDeflate: false,
		});

		wsLogger.info('🔥 实时订阅服务器启动', {
			port,
			perMessageDeflate: false,
			tablesCount: tableNames.length,
		});

		this.setupWebSocketHandlers();
		this.setupPostgreSQLListener();
	}

	private async setupPostgreSQLListener() {
		try {
			// 创建专用的PostgreSQL连接用于监听
			this.pgClient = await this.pgPool.connect();

			// 动态生成监听通道
			const channels = ['store:all']; // 通用通道

			// 为每个store表生成专用通道
			this.tableNames
				.filter(name => name.startsWith('store_'))
				.forEach(tableName => {
					channels.push(`table:${tableName}:change`);
				});

			for (const channel of channels) {
				await this.pgClient.query(`LISTEN "${channel}"`);
				dbLogger.info('👂 监听通道', { channel });
			}

			// 设置通知处理器
			this.pgClient.on('notification', msg => {
				try {
					dbLogger.info('📡 收到数据库通知', {
						channel: msg.channel,
						payloadLength: msg.payload?.length || 0,
					});

					let data;
					try {
						data = JSON.parse(msg.payload || '{}');
					} catch (e) {
						data = { raw: msg.payload };
						dbLogger.warn('通知payload解析失败，使用原始数据', {
							payload: msg.payload,
						});
					}

					// 修改数据中的表名，去掉store_前缀
					if (data.table && data.table.startsWith('store_')) {
						data.table = data.table.replace('store_', '');
					}

					// 广播给所有相关的客户端
					this.broadcast({
						type: 'store_change',
						channel: msg.channel,
						data: data,
					});
				} catch (error) {
					dbLogger.error('处理通知时出错', error, {
						channel: msg.channel,
						payload: msg.payload,
					});
				}
			});

			// 处理连接错误
			this.pgClient.on('error', err => {
				dbLogger.error('PostgreSQL 连接错误', err);
				this.reconnectPostgreSQL();
			});

			this.isListening = true;
			dbLogger.info('✅ PostgreSQL 通知监听器设置完成', {
				channelsCount: channels.length,
				channels: channels,
			});
		} catch (error) {
			dbLogger.error('设置PostgreSQL监听器失败', error);
			// 5秒后重试
			setTimeout(() => this.setupPostgreSQLListener(), 5000);
		}
	}

	private async reconnectPostgreSQL() {
		dbLogger.info('🔄 重新连接PostgreSQL...');
		this.isListening = false;

		if (this.pgClient) {
			try {
				this.pgClient.release();
			} catch (e) {
				// 忽略释放错误
			}
			this.pgClient = null;
		}

		// 等待一秒后重新连接
		setTimeout(() => this.setupPostgreSQLListener(), 1000);
	}

	private setupWebSocketHandlers() {
		this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
			const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
			logWebSocketEvent('新的WebSocket连接', this.clients.size + 1, {
				clientId,
			});

			// 初始化客户端订阅信息
			this.clients.set(ws, {
				tables: new Set(),
				channels: new Set(),
			});

			// 发送连接确认
			this.sendToClient(ws, {
				type: 'connection',
				message: '实时订阅服务已连接',
			});

			// 处理客户端消息
			ws.on('message', (data: Buffer) => {
				try {
					const message = JSON.parse(data.toString());
					this.handleClientMessage(ws, message, clientId);
				} catch (error) {
					wsLogger.error('解析客户端消息失败', error, { clientId });
					this.sendToClient(ws, {
						type: 'error',
						message: '消息格式错误',
					});
				}
			});

			// 处理连接关闭
			ws.on('close', () => {
				logWebSocketEvent('WebSocket连接关闭', this.clients.size - 1, {
					clientId,
				});
				this.clients.delete(ws);
			});

			// 处理错误
			ws.on('error', error => {
				wsLogger.error('WebSocket错误', error, { clientId });
				this.clients.delete(ws);
			});
		});
	}

	private handleClientMessage(ws: WebSocket, message: any, clientId: string) {
		const clientSub = this.clients.get(ws);
		if (!clientSub) return;

		switch (message.type) {
			case 'subscribe':
				if (message.table) {
					clientSub.tables.add(message.table);
					wsLogger.info('客户端订阅表', {
						clientId,
						table: message.table,
						totalTables: clientSub.tables.size,
					});
				}
				if (message.channel) {
					clientSub.channels.add(message.channel);
					wsLogger.info('客户端订阅通道', {
						clientId,
						channel: message.channel,
						totalChannels: clientSub.channels.size,
					});
				}
				break;

			case 'unsubscribe':
				if (message.table) {
					clientSub.tables.delete(message.table);
					wsLogger.info('客户端取消订阅表', {
						clientId,
						table: message.table,
						totalTables: clientSub.tables.size,
					});
				}
				if (message.channel) {
					clientSub.channels.delete(message.channel);
					wsLogger.info('客户端取消订阅通道', {
						clientId,
						channel: message.channel,
						totalChannels: clientSub.channels.size,
					});
				}
				break;

			case 'ping':
				this.sendToClient(ws, { type: 'pong' });
				wsLogger.debug('响应ping', { clientId });
				break;

			default:
				wsLogger.warn('未知消息类型', {
					type: message.type,
					clientId,
				});
		}
	}

	private sendToClient(ws: WebSocket, message: NotificationMessage) {
		if (ws.readyState === WebSocket.OPEN) {
			try {
				ws.send(JSON.stringify(message));
			} catch (error) {
				wsLogger.error('发送消息给客户端失败', error);
			}
		}
	}

	private broadcast(message: NotificationMessage) {
		const clientCount = this.clients.size;
		logWebSocketEvent('广播消息', clientCount, {
			messageType: message.type,
			channel: message.channel,
		});

		let sentCount = 0;
		this.clients.forEach((subscription, ws) => {
			let shouldSend = false;

			// 检查是否应该发送这个消息
			if (message.channel) {
				// 检查通道订阅
				if (subscription.channels.has(message.channel)) {
					shouldSend = true;
				}

				// 检查表订阅
				if (message.data?.table) {
					// 检查客户端是否订阅了这个表（不带前缀的名称）
					if (subscription.tables.has(message.data.table)) {
						shouldSend = true;
					}
					// 兼容旧的前缀形式
					const prefixedTableName = `store_${message.data.table}`;
					if (subscription.tables.has(prefixedTableName)) {
						shouldSend = true;
					}
				}

				// 如果没有特定订阅，发送所有store相关的消息
				if (
					subscription.tables.size === 0 &&
					subscription.channels.size === 0
				) {
					if (
						message.channel === 'store:all' ||
						(message.channel?.startsWith('table:') &&
							this.tableNames.some(
								tableName =>
									tableName.startsWith('store_') &&
									message.channel?.includes(tableName)
							))
					) {
						shouldSend = true;
					}
				}
			}

			if (shouldSend) {
				this.sendToClient(ws, message);
				sentCount++;
			}
		});

		wsLogger.debug('广播完成', {
			totalClients: clientCount,
			sentToClients: sentCount,
		});
	}

	// 手动发送测试消息
	public sendTestMessage(table?: string) {
		// 如果没有指定表，从可用的store表中选择第一个
		const defaultTable =
			table ||
			this.tableNames.find(name => name.startsWith('store_')) ||
			'store_test';

		const testMessage: NotificationMessage = {
			type: 'store_change',
			channel: `table:${defaultTable}:change`,
			data: {
				event: 'test',
				table: defaultTable,
				timestamp: new Date().toISOString(),
				data: { test: true, message: '这是一个测试消息' },
			},
		};

		this.broadcast(testMessage);
		wsLogger.info('📤 发送测试消息', { table: defaultTable });
	}

	// 获取状态信息
	public getStatus() {
		const status = {
			isListening: this.isListening,
			clientCount: this.clients.size,
			pgConnected: this.pgClient !== null,
		};

		systemLogger.debug('获取实时服务器状态', status);
		return status;
	}

	// 优雅关闭
	public async close() {
		systemLogger.info('🛑 关闭实时订阅服务器...', {
			clientCount: this.clients.size,
		});

		// 关闭所有WebSocket连接
		this.wss.clients.forEach(ws => {
			ws.close();
		});

		// 关闭WebSocket服务器
		this.wss.close();

		// 释放PostgreSQL连接
		if (this.pgClient) {
			try {
				this.pgClient.release();
				dbLogger.info('PostgreSQL连接已释放');
			} catch (e) {
				// 忽略释放错误
			}
		}

		// 关闭连接池
		await this.pgPool.end();
		dbLogger.info('数据库连接池已关闭');

		systemLogger.info('✅ 实时订阅服务器已关闭');
	}
}
