"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPostGraphileConfig = createPostGraphileConfig;
exports.createPlaygroundHtml = createPlaygroundHtml;
const enhanced_playground_1 = require("./enhanced-playground");
// 创建 PostGraphile 配置
function createPostGraphileConfig(options) {
    const { port, nodeEnv, graphqlEndpoint, enableSubscriptions, enableCors, availableTables, } = options;
    // 构建GraphQL和WebSocket端点URL
    const baseUrl = `http://localhost:${port}`;
    const graphqlUrl = `${baseUrl}${graphqlEndpoint}`;
    const subscriptionUrl = enableSubscriptions === 'true'
        ? `ws://localhost:${port}${graphqlEndpoint}`
        : undefined;
    return {
        // 基础配置 - 关闭默认GraphiQL
        graphiql: false,
        enhanceGraphiql: false,
        showErrorStack: nodeEnv === 'development',
        extendedErrors: nodeEnv === 'development' ? ['hint', 'detail', 'errcode'] : [],
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
        // 启用 introspection 和其他重要功能
        disableQueryLog: nodeEnv !== 'development',
        allowExplain: nodeEnv === 'development',
        watchPg: nodeEnv === 'development',
        // GraphQL 端点
        graphqlRoute: graphqlEndpoint,
        // 只包含检测到的表
        includeExtensionResources: false,
        // 排除不需要的表
        ignoreTable: (tableName) => {
            // 如果没有检测到任何表，允许所有表
            if (availableTables.length === 0) {
                return false;
            }
            // 否则只包含检测到的表
            return !availableTables.includes(tableName);
        },
        // 导出 schema（开发环境）
        exportGqlSchemaPath: nodeEnv === 'development'
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
function createPlaygroundHtml(options) {
    const { port, graphqlEndpoint, enableSubscriptions, availableTables } = options;
    // 构建GraphQL和WebSocket端点URL
    const baseUrl = `http://localhost:${port}`;
    const graphqlUrl = `${baseUrl}${graphqlEndpoint}`;
    const subscriptionUrl = enableSubscriptions === 'true'
        ? `ws://localhost:${port}${graphqlEndpoint}`
        : undefined;
    return (0, enhanced_playground_1.createEnhancedPlayground)({
        url: graphqlUrl,
        subscriptionUrl,
        title: 'Sui Indexer GraphQL Playground',
        subtitle: `强大的GraphQL API | 已发现 ${availableTables.length} 个表 | ${enableSubscriptions === 'true' ? '支持实时订阅' : '实时订阅已禁用'}`,
    })(null, null, {});
}
//# sourceMappingURL=postgraphile-config.js.map