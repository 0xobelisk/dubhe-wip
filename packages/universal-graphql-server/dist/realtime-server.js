"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeSubscriptionServer = void 0;
const ws_1 = require("ws");
const pg_1 = require("pg");
class RealtimeSubscriptionServer {
    wss;
    pgPool;
    pgClient = null;
    clients = new Map();
    isListening = false;
    constructor(port, dbUrl) {
        this.pgPool = new pg_1.Pool({
            connectionString: dbUrl,
            // 保持连接活跃
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
        });
        this.wss = new ws_1.WebSocketServer({
            port,
            perMessageDeflate: false,
        });
        console.log(`🔥 实时订阅服务器启动在端口 ${port}`);
        this.setupWebSocketHandlers();
        this.setupPostgreSQLListener();
    }
    async setupPostgreSQLListener() {
        try {
            // 创建专用的PostgreSQL连接用于监听
            this.pgClient = await this.pgPool.connect();
            // 监听所有相关通道
            const channels = [
                'store:all',
                'table:store_encounter:change',
                'table:store_accounts:change',
                'table:store_position:change',
                'table:store_map_config:change',
            ];
            for (const channel of channels) {
                await this.pgClient.query(`LISTEN "${channel}"`);
                console.log(`👂 监听通道: ${channel}`);
            }
            // 设置通知处理器
            this.pgClient.on('notification', msg => {
                try {
                    console.log(`📡 收到数据库通知: ${msg.channel} - ${msg.payload}`);
                    let data;
                    try {
                        data = JSON.parse(msg.payload || '{}');
                    }
                    catch (e) {
                        data = { raw: msg.payload };
                    }
                    // 广播给所有相关的客户端
                    this.broadcast({
                        type: 'store_change',
                        channel: msg.channel,
                        data: data,
                    });
                }
                catch (error) {
                    console.error('❌ 处理通知时出错:', error);
                }
            });
            // 处理连接错误
            this.pgClient.on('error', err => {
                console.error('❌ PostgreSQL 连接错误:', err);
                this.reconnectPostgreSQL();
            });
            this.isListening = true;
            console.log('✅ PostgreSQL 通知监听器设置完成');
        }
        catch (error) {
            console.error('❌ 设置PostgreSQL监听器失败:', error);
            // 5秒后重试
            setTimeout(() => this.setupPostgreSQLListener(), 5000);
        }
    }
    async reconnectPostgreSQL() {
        console.log('🔄 重新连接PostgreSQL...');
        this.isListening = false;
        if (this.pgClient) {
            try {
                this.pgClient.release();
            }
            catch (e) {
                // 忽略释放错误
            }
            this.pgClient = null;
        }
        // 等待一秒后重新连接
        setTimeout(() => this.setupPostgreSQLListener(), 1000);
    }
    setupWebSocketHandlers() {
        this.wss.on('connection', (ws, req) => {
            console.log('🔗 新的WebSocket连接');
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
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleClientMessage(ws, message);
                }
                catch (error) {
                    console.error('❌ 解析客户端消息失败:', error);
                    this.sendToClient(ws, {
                        type: 'error',
                        message: '消息格式错误',
                    });
                }
            });
            // 处理连接关闭
            ws.on('close', () => {
                console.log('🔌 WebSocket连接关闭');
                this.clients.delete(ws);
            });
            // 处理错误
            ws.on('error', error => {
                console.error('❌ WebSocket错误:', error);
                this.clients.delete(ws);
            });
        });
    }
    handleClientMessage(ws, message) {
        const clientSub = this.clients.get(ws);
        if (!clientSub)
            return;
        switch (message.type) {
            case 'subscribe':
                if (message.table) {
                    clientSub.tables.add(message.table);
                    console.log(`📝 客户端订阅表: ${message.table}`);
                }
                if (message.channel) {
                    clientSub.channels.add(message.channel);
                    console.log(`📝 客户端订阅通道: ${message.channel}`);
                }
                break;
            case 'unsubscribe':
                if (message.table) {
                    clientSub.tables.delete(message.table);
                    console.log(`🗑️  客户端取消订阅表: ${message.table}`);
                }
                if (message.channel) {
                    clientSub.channels.delete(message.channel);
                    console.log(`🗑️  客户端取消订阅通道: ${message.channel}`);
                }
                break;
            case 'ping':
                this.sendToClient(ws, { type: 'pong' });
                break;
            default:
                console.log('❓ 未知消息类型:', message.type);
        }
    }
    sendToClient(ws, message) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(message));
            }
            catch (error) {
                console.error('❌ 发送消息给客户端失败:', error);
            }
        }
    }
    broadcast(message) {
        console.log(`📢 广播消息给 ${this.clients.size} 个客户端`);
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
                    const tableName = message.data.table.replace('store_', '');
                    if (subscription.tables.has(tableName) ||
                        subscription.tables.has(message.data.table)) {
                        shouldSend = true;
                    }
                }
                // 如果没有特定订阅，发送所有store相关的消息
                if (subscription.tables.size === 0 &&
                    subscription.channels.size === 0) {
                    if (message.channel.startsWith('store:') ||
                        message.channel.startsWith('table:store_')) {
                        shouldSend = true;
                    }
                }
            }
            if (shouldSend) {
                this.sendToClient(ws, message);
            }
        });
    }
    // 手动发送测试消息
    sendTestMessage(table = 'store_encounter') {
        const testMessage = {
            type: 'store_change',
            channel: `table:${table}:change`,
            data: {
                event: 'test',
                table: table,
                timestamp: new Date().toISOString(),
                data: { test: true, message: '这是一个测试消息' },
            },
        };
        this.broadcast(testMessage);
        console.log('📤 发送测试消息');
    }
    // 获取状态信息
    getStatus() {
        return {
            isListening: this.isListening,
            clientCount: this.clients.size,
            pgConnected: this.pgClient !== null,
        };
    }
    // 优雅关闭
    async close() {
        console.log('🛑 关闭实时订阅服务器...');
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
            }
            catch (e) {
                // 忽略释放错误
            }
        }
        // 关闭连接池
        await this.pgPool.end();
        console.log('✅ 实时订阅服务器已关闭');
    }
}
exports.RealtimeSubscriptionServer = RealtimeSubscriptionServer;
//# sourceMappingURL=realtime-server.js.map