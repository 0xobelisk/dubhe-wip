import { QueryFilterPlugin } from './query-filter';
import { SimpleNamingPlugin } from './simple-naming';
import { AllFieldsFilterPlugin } from './all-fields-filter-plugin';
import { createEnhancedPlayground } from './enhanced-playground';
import ConnectionFilterPlugin from 'postgraphile-plugin-connection-filter';
import PgSimplifyInflectorPlugin from '@graphile-contrib/pg-simplify-inflector';
import { makePluginHook } from 'postgraphile';
import PgPubSub from '@graphile/pg-pubsub';

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
  const { port, nodeEnv, graphqlEndpoint, enableSubscriptions, enableCors, availableTables } =
    options;

  // 构建GraphQL和WebSocket端点URL
  const baseUrl = `http://localhost:${port}`;
  const graphqlUrl = `${baseUrl}${graphqlEndpoint}`;
  const subscriptionUrl =
    enableSubscriptions === 'true' ? `ws://localhost:${port}${graphqlEndpoint}` : undefined;

  // 创建插件钩子以支持WebSocket和订阅
  const pluginHook = makePluginHook([PgPubSub]);

  const config = {
    // 基础配置 - 关闭默认GraphiQL
    graphiql: false,
    enhanceGraphiql: false,
    showErrorStack: nodeEnv === 'development',
    extendedErrors: nodeEnv === 'development' ? ['hint', 'detail', 'errcode'] : [],

    // 功能配置 - 启用订阅
    subscriptions: enableSubscriptions === 'true',
    live: enableSubscriptions === 'true', // 启用live功能以支持订阅
    enableQueryBatching: true,
    enableCors: enableCors === 'true',

    // 添加插件钩子以支持WebSocket
    pluginHook,

    // 禁用所有mutation功能 - 只保留查询和订阅
    disableDefaultMutations: true,

    // Schema 配置
    dynamicJson: true,
    setofFunctionsContainNulls: false,
    ignoreRBAC: false,
    ignoreIndexes: true,

    // 日志控制配置
    // 通过环境变量控制SQL查询日志: DISABLE_QUERY_LOG=true 禁用查询日志
    disableQueryLog:
      process.env.DISABLE_QUERY_LOG === 'true' ||
      (nodeEnv === 'production' && process.env.ENABLE_QUERY_LOG !== 'true'),

    // 启用查询执行计划解释（仅开发环境）
    allowExplain: nodeEnv === 'development',

    // 监控PostgreSQL变化（仅开发环境）
    watchPg: nodeEnv === 'development',

    // GraphQL查询超时设置
    queryTimeout: parseInt(process.env.QUERY_TIMEOUT || '30000'),

    // GraphQL 端点 - 明确指定路由
    graphqlRoute: graphqlEndpoint,
    graphiqlRoute: '/graphiql', // GraphiQL界面路由

    // 添加自定义插件
    appendPlugins: [
      QueryFilterPlugin, // 必须在SimpleNamingPlugin之前执行
      PgSimplifyInflectorPlugin, // 简化字段名，去掉ByXxxAndYyy后缀
      SimpleNamingPlugin, // 已修复字段丢失问题
      ConnectionFilterPlugin,
      AllFieldsFilterPlugin
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
        'notEndsWithInsensitive'
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
        'BigInt'
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
      connectionFilterAllowEmptyObjectInput: true
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
    exportGqlSchemaPath: nodeEnv === 'development' ? 'sui-indexer-schema.graphql' : undefined
  };

  // 如果启用订阅，添加额外的PostgreSQL订阅配置
  if (enableSubscriptions === 'true') {
    return {
      ...config,
      // 使用专用数据库连接用于订阅
      ownerConnectionString: options.databaseUrl,

      // WebSocket配置
      websocketMiddlewares: [],

      // PostgreSQL设置 - 为订阅优化
      pgSettings: {
        statement_timeout: '30s',
        // 为订阅设置适当的事务隔离级别
        default_transaction_isolation: 'read committed'
      },

      // 连接失败时重试
      retryOnInitFail: true,

      // 性能优化
      pgDefaultRole: undefined,
      jwtSecret: undefined,

      // 开发环境的额外配置
      ...(nodeEnv === 'development' && {
        queryCache: true,
        allowExplain: true
      })
    };
  }

  return config;
}

// 导出增强版playground的HTML生成器
export function createPlaygroundHtml(options: PostGraphileConfigOptions): string {
  const { port, graphqlEndpoint, enableSubscriptions, availableTables } = options;

  // 构建GraphQL和WebSocket端点URL
  const baseUrl = `http://localhost:${port}`;
  const graphqlUrl = `${baseUrl}${graphqlEndpoint}`;
  const subscriptionUrl =
    enableSubscriptions === 'true' ? `ws://localhost:${port}${graphqlEndpoint}` : undefined;

  return createEnhancedPlayground({
    url: graphqlUrl,
    subscriptionUrl,
    title: 'Sui Indexer GraphQL Playground',
    subtitle: `强大的GraphQL API | 已发现 ${availableTables.length} 个表 | ${
      enableSubscriptions === 'true' ? '支持实时订阅' : '实时订阅已禁用'
    }`
  })(null as any, null as any, {});
}
