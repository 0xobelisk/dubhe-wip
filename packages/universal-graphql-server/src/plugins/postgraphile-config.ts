import { createEnhancedPlayground } from './enhanced-playground';

export interface PostGraphileConfigOptions {
	port: string | number;
	nodeEnv: string;
	graphqlEndpoint: string;
	enableSubscriptions: string;
	enableCors: string;
	databaseUrl: string;
	availableTables: string[];
}

// 创建 PostGraphile 配置
export function createPostGraphileConfig(options: PostGraphileConfigOptions) {
	const {
		port,
		nodeEnv,
		graphqlEndpoint,
		enableSubscriptions,
		enableCors,
		availableTables,
	} = options;

	// 构建GraphQL和WebSocket端点URL
	const baseUrl = `http://localhost:${port}`;
	const graphqlUrl = `${baseUrl}${graphqlEndpoint}`;
	const subscriptionUrl =
		enableSubscriptions === 'true'
			? `ws://localhost:${port}${graphqlEndpoint}`
			: undefined;

	return {
		// 基础配置
		graphiql: true,
		enhanceGraphiql: true,
		showErrorStack: nodeEnv === 'development',
		extendedErrors:
			nodeEnv === 'development' ? ['hint', 'detail', 'errcode'] : [],

		// 功能配置
		subscriptions: enableSubscriptions === 'true',
		live: enableSubscriptions === 'true',
		enableQueryBatching: true,
		enableCors: enableCors === 'true',

		// Schema 配置
		dynamicJson: true,
		setofFunctionsContainNulls: false,
		ignoreRBAC: false,
		ignoreIndexes: false,

		// GraphQL 端点
		graphqlRoute: graphqlEndpoint,
		graphiqlRoute: '/graphiql',

		// 使用增强版 Playground
		graphiqlHtmlGenerator: createEnhancedPlayground({
			url: graphqlUrl,
			subscriptionUrl,
			title: 'Sui Indexer GraphQL Playground',
			subtitle: `强大的GraphQL API | 已发现 ${
				availableTables.length
			} 个表 | ${
				enableSubscriptions === 'true'
					? '支持实时订阅'
					: '实时订阅已禁用'
			}`,
		}),

		// 只包含检测到的表
		includeExtensionResources: false,

		// 排除不需要的表
		ignoreTable: (tableName: string) => {
			return !availableTables.includes(tableName);
		},

		// 自定义 GraphiQL 配置（作为备用）
		graphiqlOptions: {
			headerEditorEnabled: true,
			requestCredentials: 'same-origin',
		},

		// 导出 schema（开发环境）
		exportGqlSchemaPath:
			nodeEnv === 'development'
				? 'sui-indexer-schema.graphql'
				: undefined,

		// 重要：为订阅功能添加必要配置
		...(enableSubscriptions === 'true' && {
			// 使用非池化连接确保订阅正常工作
			ownerConnectionString: options.databaseUrl,
			// 启用订阅功能，但不使用简单模式
			subscriptions: true,
			// 启用实时查询
			live: true,
			// 配置WebSocket端点
			websocketMiddlewares: [],
			// 启用实时查询（让标准查询支持subscription）
			watchPg: true,
			// 启用查询缓存以支持实时更新
			pgSettings: {
				statement_timeout: '30s',
			},
		}),
	};
}
