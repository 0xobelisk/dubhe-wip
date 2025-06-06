#!/usr/bin/env node

/**
 * 增强订阅系统测试脚本
 * 
 * 用途：
 * 1. 测试配置系统是否正常工作
 * 2. 验证三种订阅模式的可用性
 * 3. 检查sui-rust-indexer的通知支持
 */

const { createClient } = require('graphql-ws');
const WebSocket = require('ws');

// 配置
const config = {
    graphqlUrl: 'http://localhost:4000/graphql',
    subscriptionUrl: 'ws://localhost:4000/graphql', 
    nativeWebSocketUrl: 'ws://localhost:4000',
    healthUrl: 'http://localhost:4000/health',
    configUrl: 'http://localhost:4000/subscription-config',
    docsUrl: 'http://localhost:4000/subscription-docs'
};

class SubscriptionTester {
    constructor() {
        this.results = {
            configSystem: false,
            liveQueries: false,
            pgSubscriptions: false,
            nativeWebSocket: false
        };
        this.fetch = null;
    }

    async init() {
        // 动态导入node-fetch
        const { default: fetch } = await import('node-fetch');
        this.fetch = fetch;
    }

    async runAllTests() {
        console.log('🧪 开始测试增强订阅系统...\n');

        // 0. 初始化fetch
        await this.init();

        // 1. 测试配置系统
        await this.testConfigSystem();
        
        // 2. 获取服务器配置
        const serverConfig = await this.getServerConfig();
        
        // 3. 根据配置测试可用的订阅模式
        if (serverConfig) {
            await this.testAvailableSubscriptions(serverConfig);
        }

        // 4. 显示测试结果
        this.displayResults();
    }

    async testConfigSystem() {
        console.log('📋 测试配置系统...');

        try {
            // 测试健康检查端点
            const healthResponse = await this.fetch(config.healthUrl);
            const healthData = await healthResponse.json();
            
            console.log('  ✅ 健康检查端点正常');
            console.log(`     状态: ${healthData.status}`);
            
            // 测试配置端点
            const configResponse = await this.fetch(config.configUrl);
            const configData = await configResponse.json();
            
            console.log('  ✅ 配置端点正常');
            console.log(`     可用能力: ${JSON.stringify(configData.capabilities)}`);
            
            // 测试文档端点
            const docsResponse = await this.fetch(config.docsUrl);
            const docsText = await docsResponse.text();
            
            console.log('  ✅ 文档端点正常');
            console.log(`     文档长度: ${docsText.length} 字符`);
            
            this.results.configSystem = true;
            
        } catch (error) {
            console.log('  ❌ 配置系统测试失败');
            console.log(`     错误: ${error.message}`);
        }
        
        console.log('');
    }

    async getServerConfig() {
        try {
            const response = await this.fetch(config.configUrl);
            return await response.json();
        } catch (error) {
            console.log('❌ 无法获取服务器配置');
            return null;
        }
    }

    async testAvailableSubscriptions(serverConfig) {
        const { capabilities } = serverConfig;

        // 测试Live Queries
        if (capabilities.liveQueries) {
            await this.testLiveQueries();
        } else {
            console.log('⚠️  Live Queries未启用，跳过测试');
        }

        // 测试PostgreSQL订阅
        if (capabilities.pgSubscriptions) {
            await this.testPgSubscriptions();
        } else {
            console.log('⚠️  PostgreSQL订阅未启用，跳过测试');
        }

        // 测试原生WebSocket
        if (capabilities.nativeWebSocket) {
            await this.testNativeWebSocket();
        } else {
            console.log('⚠️  原生WebSocket未启用，跳过测试');
        }
    }

    async testLiveQueries() {
        console.log('🔥 测试Live Queries...');

        const client = createClient({
            url: config.subscriptionUrl,
            webSocketImpl: WebSocket,
            connectionParams: {},
        });

        try {
            return new Promise((resolve) => {
                let messageReceived = false;

                const unsubscribe = client.subscribe(
                    {
                        query: `
                            subscription TestLiveQueries {
                                encounters @live {
                                    nodes {
                                        player
                                        monster
                                        exists
                                    }
                                    totalCount
                                }
                            }
                        `
                    },
                    {
                        next: (data) => {
                            if (!messageReceived) {
                                console.log('  ✅ Live Queries工作正常');
                                console.log(`     收到数据: ${data.data?.encounters?.totalCount || 0} 条记录`);
                                this.results.liveQueries = true;
                                messageReceived = true;
                                unsubscribe();
                                client.dispose();
                                resolve();
                            }
                        },
                        error: (error) => {
                            console.log('  ❌ Live Queries测试失败');
                            console.log(`     错误: ${error.message}`);
                            client.dispose();
                            resolve();
                        },
                        complete: () => {
                            client.dispose();
                            resolve();
                        }
                    }
                );

                // 5秒超时
                setTimeout(() => {
                    if (!messageReceived) {
                        console.log('  ⚠️  Live Queries超时（可能需要数据库配置）');
                        unsubscribe();
                        client.dispose();
                        resolve();
                    }
                }, 5000);
            });

        } catch (error) {
            console.log('  ❌ Live Queries连接失败');
            console.log(`     错误: ${error.message}`);
        }

        console.log('');
    }

    async testPgSubscriptions() {
        console.log('⚡ 测试PostgreSQL订阅...');

        const client = createClient({
            url: config.subscriptionUrl,
            webSocketImpl: WebSocket,
            connectionParams: {},
        });

        try {
            return new Promise((resolve) => {
                let messageReceived = false;

                const unsubscribe = client.subscribe(
                    {
                        query: `
                            subscription TestPgSubscriptions {
                                listen(topic: "store_encounter") {
                                    relatedNodeId
                                    relatedNode {
                                        nodeId
                                    }
                                }
                            }
                        `
                    },
                    {
                        next: (data) => {
                            if (!messageReceived) {
                                console.log('  ✅ PostgreSQL订阅工作正常');
                                console.log(`     收到通知: ${JSON.stringify(data.data)}`);
                                this.results.pgSubscriptions = true;
                                messageReceived = true;
                                unsubscribe();
                                client.dispose();
                                resolve();
                            }
                        },
                        error: (error) => {
                            console.log('  ❌ PostgreSQL订阅测试失败');
                            console.log(`     错误: ${error.message}`);
                            client.dispose();
                            resolve();
                        },
                        complete: () => {
                            client.dispose();
                            resolve();
                        }
                    }
                );

                // 5秒超时
                setTimeout(() => {
                    if (!messageReceived) {
                        console.log('  ⚠️  PostgreSQL订阅超时（等待数据变更）');
                        unsubscribe();
                        client.dispose();
                        resolve();
                    }
                }, 5000);
            });

        } catch (error) {
            console.log('  ❌ PostgreSQL订阅连接失败');
            console.log(`     错误: ${error.message}`);
        }

        console.log('');
    }

    async testNativeWebSocket() {
        console.log('🌐 测试原生WebSocket...');

        try {
            return new Promise((resolve) => {
                const ws = new WebSocket(config.nativeWebSocketUrl);
                let messageReceived = false;

                ws.on('open', () => {
                    console.log('  ✅ 原生WebSocket连接成功');
                    
                    // 发送订阅请求
                    ws.send(JSON.stringify({
                        action: 'subscribe',
                        table: 'encounter'
                    }));
                });

                ws.on('message', (data) => {
                    if (!messageReceived) {
                        const message = JSON.parse(data.toString());
                        console.log('  ✅ 原生WebSocket工作正常');
                        console.log(`     消息类型: ${message.type}`);
                        this.results.nativeWebSocket = true;
                        messageReceived = true;
                        ws.close();
                        resolve();
                    }
                });

                ws.on('error', (error) => {
                    console.log('  ❌ 原生WebSocket测试失败');
                    console.log(`     错误: ${error.message}`);
                    resolve();
                });

                ws.on('close', () => {
                    if (!messageReceived) {
                        console.log('  ⚠️  原生WebSocket连接关闭');
                    }
                    resolve();
                });

                // 5秒超时
                setTimeout(() => {
                    if (!messageReceived) {
                        console.log('  ⚠️  原生WebSocket超时');
                        ws.close();
                        resolve();
                    }
                }, 5000);
            });

        } catch (error) {
            console.log('  ❌ 原生WebSocket连接失败');
            console.log(`     错误: ${error.message}`);
        }

        console.log('');
    }

    displayResults() {
        console.log('📊 测试结果汇总:');
        console.log('='.repeat(50));
        
        console.log(`配置系统:     ${this.results.configSystem ? '✅ 正常' : '❌ 失败'}`);
        console.log(`Live Queries: ${this.results.liveQueries ? '✅ 正常' : '⚠️  未测试或失败'}`);
        console.log(`PG订阅:       ${this.results.pgSubscriptions ? '✅ 正常' : '⚠️  未测试或失败'}`);
        console.log(`原生WebSocket: ${this.results.nativeWebSocket ? '✅ 正常' : '⚠️  未测试或失败'}`);
        
        console.log('\n💡 建议:');
        
        if (this.results.configSystem) {
            console.log('- 配置系统工作正常，您可以访问配置端点获取详细信息');
        }
        
        if (this.results.liveQueries) {
            console.log('- Live Queries可用，推荐在生产环境使用');
        } else {
            console.log('- 如需Live Queries，请确保设置 wal_level=logical');
        }
        
        if (this.results.pgSubscriptions) {
            console.log('- PostgreSQL订阅可用，兼容性最佳');
        }
        
        if (this.results.nativeWebSocket) {
            console.log('- 原生WebSocket可用，适合定制化需求');
        }
        
        console.log('\n📖 更多信息:');
        console.log(`- 配置文档: ${config.docsUrl}`);
        console.log(`- 服务器状态: ${config.healthUrl}`);
        console.log(`- 客户端配置: ${config.configUrl}`);
    }
}

// 运行测试
if (require.main === module) {
    const tester = new SubscriptionTester();
    tester.runAllTests().catch(console.error);
}

module.exports = SubscriptionTester; 