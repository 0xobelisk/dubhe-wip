#!/usr/bin/env node

/**
 * 全功能订阅系统测试脚本
 * 
 * 测试内容：
 * 1. Live Queries (@live指令) - encounters表
 * 2. PostgreSQL订阅 (listen) - store_encounter主题  
 * 3. 原生WebSocket - encounter表订阅
 * 4. 数据变更触发测试
 */

const { createClient } = require('graphql-ws');
const WebSocket = require('ws');

// 配置
const config = {
    graphqlUrl: 'http://localhost:4000/graphql',
    subscriptionUrl: 'ws://localhost:4000/graphql', 
    nativeWebSocketUrl: 'ws://localhost:4000',
    healthUrl: 'http://localhost:4000/health',
};

class AllSubscriptionsTestSuite {
    constructor() {
        this.results = {
            liveQueries: { status: 'pending', messages: [] },
            pgSubscriptions: { status: 'pending', messages: [] },
            nativeWebSocket: { status: 'pending', messages: [] },
            accountsQuery: { status: 'pending', messages: [] },
            positionsQuery: { status: 'pending', messages: [] },
            encountersQuery: { status: 'pending', messages: [] },
            mapConfigQuery: { status: 'pending', messages: [] },
            accountsUpdated: { status: 'pending', messages: [] },
            positionsUpdated: { status: 'pending', messages: [] },
            encountersUpdated: { status: 'pending', messages: [] },
            mapConfigUpdated: { status: 'pending', messages: [] }
        };
        this.fetch = null;
        this.activeClients = [];
    }

    async init() {
        // 动态导入node-fetch
        const { default: fetch } = await import('node-fetch');
        this.fetch = fetch;
    }

    async runAllTests() {
        console.log('🚀 开始全功能订阅系统测试');
        console.log('📋 测试目标: encounters 表的实时数据变化');
        console.log('='.repeat(60) + '\n');

        await this.init();

        // 获取服务器配置
        const serverConfig = await this.getServerConfig();
        if (!serverConfig) {
            console.log('❌ 无法连接到服务器，请确保服务器已启动');
            return;
        }

        console.log('📡 服务器订阅能力:', serverConfig.capabilities);
        console.log('💡 推荐方法:', serverConfig.recommendedMethod);
        console.log('');

        // 并行启动所有订阅测试
        const testPromises = [];

        if (serverConfig.capabilities.liveQueries) {
            testPromises.push(this.testLiveQueries());
        } else {
            console.log('⚠️  Live Queries未启用 (需要 wal_level=logical)');
        }

        if (serverConfig.capabilities.pgSubscriptions) {
            testPromises.push(this.testPgSubscriptions());
        } else {
            console.log('⚠️  PostgreSQL订阅未启用');
        }

        if (serverConfig.capabilities.nativeWebSocket) {
            testPromises.push(this.testNativeWebSocket());
        } else {
            console.log('⚠️  原生WebSocket未启用');
        }

        // 测试所有4个表的通用订阅语法（基于 PostgreSQL 订阅）
        if (serverConfig.capabilities.pgSubscriptions) {
            testPromises.push(this.testAccountsQuery());
            testPromises.push(this.testPositionsQuery());
            testPromises.push(this.testEncountersQuery());
            testPromises.push(this.testMapConfigQuery());
            testPromises.push(this.testAccountsUpdated());
            testPromises.push(this.testPositionsUpdated());
            testPromises.push(this.testEncountersUpdated());
            testPromises.push(this.testMapConfigUpdated());
        }

        if (testPromises.length === 0) {
            console.log('❌ 没有可用的订阅方法，请检查服务器配置');
            return;
        }

        // 等待所有订阅建立连接
        await Promise.all(testPromises);

        // 等待一段时间观察数据
        console.log('\n⏰ 监听30秒，观察数据变化...');
        console.log('💡 提示: 在另一个终端运行数据插入来触发更新');
        console.log('   例如: curl -X POST http://localhost:4000/test-data');
        
        await this.waitAndObserve(30000);

        // 显示结果
        this.displayResults();

        // 清理连接
        this.cleanup();
    }

    async getServerConfig() {
        try {
            const response = await this.fetch(config.healthUrl);
            const data = await response.json();
            return data.subscriptions.clientConfig;
        } catch (error) {
            return null;
        }
    }

    async testLiveQueries() {
        console.log('🔥 启动 Live Queries 测试...');
        
        const client = createClient({
            url: config.subscriptionUrl,
            webSocketImpl: WebSocket,
        });

        this.activeClients.push(() => client.dispose());

        return new Promise((resolve) => {
            const unsubscribe = client.subscribe(
                {
                    query: `
                        subscription LiveEncounters {
                            encounters @live {
                                nodes {
                                    exists
                                    catchAttempts
                                    monster
                                    nodeId
                                    player
                                }
                                totalCount
                            }
                        }
                    `
                },
                {
                    next: (data) => {
                        const message = `[Live] 收到数据: ${data.data?.encounters?.totalCount || 0} 条encounters`;
                        console.log('  🔥 ' + message);
                        this.results.liveQueries.messages.push({
                            time: new Date().toISOString(),
                            data: data.data?.encounters,
                            message
                        });
                        
                        if (this.results.liveQueries.status === 'pending') {
                            this.results.liveQueries.status = 'connected';
                            console.log('  ✅ Live Queries 连接成功');
                            resolve();
                        }
                    },
                    error: (error) => {
                        console.log('  ❌ Live Queries 错误:', error.message);
                        this.results.liveQueries.status = 'error';
                        this.results.liveQueries.error = error.message;
                        resolve();
                    },
                    complete: () => {
                        console.log('  🔚 Live Queries 连接关闭');
                        resolve();
                    }
                }
            );

            this.activeClients.push(unsubscribe);
        });
    }

    async testPgSubscriptions() {
        console.log('⚡ 启动 PostgreSQL 订阅测试...');
        
        const client = createClient({
            url: config.subscriptionUrl,
            webSocketImpl: WebSocket,
        });

        this.activeClients.push(() => client.dispose());

        return new Promise((resolve) => {
            const unsubscribe = client.subscribe(
                {
                    query: `
                        subscription PgEncounters {
                            listen(topic: "store_encounter") {
                                relatedNodeId
                                relatedNode {
                                    nodeId
                                    ... on Encounter {
                                        exists
                                        catchAttempts
                                        monster
                                        player
                                    }
                                }
                            }
                        }
                    `
                },
                {
                    next: (data) => {
                        const message = `[PG] 收到通知: ${JSON.stringify(data.data?.listen)}`;
                        console.log('  ⚡ ' + message);
                        this.results.pgSubscriptions.messages.push({
                            time: new Date().toISOString(),
                            data: data.data?.listen,
                            message
                        });
                        
                        if (this.results.pgSubscriptions.status === 'pending') {
                            this.results.pgSubscriptions.status = 'connected';
                            console.log('  ✅ PostgreSQL订阅 连接成功');
                            resolve();
                        }
                    },
                    error: (error) => {
                        console.log('  ❌ PostgreSQL订阅 错误:', error.message);
                        this.results.pgSubscriptions.status = 'error';
                        this.results.pgSubscriptions.error = error.message;
                        resolve();
                    },
                    complete: () => {
                        console.log('  🔚 PostgreSQL订阅 连接关闭');
                        resolve();
                    }
                }
            );

            this.activeClients.push(unsubscribe);
        });
    }

    async testNativeWebSocket() {
        console.log('🌐 启动 原生WebSocket 测试...');
        
        return new Promise((resolve) => {
            const ws = new WebSocket(config.nativeWebSocketUrl);
            
            this.activeClients.push(() => ws.close());

            ws.on('open', () => {
                console.log('  ✅ 原生WebSocket 连接成功');
                this.results.nativeWebSocket.status = 'connected';
                
                // 订阅encounter表
                ws.send(JSON.stringify({
                    action: 'subscribe',
                    table: 'encounter',
                    fields: ['exists', 'catchAttempts', 'monster', 'player']
                }));
                
                resolve();
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    const logMessage = `[WS] 收到消息: ${message.type} - ${JSON.stringify(message.data)}`;
                    console.log('  🌐 ' + logMessage);
                    
                    this.results.nativeWebSocket.messages.push({
                        time: new Date().toISOString(),
                        data: message,
                        message: logMessage
                    });
                } catch (e) {
                    console.log('  🌐 [WS] 收到非JSON消息:', data.toString());
                }
            });

            ws.on('error', (error) => {
                console.log('  ❌ 原生WebSocket 错误:', error.message);
                this.results.nativeWebSocket.status = 'error';
                this.results.nativeWebSocket.error = error.message;
                resolve();
            });

            ws.on('close', () => {
                console.log('  🔚 原生WebSocket 连接关闭');
                resolve();
            });
        });
    }

    // 🏦 测试 Accounts 查询订阅
    async testAccountsQuery() {
        console.log('🏦 启动 Accounts 查询订阅测试...');
        return this.createTableQueryTest('accountsQuery', `
            subscription AccountsQuery {
                accountsQuery {
                    accounts {
                        nodes {
                            nodeId
                            assetId
                            account
                            balance
                        }
                        totalCount
                    }
                }
            }
        `, 'accounts');
    }

    // 📍 测试 Positions 查询订阅
    async testPositionsQuery() {
        console.log('📍 启动 Positions 查询订阅测试...');
        return this.createTableQueryTest('positionsQuery', `
            subscription PositionsQuery {
                positionsQuery {
                    positions {
                        nodes {
                            nodeId
                            player
                            x
                            y
                        }
                        totalCount
                    }
                }
            }
        `, 'positions');
    }

    // ⚔️ 测试 Encounters 查询订阅
    async testEncountersQuery() {
        console.log('⚔️ 启动 Encounters 查询订阅测试...');
        return this.createTableQueryTest('encountersQuery', `
            subscription EncountersQuery {
                encountersQuery {
                    encounters {
                        nodes {
                            nodeId
                            exists
                            catchAttempts
                            monster
                            player
                        }
                        totalCount
                    }
                }
            }
        `, 'encounters');
    }

    // 🗺️ 测试 MapConfig 查询订阅
    async testMapConfigQuery() {
        console.log('🗺️ 启动 MapConfig 查询订阅测试...');
        return this.createTableQueryTest('mapConfigQuery', `
            subscription MapConfigQuery {
                mapConfigQuery {
                    mapConfigs {
                        nodes {
                            nodeId
                            width
                            height
                        }
                        totalCount
                    }
                }
            }
        `, 'mapConfigs');
    }

    // 通用查询测试创建函数
    async createTableQueryTest(testKey, query, dataKey) {
        const client = createClient({
            url: config.subscriptionUrl,
            webSocketImpl: WebSocket,
        });

        this.activeClients.push(() => client.dispose());

        return new Promise((resolve) => {
            const unsubscribe = client.subscribe(
                { query },
                {
                    next: (data) => {
                        const queryResult = data.data?.[testKey.replace('Query', 'Query')]?.[dataKey];
                        const message = `[${testKey}] 收到查询结果: ${queryResult?.totalCount || 0} 条数据`;
                        console.log(`  ✨ ${message}`);
                        this.results[testKey].messages.push({
                            time: new Date().toISOString(),
                            data: queryResult,
                            message
                        });
                        
                        if (this.results[testKey].status === 'pending') {
                            this.results[testKey].status = 'connected';
                            console.log(`  ✅ ${testKey} 连接成功`);
                            resolve();
                        }
                    },
                    error: (error) => {
                        console.log(`  ❌ ${testKey} 错误:`, error.message);
                        this.results[testKey].status = 'error';
                        this.results[testKey].error = error.message;
                        resolve();
                    },
                    complete: () => {
                        console.log(`  🔚 ${testKey} 连接关闭`);
                        resolve();
                    }
                }
            );

            this.activeClients.push(unsubscribe);
        });
    }

    // 🏦 测试 Accounts 更新订阅
    async testAccountsUpdated() {
        console.log('🏦 启动 AccountsUpdated 订阅测试...');
        return this.createTableUpdateTest('accountsUpdated', `
            subscription AccountsUpdated {
                accountsUpdated {
                    event
                    table
                    timestamp
                    accounts {
                        nodes {
                            nodeId
                            assetId
                            account
                            balance
                        }
                        totalCount
                    }
                }
            }
        `, 'accounts');
    }

    // 📍 测试 Positions 更新订阅
    async testPositionsUpdated() {
        console.log('📍 启动 PositionsUpdated 订阅测试...');
        return this.createTableUpdateTest('positionsUpdated', `
            subscription PositionsUpdated {
                positionsUpdated {
                    event
                    table
                    timestamp
                    positions {
                        nodes {
                            nodeId
                            player
                            x
                            y
                        }
                        totalCount
                    }
                }
            }
        `, 'positions');
    }

    // ⚔️ 测试 Encounters 更新订阅
    async testEncountersUpdated() {
        console.log('⚔️ 启动 EncountersUpdated 订阅测试...');
        return this.createTableUpdateTest('encountersUpdated', `
            subscription EncountersUpdated {
                encountersUpdated {
                    event
                    table
                    timestamp
                    encounters {
                        nodes {
                            nodeId
                            exists
                            catchAttempts
                            monster
                            player
                        }
                        totalCount
                    }
                }
            }
        `, 'encounters');
    }

    // 🗺️ 测试 MapConfig 更新订阅
    async testMapConfigUpdated() {
        console.log('🗺️ 启动 MapConfigUpdated 订阅测试...');
        return this.createTableUpdateTest('mapConfigUpdated', `
            subscription MapConfigUpdated {
                mapConfigUpdated {
                    event
                    table
                    timestamp
                    mapConfigs {
                        nodes {
                            nodeId
                            width
                            height
                        }
                        totalCount
                    }
                }
            }
        `, 'mapConfigs');
    }

    // 通用更新测试创建函数
    async createTableUpdateTest(testKey, query, dataKey) {
        const client = createClient({
            url: config.subscriptionUrl,
            webSocketImpl: WebSocket,
        });

        this.activeClients.push(() => client.dispose());

        return new Promise((resolve) => {
            const unsubscribe = client.subscribe(
                { query },
                {
                    next: (data) => {
                        const updateData = data.data?.[testKey];
                        const message = `[${testKey}] ${updateData?.event || 'unknown'} 事件: ${updateData?.[dataKey]?.totalCount || 0} 条数据`;
                        console.log(`  🔔 ${message}`);
                        this.results[testKey].messages.push({
                            time: new Date().toISOString(),
                            data: updateData,
                            message
                        });
                        
                        if (this.results[testKey].status === 'pending') {
                            this.results[testKey].status = 'connected';
                            console.log(`  ✅ ${testKey} 连接成功`);
                            resolve();
                        }
                    },
                    error: (error) => {
                        console.log(`  ❌ ${testKey} 错误:`, error.message);
                        this.results[testKey].status = 'error';
                        this.results[testKey].error = error.message;
                        resolve();
                    },
                    complete: () => {
                        console.log(`  🔚 ${testKey} 连接关闭`);
                        resolve();
                    }
                }
            );

            this.activeClients.push(unsubscribe);
        });
    }

    async waitAndObserve(duration) {
        const startTime = Date.now();
        const endTime = startTime + duration;
        
        while (Date.now() < endTime) {
            const remaining = Math.ceil((endTime - Date.now()) / 1000);
            process.stdout.write(`\r⏳ 剩余时间: ${remaining}秒 `);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('\n');
    }

    displayResults() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 测试结果总结');
        console.log('='.repeat(60));
        
        Object.entries(this.results).forEach(([type, result]) => {
            const typeName = {
                'liveQueries': 'Live Queries (@live)',
                'pgSubscriptions': 'PostgreSQL订阅 (listen)', 
                'nativeWebSocket': '原生WebSocket',
                'accountsQuery': '🏦 Accounts查询订阅',
                'positionsQuery': '📍 Positions查询订阅',
                'encountersQuery': '⚔️ Encounters查询订阅',
                'mapConfigQuery': '🗺️ MapConfig查询订阅',
                'accountsUpdated': '🏦 Accounts更新订阅',
                'positionsUpdated': '📍 Positions更新订阅',
                'encountersUpdated': '⚔️ Encounters更新订阅',
                'mapConfigUpdated': '🗺️ MapConfig更新订阅'
            }[type];
            
            console.log(`\n${typeName}:`);
            console.log(`  状态: ${this.getStatusIcon(result.status)} ${result.status}`);
            
            if (result.error) {
                console.log(`  错误: ${result.error}`);
            }
            
            console.log(`  消息数量: ${result.messages.length}`);
            
            if (result.messages.length > 0) {
                console.log('  最近消息:');
                result.messages.slice(-3).forEach(msg => {
                    console.log(`    ${msg.time}: ${msg.message}`);
                });
            }
        });

        console.log('\n💡 使用建议:');
        const connectedMethods = Object.entries(this.results)
            .filter(([_, result]) => result.status === 'connected')
            .map(([type, _]) => type);
            
        if (connectedMethods.length === 0) {
            console.log('- 没有成功的连接，请检查服务器配置和数据库设置');
        } else {
            console.log('- 成功连接的方法:', connectedMethods.join(', '));
            console.log('- 可以选择任意一种方法用于生产环境');
        }

        console.log('\n📚 Playground 使用示例 - 所有4个Store表:');
        console.log('\n🎯 查询订阅 (推荐语法 - 返回完整数据):');
        console.log('1. 🏦 Accounts:');
        console.log('   subscription { accountsQuery { accounts { nodes { assetId account balance } } } }');
        console.log('\n2. 📍 Positions:');
        console.log('   subscription { positionsQuery { positions { nodes { player x y } } } }');
        console.log('\n3. ⚔️ Encounters:');
        console.log('   subscription { encountersQuery { encounters { nodes { player monster exists catchAttempts } } } }');
        console.log('\n4. 🗺️ MapConfig:');
        console.log('   subscription { mapConfigQuery { mapConfigs { nodes { width height } } } }');
        
        console.log('\n🔔 更新事件订阅 (详细事件信息):');
        console.log('1. 🏦 Accounts: accountsUpdated { event table timestamp accounts { nodes { ... } } }');
        console.log('2. 📍 Positions: positionsUpdated { event table timestamp positions { nodes { ... } } }');
        console.log('3. ⚔️ Encounters: encountersUpdated { event table timestamp encounters { nodes { ... } } }');
        console.log('4. 🗺️ MapConfig: mapConfigUpdated { event table timestamp mapConfigs { nodes { ... } } }');
        
        console.log('\n⚡ PostgreSQL订阅 (原始语法):');
        console.log('   subscription { listen(topic: "store_encounter") { relatedNodeId relatedNode { nodeId } } }');
        console.log('\n🔥 Live Queries (需要 wal_level=logical):');
        console.log('   subscription { encounters @live { nodes { player monster exists } } }');
        
        console.log('\n' + '='.repeat(60));
    }

    getStatusIcon(status) {
        const icons = {
            'pending': '⏳',
            'connected': '✅', 
            'error': '❌'
        };
        return icons[status] || '❓';
    }

    cleanup() {
        console.log('\n🧹 清理连接...');
        this.activeClients.forEach(cleanup => {
            try {
                cleanup();
            } catch (e) {
                // 忽略清理错误
            }
        });
        console.log('✅ 清理完成');
    }
}

// 运行测试
if (require.main === module) {
    const testSuite = new AllSubscriptionsTestSuite();
    testSuite.runAllTests().catch(console.error);
}

module.exports = AllSubscriptionsTestSuite; 