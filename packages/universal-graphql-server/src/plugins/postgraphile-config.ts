import { createEnhancedPlayground } from './enhanced-playground';
import { QueryFilterPlugin } from './query-filter';
import { SimpleNamingPlugin } from './simple-naming';
import { AllFieldsFilterPlugin } from './all-fields-filter-plugin';
import ConnectionFilterPlugin from 'postgraphile-plugin-connection-filter';

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
		// 基础配置 - 关闭默认GraphiQL
		graphiql: false,
		enhanceGraphiql: false,
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
		ignoreIndexes: true,

		// 启用 introspection 和其他重要功能
		disableQueryLog: nodeEnv !== 'development',
		allowExplain: nodeEnv === 'development',
		watchPg: nodeEnv === 'development',

		// GraphQL 端点
		graphqlRoute: graphqlEndpoint,

		// 添加自定义插件 - 包含官方的connection filter插件
		appendPlugins: [
			QueryFilterPlugin,
			SimpleNamingPlugin,
			ConnectionFilterPlugin,
			AllFieldsFilterPlugin,
		],

		// Connection Filter 插件的高级配置选项
		graphileBuildOptions: {
			// 启用所有支持的操作符
			connectionFilterAllowedOperators: [
				'isNull',
				'equalTo',
				'notEqualTo',
				'distinctFrom',
				'notDistinctFrom',
				'lessThan',
				'lessThanOrEqualTo',
				'greaterThan',
				'greaterThanOrEqualTo',
				'in',
				'notIn',
				'like',
				'notLike',
				'ilike',
				'notIlike',
				'similarTo',
				'notSimilarTo',
				'includes',
				'notIncludes',
				'includesInsensitive',
				'notIncludesInsensitive',
				'startsWith',
				'notStartsWith',
				'startsWithInsensitive',
				'notStartsWithInsensitive',
				'endsWith',
				'notEndsWith',
				'endsWithInsensitive',
				'notEndsWithInsensitive',
			],

			// 支持所有字段类型的过滤 - 明确允许所有类型
			connectionFilterAllowedFieldTypes: [
				'String',
				'Int',
				'Float',
				'Boolean',
				'ID',
				'Date',
				'Time',
				'Datetime',
				'JSON',
			],

			// 启用逻辑操作符 (and, or, not)
			connectionFilterLogicalOperators: true,

			// 启用关系过滤
			connectionFilterRelations: true,

			// 启用计算列过滤
			connectionFilterComputedColumns: true,

			// 启用数组过滤
			connectionFilterArrays: true,

			// 启用函数过滤
			connectionFilterSetofFunctions: true,

			// 允许空输入和空对象输入
			connectionFilterAllowNullInput: true,
			connectionFilterAllowEmptyObjectInput: true,

			// // 使用简化的操作符名称
			// connectionFilterOperatorNames: {
			// 	equalTo: 'eq',
			// 	notEqualTo: 'ne',
			// 	lessThan: 'lt',
			// 	lessThanOrEqualTo: 'lte',
			// 	greaterThan: 'gt',
			// 	greaterThanOrEqualTo: 'gte',
			// 	includesInsensitive: 'icontains',
			// 	notIncludesInsensitive: 'nicontains',
			// },
		},

		// 只包含检测到的表
		includeExtensionResources: false,

		// 排除不需要的表
		ignoreTable: (tableName: string) => {
			// 如果没有检测到任何表，允许所有表
			if (availableTables.length === 0) {
				return false;
			}
			// 否则只包含检测到的表
			return !availableTables.includes(tableName);
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
			// 启用查询缓存以支持实时更新
			pgSettings: {
				statement_timeout: '30s',
			},
		}),
	};
}

// 导出增强版playground的HTML生成器
export function createPlaygroundHtml(
	options: PostGraphileConfigOptions
): string {
	const { port, graphqlEndpoint, enableSubscriptions, availableTables } =
		options;

	// 构建GraphQL和WebSocket端点URL
	const baseUrl = `http://localhost:${port}`;
	const graphqlUrl = `${baseUrl}${graphqlEndpoint}`;
	const subscriptionUrl =
		enableSubscriptions === 'true'
			? `ws://localhost:${port}${graphqlEndpoint}`
			: undefined;

	return createEnhancedPlayground({
		url: graphqlUrl,
		subscriptionUrl,
		title: 'Sui Indexer GraphQL Playground',
		subtitle: `强大的GraphQL API | 已发现 ${
			availableTables.length
		} 个表 | ${
			enableSubscriptions === 'true' ? '支持实时订阅' : '实时订阅已禁用'
		}`,
	})(null as any, null as any, {});
}
