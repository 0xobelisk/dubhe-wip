"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerManager = void 0;
const http_1 = require("http");
const pg_1 = require("pg");
const realtime_server_1 = require("../realtime-server");
const welcome_page_1 = require("./welcome-page");
const postgraphile_config_1 = require("./postgraphile-config");
class ServerManager {
    config;
    realtimeServer = null;
    constructor(config) {
        this.config = config;
    }
    // 创建HTTP服务器
    createHttpServer(postgraphileMiddleware, allTables, welcomeConfig, postgraphileConfig) {
        return (0, http_1.createServer)(async (req, res) => {
            const url = req.url || '';
            try {
                // 根路径返回欢迎页面
                if (url === '/' || url === '') {
                    res.writeHead(200, {
                        'Content-Type': 'text/html; charset=utf-8',
                    });
                    res.end((0, welcome_page_1.createWelcomePage)(allTables, welcomeConfig));
                    return;
                }
                // 处理增强版 GraphQL Playground
                if (url.startsWith('/playground')) {
                    res.writeHead(200, {
                        'Content-Type': 'text/html; charset=utf-8',
                    });
                    res.end((0, postgraphile_config_1.createPlaygroundHtml)(postgraphileConfig));
                    return;
                }
                // GraphQL 请求交给 PostGraphile 处理
                if (url.startsWith(this.config.graphqlEndpoint)) {
                    return postgraphileMiddleware(req, res);
                }
                // 如果访问旧的 /graphiql 路径，重定向到新的 /playground
                if (url.startsWith('/graphiql')) {
                    res.writeHead(301, {
                        Location: '/playground',
                    });
                    res.end();
                    return;
                }
                // 404 处理
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            }
            catch (error) {
                console.error('❌ 请求处理错误:', error);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
        });
    }
    // 启动实时订阅服务器
    async startRealtimeServer() {
        try {
            const realtimePort = parseInt(this.config.realtimePort || '4001');
            this.realtimeServer = new realtime_server_1.RealtimeSubscriptionServer(realtimePort, this.config.databaseUrl);
            console.log('');
            console.log('🔥 实时推送服务已启动！');
            console.log(`📡 WebSocket实时推送: ws://localhost:${realtimePort}`);
            console.log('💡 客户端可以连接到此端口接收实时数据更新');
        }
        catch (error) {
            console.error('❌ 启动实时订阅服务器失败:', error);
            console.log('⚠️  将继续运行GraphQL服务器，但没有实时推送功能');
        }
    }
    // 启动数据库变更监听
    async startDatabaseListener(databaseUrl) {
        if (this.config.enableSubscriptions !== 'true') {
            return;
        }
        try {
            const notifyClient = new pg_1.Pool({
                connectionString: databaseUrl,
            });
            const client = await notifyClient.connect();
            // 监听表结构变更
            await client.query('LISTEN table_structure_changes');
            client.on('notification', async (msg) => {
                if (msg.channel === 'table_structure_changes') {
                    console.log('📡 检测到数据库结构变更，建议重启服务器以更新 GraphQL schema');
                }
            });
            console.log('👂 数据库结构变更监听已启动');
        }
        catch (error) {
            console.log('⚠️  数据库变更监听启动失败，将继续运行（这不影响基本功能）');
            console.log('   错误详情:', error);
        }
    }
    // 优雅关闭
    async gracefulShutdown(httpServer, pgPool) {
        console.log('\n⏹️  正在关闭服务器...');
        // 关闭实时订阅服务器
        if (this.realtimeServer) {
            await this.realtimeServer.close();
        }
        await pgPool.end();
        httpServer.close();
        process.exit(0);
    }
    // 输出服务器启动信息
    logServerInfo(allTables, welcomeConfig) {
        console.log('🚀 Sui Indexer GraphQL 服务器启动成功！');
        console.log('');
        console.log(`📍 服务器地址: http://localhost:${this.config.port}`);
        console.log(`📊 GraphQL API: http://localhost:${this.config.port}${this.config.graphqlEndpoint}`);
        console.log(`🎮 增强版 GraphQL Playground: http://localhost:${this.config.port}/playground`);
        console.log(`   ✨ 现代化界面 + Schema Explorer + 代码导出`);
        console.log(`   📝 旧路径 /graphiql 会自动重定向到 /playground`);
        if (this.config.enableSubscriptions === 'true') {
            console.log(`📡 WebSocket 订阅: ws://localhost:${this.config.port}${this.config.graphqlEndpoint}`);
        }
        console.log('');
        console.log(`📝 环境: ${welcomeConfig.nodeEnv}`);
        console.log(`🗄️  数据库模式: ${welcomeConfig.schema}`);
        console.log(`📊 动态表数量: ${allTables.length}`);
        console.log(`🔒 CORS: ${welcomeConfig.enableCors === 'true' ? '启用' : '禁用'}`);
        console.log(`📡 订阅: ${this.config.enableSubscriptions === 'true' ? '启用' : '禁用'}`);
        console.log('');
        console.log('💡 访问根路径查看详细信息和使用指南');
        console.log('按 Ctrl+C 停止服务器');
    }
}
exports.ServerManager = ServerManager;
//# sourceMappingURL=server-manager.js.map