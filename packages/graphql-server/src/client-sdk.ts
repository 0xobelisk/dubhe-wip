// 客户端SDK - 同时支持Live Queries和原生WebSocket
// 注意：这个文件需要在客户端环境中使用，需要安装相应的依赖包：
// npm install @apollo/client graphql-ws

export interface EngineClientConfig {
	graphqlUrl: string;
	websocketUrl: string;
	realtimeUrl?: string; // 原生WebSocket URL
	enableLiveQueries?: boolean;
	enableNativeWebSocket?: boolean;
}

export interface NativeSubscription {
	table: string;
	filter?: Record<string, any>;
	fields?: string[];
	onUpdate?: (data: any) => void;
	onError?: (error: Error) => void;
}

export interface RealtimeUpdate {
	type: 'insert' | 'update' | 'delete' | 'initial';
	table: string;
	data: any;
	timestamp: string;
}

// 注意：这个文件提供基础接口定义和简单的NativeWebSocketClient实现
// 完整的Apollo Client集成需要在实际客户端项目中完成

// 注意：接口定义已在文件开头导出

// 原生WebSocket客户端类
export class NativeWebSocketClient {
	private ws: any; // WebSocket类型在Node.js环境中不可用
	private subscriptions: Map<string, NativeSubscription> = new Map();
	private isConnected = false;
	private url: string;

	constructor(url: string) {
		this.url = url;
	}

	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				// 在实际客户端环境中：this.ws = new WebSocket(this.url);
				console.log(`连接到原生WebSocket: ${this.url}`);

				// 模拟连接成功
				setTimeout(() => {
					this.isConnected = true;
					resolve();
				}, 100);
			} catch (error) {
				reject(error);
			}
		});
	}

	subscribe(subscription: NativeSubscription): () => void {
		const subscriptionKey = `${subscription.table}_${Date.now()}`;
		this.subscriptions.set(subscriptionKey, subscription);

		// 发送订阅请求
		const message = {
			action: 'subscribe',
			subscriptionType: 'native',
			table: subscription.table,
			filter: subscription.filter,
			fields: subscription.fields,
			queryId: subscriptionKey,
		};

		console.log('发送订阅:', message);
		// 在实际环境中：this.ws.send(JSON.stringify(message));

		// 返回取消订阅函数
		return () => {
			this.subscriptions.delete(subscriptionKey);
			console.log('取消订阅:', subscriptionKey);
		};
	}

	disconnect() {
		this.isConnected = false;
		console.log('断开原生WebSocket连接');
	}
}

// 使用示例和文档
export const USAGE_EXAMPLES = {
	// 1. Live Queries使用示例 (PostGraphile)
	liveQueriesExample: `
		// GraphQL Live Query示例
		subscription LiveEncounters {
			encounters @live {
				nodes {
					id
					playerId
					status
					createdAt
				}
			}
		}
		
		// 带过滤的Live Query
		subscription LivePlayerEncounters($playerId: String!) {
			encounters(filter: { playerId: { equalTo: $playerId } }) @live {
				nodes {
					id
					status
					enemyType
				}
			}
		}
	`,

	// 2. 原生WebSocket使用示例
	nativeWebSocketExample: `
		// 创建原生WebSocket客户端
		const client = new NativeWebSocketClient('ws://localhost:4001');
		
		// 连接
		await client.connect();
		
		// 订阅高频数据
		const unsubscribe = client.subscribe({
			table: 'store_player_positions',
			filter: { playerId: 'player123' },
			onUpdate: (data) => {
				console.log('实时位置更新:', data);
				// 更新UI
				updatePlayerPosition(data.data);
			}
		});
		
		// 取消订阅
		// unsubscribe();
	`,

	// 3. 混合使用场景
	hybridUsageExample: `
		// 高频数据 - 原生WebSocket
		const positionClient = new NativeWebSocketClient('ws://localhost:4001');
		positionClient.subscribe({
			table: 'store_player_positions',
			onUpdate: (data) => updatePlayerPosition(data)
		});
		
		// 中频数据 - Live Queries  
		const PLAYER_INVENTORY = gql\`
			subscription PlayerInventory($playerId: String!) {
				items(filter: { playerId: { equalTo: $playerId } }) @live {
					nodes {
						id
						type
						quantity
					}
				}
			}
		\`;
		
		// 使用Apollo Client执行Live Query
		// const { data } = useSubscription(PLAYER_INVENTORY, { variables: { playerId } });
	`,
};

// 配置示例
export const CONFIG_EXAMPLES = {
	// 开发环境配置
	development: {
		graphqlUrl: 'http://localhost:4000/graphql',
		websocketUrl: 'ws://localhost:4000/graphql',
		realtimeUrl: 'ws://localhost:4001',
		enableLiveQueries: true,
		enableNativeWebSocket: true,
	} as EngineClientConfig,

	// 生产环境配置
	production: {
		graphqlUrl: 'https://api.yourgame.com/graphql',
		websocketUrl: 'wss://api.yourgame.com/graphql',
		realtimeUrl: 'wss://realtime.yourgame.com',
		enableLiveQueries: true,
		enableNativeWebSocket: true,
	} as EngineClientConfig,
};

// 性能建议
export const PERFORMANCE_RECOMMENDATIONS = {
	// 使用Live Queries的场景
	useLiveQueries: [
		'玩家背包物品 (中频更新)',
		'任务进度 (低频更新)',
		'好友列表 (低频更新)',
		'公会信息 (低频更新)',
		'复杂查询结果 (关联数据)',
	],

	// 使用原生WebSocket的场景
	useNativeWebSocket: [
		'玩家实时位置 (高频更新)',
		'血量/魔法值 (战斗中)',
		'实时聊天消息',
		'PvP战斗数据',
		'简单的状态更新',
	],

	// 性能指标期望
	performanceTargets: {
		liveQueries: {
			latency: '50-200ms',
			bandwidth: '2-50KB per update',
			suitable: '中低频数据，复杂查询',
		},
		nativeWebSocket: {
			latency: '10-50ms',
			bandwidth: '0.1-2KB per update',
			suitable: '高频数据，简单更新',
		},
	},
};

// 集成指南
export const INTEGRATION_GUIDE = `
# 统一实时引擎集成指南

## 1. 服务器端配置

\`\`\`typescript
// 在index.ts中启用统一引擎
const realtimeEngine = new UnifiedRealtimeEngine({
	port: 4001,
	dbUrl: DATABASE_URL,
	enableLiveQueries: true,
	enableNativeWebSocket: true,
	tableNames: ['store_encounter', 'store_player', 'store_item'],
});
\`\`\`

## 2. 客户端配置

\`\`\`typescript
// React应用示例
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { NativeWebSocketClient } from './client-sdk';

// 配置Apollo Client (Live Queries)
const apolloClient = new ApolloClient({
	uri: 'http://localhost:4000/graphql',
	cache: new InMemoryCache(),
});

// 配置原生WebSocket (高性能订阅)
const realtimeClient = new NativeWebSocketClient('ws://localhost:4001');
\`\`\`

## 3. 使用决策矩阵

| 数据类型 | 更新频率 | 推荐方案 | 原因 |
|---------|---------|---------|------|
| 玩家位置 | >1次/秒 | Native WS | 低延迟，小数据 |
| 背包物品 | 几次/分钟 | Live Queries | 复杂查询，中频更新 |
| 任务进度 | 偶尔 | Live Queries | 关联数据，低频更新 |
| 聊天消息 | 实时 | Native WS | 即时性要求高 |
| 排行榜 | 定期 | Live Queries | 复杂计算，批量数据 |

## 4. 错误处理

\`\`\`typescript
// Live Queries错误处理
const { data, error, loading } = useSubscription(LIVE_QUERY, {
	onError: (error) => {
		console.error('Live Query错误:', error);
		// 回退到polling或显示错误状态
	}
});

// Native WebSocket错误处理
client.subscribe({
	table: 'positions',
	onError: (error) => {
		console.error('WebSocket错误:', error);
		// 尝试重连或切换到Live Queries
	}
});
\`\`\`

这样的混合架构为你的通用引擎提供了最大的灵活性！🎮⚡
`;
