const { createClient } = require('graphql-ws');
const WebSocket = require('ws');

// GraphQL Server 的 WebSocket 端点
const GRAPHQL_WS_URL = 'ws://localhost:4000/graphql';

// 创建 WebSocket 客户端
const client = createClient({
    url: GRAPHQL_WS_URL,
    webSocketImpl: WebSocket,
    connectionParams: {
        // 如果需要认证，可以在这里添加
        // authToken: 'your-auth-token',
    },
    on: {
        connected: () => console.log('✅ WebSocket 连接成功'),
        closed: () => console.log('❌ WebSocket 连接关闭'),
        error: (error) => console.error('❌ WebSocket 错误:', error),
    },
});

// 测试订阅所有 store 表的变更
async function testAllStoresSubscription() {
    console.log('\n📡 订阅所有 store 表的变更...');
    
    const unsubscribe = client.subscribe(
        {
            query: `
                subscription AllStoresChanged {
                    allStoresChanged {
                        event
                        table
                        timestamp
                        data
                        id
                    }
                }
            `,
        },
        {
            next: (data) => {
                console.log('\n📨 收到 store 变更通知:');
                console.log(JSON.stringify(data, null, 2));
            },
            error: (err) => {
                console.error('❌ 订阅错误:', err);
            },
            complete: () => {
                console.log('✅ 订阅完成');
            },
        }
    );

    // 返回取消订阅函数
    return unsubscribe;
}

// 测试特定表的订阅
async function testTableSubscription(tableName) {
    console.log(`\n📡 订阅表 ${tableName} 的变更...`);
    
    const unsubscribe = client.subscribe(
        {
            query: `
                subscription TableChanged($tableName: String!) {
                    tableChanged(tableName: $tableName) {
                        event
                        table
                        schema
                        timestamp
                        data
                        id
                    }
                }
            `,
            variables: {
                tableName: tableName,
            },
        },
        {
            next: (data) => {
                console.log(`\n📨 收到表 ${tableName} 的变更通知:`);
                console.log(JSON.stringify(data, null, 2));
            },
            error: (err) => {
                console.error('❌ 订阅错误:', err);
            },
            complete: () => {
                console.log('✅ 订阅完成');
            },
        }
    );

    return unsubscribe;
}

// 手动发送测试通知（使用 pg 客户端）
async function sendTestNotification() {
    const { Client } = require('pg');
    const pgClient = new Client({
        connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
    });

    try {
        await pgClient.connect();
        console.log('\n📤 发送测试通知...');

        // 发送到 store:all 频道
        await pgClient.query(`
            SELECT pg_notify('store:all', $1::text)
        `, [JSON.stringify({
            event: 'test',
            table: 'store_test',
            timestamp: new Date().toISOString(),
            data: {
                message: '这是一个测试通知',
                test_id: Math.floor(Math.random() * 1000),
            },
            id: 'test-' + Date.now(),
        })]);

        console.log('✅ 测试通知已发送');
    } catch (error) {
        console.error('❌ 发送通知失败:', error);
    } finally {
        await pgClient.end();
    }
}

// 主测试函数
async function runTests() {
    console.log('🚀 开始测试 GraphQL Subscription...\n');

    // 订阅所有 store 表
    const unsubscribeAll = await testAllStoresSubscription();

    // 订阅特定表（如果需要）
    // const unsubscribeTable = await testTableSubscription('store_user');

    // 等待一秒后发送测试通知
    setTimeout(async () => {
        await sendTestNotification();
    }, 1000);

    // 保持程序运行
    console.log('\n⏳ 等待通知... (按 Ctrl+C 退出)\n');

    // 处理退出信号
    process.on('SIGINT', () => {
        console.log('\n\n🛑 正在关闭...');
        unsubscribeAll();
        // unsubscribeTable();
        client.dispose();
        process.exit(0);
    });
}

// 运行测试
runTests().catch(console.error); 