// 订阅配置管理器 - 支持三种订阅模式的动态配置

export interface SubscriptionCapabilities {
	liveQueries: boolean;
	pgSubscriptions: boolean;
	nativeWebSocket: boolean;
}

export interface SubscriptionConfig {
	// 基础配置
	enableSubscriptions: boolean;

	// 能力配置
	capabilities: SubscriptionCapabilities;

	// 数据库配置检测
	walLevel: 'minimal' | 'replica' | 'logical';
	pgVersion: string;

	// 端口配置
	graphqlPort: number;
	websocketPort?: number;

	// 性能配置
	maxConnections: number;
	heartbeatInterval: number;

	// 调试配置
	enableNotificationLogging: boolean;
	enablePerformanceMetrics: boolean;
}

export class SubscriptionConfigManager {
	private config: SubscriptionConfig;

	constructor(envVars: Record<string, string>) {
		this.config = this.parseEnvironmentVariables(envVars);
	}

	// 从环境变量解析配置
	private parseEnvironmentVariables(
		env: Record<string, string>
	): SubscriptionConfig {
		const enableSubscriptions = env.ENABLE_SUBSCRIPTIONS !== 'false'; // 默认启用，除非明确设置为false

		// 自动检测WAL级别（实际应用中通过数据库查询）
		const walLevel = this.detectWalLevel(env.DATABASE_URL);

		// 根据WAL级别和环境变量确定能力 - 默认启用所有功能
		const capabilities: SubscriptionCapabilities = {
			liveQueries:
				enableSubscriptions &&
				env.ENABLE_LIVE_QUERIES !== 'false' &&
				walLevel === 'logical',

			pgSubscriptions:
				enableSubscriptions && env.ENABLE_PG_SUBSCRIPTIONS !== 'false',

			nativeWebSocket:
				enableSubscriptions && env.ENABLE_NATIVE_WEBSOCKET !== 'false',
		};

		return {
			enableSubscriptions,
			capabilities,
			walLevel,
			pgVersion: '13+', // 实际应用中通过查询获取

			graphqlPort: parseInt(env.PORT || '4000'),
			websocketPort: env.REALTIME_PORT
				? parseInt(env.REALTIME_PORT)
				: undefined,

			maxConnections: parseInt(
				env.MAX_SUBSCRIPTION_CONNECTIONS || '1000'
			),
			heartbeatInterval: parseInt(
				env.SUBSCRIPTION_HEARTBEAT_INTERVAL || '30000'
			),

			enableNotificationLogging: env.DEBUG_NOTIFICATIONS === 'true',
			enablePerformanceMetrics:
				env.ENABLE_SUBSCRIPTION_METRICS === 'true',
		};
	}

	// 检测数据库WAL级别
	private detectWalLevel(
		databaseUrl?: string
	): 'minimal' | 'replica' | 'logical' {
		// 实际应用中应该查询数据库
		// SELECT setting FROM pg_settings WHERE name = 'wal_level';

		// 目前返回默认值
		return 'replica';
	}

	// 获取当前配置
	getConfig(): SubscriptionConfig {
		return { ...this.config };
	}

	// 检查特定能力是否可用
	isCapabilityEnabled(capability: keyof SubscriptionCapabilities): boolean {
		return this.config.capabilities[capability];
	}

	// 获取推荐的订阅方法
	getRecommendedSubscriptionMethod(): string {
		if (this.config.capabilities.liveQueries) {
			return 'live-queries';
		} else if (this.config.capabilities.pgSubscriptions) {
			return 'pg-subscriptions';
		} else if (this.config.capabilities.nativeWebSocket) {
			return 'native-websocket';
		} else {
			return 'none';
		}
	}

	// 生成客户端配置
	generateClientConfig() {
		const baseUrl = `http://localhost:${this.config.graphqlPort}`;

		return {
			graphqlEndpoint: `${baseUrl}/graphql`,
			subscriptionEndpoint:
				this.config.capabilities.pgSubscriptions ||
				this.config.capabilities.liveQueries
					? `ws://localhost:${this.config.graphqlPort}/graphql`
					: undefined,
			nativeWebSocketEndpoint: this.config.capabilities.nativeWebSocket
				? `ws://localhost:${
						this.config.websocketPort || this.config.graphqlPort
				  }`
				: undefined,
			capabilities: this.config.capabilities,
			recommendedMethod: this.getRecommendedSubscriptionMethod(),
		};
	}

	// 生成PostGraphile配置 - 简化版本，只保留listen订阅
	generatePostGraphileConfig() {
		return {
			subscriptions: this.config.enableSubscriptions,
			live: false, // 禁用live queries，只使用listen订阅
			simpleSubscriptions: this.config.capabilities.pgSubscriptions,

			// 性能配置 - 为listen订阅优化
			pgSettings: {
				statement_timeout: '30s',
				default_transaction_isolation: 'read committed',
			},

			// 监控配置
			allowExplain: this.config.enablePerformanceMetrics,
			disableQueryLog: !this.config.enableNotificationLogging,
		};
	}

	// 生成环境变量说明
	generateDocumentation(): string {
		return `
# 📡 订阅系统配置指南

## 基础配置
ENABLE_SUBSCRIPTIONS=false         # 禁用订阅功能（默认启用，设置为false禁用）

## 能力配置 (可选，默认自动检测)
ENABLE_LIVE_QUERIES=true           # 启用@live指令 (需要wal_level=logical)
ENABLE_PG_SUBSCRIPTIONS=true       # 启用PostgreSQL订阅 
ENABLE_NATIVE_WEBSOCKET=true       # 启用原生WebSocket

## 端口配置
PORT=4000                          # GraphQL端口
REALTIME_PORT=4001                 # 原生WebSocket端口 (可选)

## 性能配置
MAX_SUBSCRIPTION_CONNECTIONS=1000  # 最大连接数
SUBSCRIPTION_HEARTBEAT_INTERVAL=30000  # 心跳间隔(ms)

## 调试配置
DEBUG_NOTIFICATIONS=false         # 通知日志
ENABLE_SUBSCRIPTION_METRICS=false # 性能指标

## 当前配置状态:
- 订阅功能: ${this.config.enableSubscriptions ? '✅ 已启用' : '❌ 已禁用'}
- Live Queries: ${
			this.config.capabilities.liveQueries ? '✅ 可用' : '❌ 不可用'
		}
- PG Subscriptions: ${
			this.config.capabilities.pgSubscriptions ? '✅ 可用' : '❌ 不可用'
		}  
- Native WebSocket: ${
			this.config.capabilities.nativeWebSocket ? '✅ 可用' : '❌ 不可用'
		}
- WAL Level: ${this.config.walLevel}
- 推荐方法: ${this.getRecommendedSubscriptionMethod()}
		`;
	}
}

// 导出单例实例
export const subscriptionConfig = new SubscriptionConfigManager(
	process.env as Record<string, string>
);
