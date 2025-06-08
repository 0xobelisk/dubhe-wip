/**
 * DubheGraphqlClient - 支持动态缓存配置的GraphQL客户端
 *
 * 使用示例：
 *
 * // 基础配置 - 不启用任何分页缓存
 * const client = new DubheGraphqlClient({
 *   endpoint: 'http://localhost:5000/graphql',
 * });
 *
 * // 配置特定表的分页缓存
 * const client = new DubheGraphqlClient({
 *   endpoint: 'http://localhost:5000/graphql',
 *   cacheConfig: {
 *     paginatedTables: ['account', 'encounter', 'position', 'mapConfig'],
 *   },
 * });
 *
 * // 使用自定义缓存策略
 * const client = new DubheGraphqlClient({
 *   endpoint: 'http://localhost:5000/graphql',
 *   cacheConfig: {
 *     paginatedTables: ['account', 'encounter'],
 *     customMergeStrategies: {
 *       accounts: {
 *         keyArgs: ['filter'], // 只根据filter缓存，忽略orderBy
 *         merge: (existing, incoming) => {
 *           // 自定义合并逻辑
 *           return {
 *             ...incoming,
 *             edges: [...(existing?.edges || []), ...incoming.edges],
 *           };
 *         },
 *       },
 *     },
 *   },
 * });
 *
 * // OrderBy 字段名兼容性示例：
 * // 支持 camelCase 和 snake_case 字段名，都会转换为正确的 GraphQL 枚举值
 * const data = await client.getAllTables('account', {
 *   orderBy: [
 *     { field: 'updatedAt', direction: 'DESC' },    // camelCase → UPDATED_AT_DESC
 *     { field: 'created_at', direction: 'ASC' },    // snake_case → CREATED_AT_ASC
 *     { field: 'assetId', direction: 'DESC' }       // camelCase → ASSET_ID_DESC
 *   ]
 * });
 */

import {
  ApolloClient,
  InMemoryCache,
  gql,
  createHttpLink,
  split,
  NormalizedCacheObject,
  WatchQueryOptions,
  QueryOptions as ApolloQueryOptions,
  SubscriptionOptions as ApolloSubscriptionOptions,
  Observable,
  from,
  ApolloLink,
  FetchPolicy,
  OperationVariables,
} from '@apollo/client';
import { RetryLink } from '@apollo/client/link/retry';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';
import * as pluralize from 'pluralize';
import { DubheConfig } from '@0xobelisk/sui-common';

import {
  DubheClientConfig,
  Connection,
  BaseQueryParams,
  OrderBy,
  JsonPathOrder,
  QueryOptions,
  QueryResult,
  SubscriptionResult,
  SubscriptionOptions,
  StringFilter,
  NumberFilter,
  DateFilter,
  StoreTableRow,
  TypedDocumentNode,
  CachePolicy,
  MultiTableSubscriptionConfig,
  MultiTableSubscriptionResult,
  MultiTableSubscriptionData,
  ParsedTableInfo,
} from './types';

// 转换缓存策略类型
function mapCachePolicyToFetchPolicy(cachePolicy: CachePolicy): FetchPolicy {
  switch (cachePolicy) {
    case 'cache-first':
      return 'cache-first';
    case 'network-only':
      return 'network-only';
    case 'cache-only':
      return 'cache-only';
    case 'no-cache':
      return 'no-cache';
    case 'standby':
      return 'standby';
    default:
      return 'cache-first';
  }
}

export class DubheGraphqlClient {
  private apolloClient: ApolloClient<NormalizedCacheObject>;
  private subscriptionClient?: any;
  private dubheConfig?: DubheConfig;
  private parsedTables: Map<string, ParsedTableInfo> = new Map();

  constructor(config: DubheClientConfig) {
    // 保存dubhe配置
    this.dubheConfig = config.dubheConfig;

    // 如果提供了dubhe配置，解析表信息
    if (this.dubheConfig) {
      this.parseTableInfoFromConfig();
    }

    // 创建HTTP Link
    const httpLink = createHttpLink({
      uri: config.endpoint,
      headers: config.headers,
      fetch: (input, init) => fetch(input, { ...config.fetchOptions, ...init }),
    });

    // 创建重试链接
    const retryLink = new RetryLink({
      delay: {
        // 初始重试延迟时间（毫秒）
        initial: config.retryOptions?.delay?.initial || 300,
        // 最大重试延迟时间（毫秒）
        max: config.retryOptions?.delay?.max || 5000,
        // 是否添加随机抖动以避免雷击效应，默认开启
        jitter: config.retryOptions?.delay?.jitter !== false,
      },
      attempts: {
        // 最大尝试次数（包括初始请求）
        max: config.retryOptions?.attempts?.max || 5,
        // 自定义重试条件函数
        retryIf:
          config.retryOptions?.attempts?.retryIf ||
          ((error, _operation) => {
            // 默认重试策略：
            // 1. 网络连接错误
            // 2. 服务器错误但没有GraphQL错误（表示服务暂时不可用）
            return Boolean(
              error &&
                (error.networkError ||
                  (error.graphQLErrors && error.graphQLErrors.length === 0))
            );
          }),
      },
    });

    // 组合HTTP链接和重试链接
    const httpWithRetryLink = from([retryLink, httpLink]);

    let link: ApolloLink = httpWithRetryLink;

    // 如果提供了订阅端点，创建WebSocket Link
    if (config.subscriptionEndpoint) {
      // 在Node.js环境中自动导入ws模块
      let webSocketImpl;
      try {
        // 检查是否在Node.js环境中
        if (typeof window === 'undefined' && typeof global !== 'undefined') {
          // Node.js环境，需要导入ws
          const wsModule = require('ws');
          webSocketImpl = wsModule.default || wsModule;
          console.log('✅ 成功导入 ws 模块用于 WebSocket 支持');

          // 在Node.js环境中设置全局WebSocket，避免apollo client内部错误
          if (typeof (global as any).WebSocket === 'undefined') {
            (global as any).WebSocket = webSocketImpl;
          }
        } else {
          // 浏览器环境，使用原生WebSocket
          webSocketImpl = WebSocket;
        }
      } catch (error) {
        console.warn(
          '⚠️ 警告：无法导入ws模块，WebSocket功能可能不可用:',
          error
        );
      }

      const clientOptions: any = {
        url: config.subscriptionEndpoint,
        connectionParams: {
          headers: config.headers,
        },
      };

      // 只有在Node.js环境且成功导入ws时才添加webSocketImpl
      if (webSocketImpl && typeof window === 'undefined') {
        clientOptions.webSocketImpl = webSocketImpl;
      }

      this.subscriptionClient = createClient(clientOptions);

      const wsLink = new GraphQLWsLink(this.subscriptionClient);

      // 使用split来决定使用哪个link
      link = split(
        ({ query }) => {
          const definition = getMainDefinition(query);
          return (
            definition.kind === 'OperationDefinition' &&
            definition.operation === 'subscription'
          );
        },
        wsLink,
        httpWithRetryLink
      );
    }

    // 创建Apollo Client实例
    this.apolloClient = new ApolloClient({
      link,
      cache:
        config.cacheConfig?.paginatedTables &&
        config.cacheConfig.paginatedTables.length > 0
          ? new InMemoryCache({
              typePolicies: {
                // 为Connection类型配置缓存策略
                Query: {
                  fields: this.buildCacheFields(config.cacheConfig),
                },
              },
            })
          : new InMemoryCache(), // 默认使用简单缓存
      defaultOptions: {
        watchQuery: {
          errorPolicy: 'all',
          notifyOnNetworkStatusChange: true,
        },
        query: {
          errorPolicy: 'all',
        },
      },
    });
  }

  /**
   * 执行GraphQL查询
   */
  async query<
    TData,
    TVariables extends OperationVariables = OperationVariables,
  >(
    query: TypedDocumentNode<TData, TVariables>,
    variables?: TVariables,
    options?: QueryOptions
  ): Promise<QueryResult<TData>> {
    try {
      const result = await this.apolloClient.query({
        query,
        variables,
        fetchPolicy: options?.cachePolicy
          ? mapCachePolicyToFetchPolicy(options.cachePolicy)
          : 'no-cache',
        // : 'cache-first',
        notifyOnNetworkStatusChange: options?.notifyOnNetworkStatusChange,
        pollInterval: options?.pollInterval,
      });

      return {
        data: result.data,
        loading: result.loading,
        error: result.error,
        networkStatus: result.networkStatus,
        refetch: () => this.query(query, variables, options),
      };
    } catch (error) {
      return {
        data: undefined,
        loading: false,
        error: error as Error,
        networkStatus: 8, // NetworkStatus.error
        refetch: () => this.query(query, variables, options),
      };
    }
  }

  /**
   * 执行GraphQL订阅
   */
  subscribe<TData, TVariables extends OperationVariables = OperationVariables>(
    subscription: TypedDocumentNode<TData, TVariables>,
    variables?: TVariables,
    options?: SubscriptionOptions
  ): Observable<SubscriptionResult<TData>> {
    return new Observable((observer: any) => {
      const sub = this.apolloClient
        .subscribe({
          query: subscription,
          variables,
        })
        .subscribe({
          next: (result: any) => {
            const subscriptionResult: SubscriptionResult<TData> = {
              data: result.data,
              loading: false,
              error: result.errors?.[0] as Error,
            };
            observer.next(subscriptionResult);
            options?.onData?.(result.data);
          },
          error: (error: any) => {
            const subscriptionResult: SubscriptionResult<TData> = {
              data: undefined,
              loading: false,
              error,
            };
            observer.next(subscriptionResult);
            options?.onError?.(error);
          },
          complete: () => {
            observer.complete();
            options?.onComplete?.();
          },
        });

      return () => sub.unsubscribe();
    });
  }

  /**
   * 查询所有表数据 - 已适配去掉store前缀的API
   *
   * OrderBy字段名支持：
   * - camelCase: { field: 'updatedAt', direction: 'DESC' } → UPDATED_AT_DESC
   * - snake_case: { field: 'updated_at', direction: 'DESC' } → UPDATED_AT_DESC
   *
   * 使用示例：
   * ```ts
   * // 使用 camelCase 字段名
   * const result = await client.getAllTables('account', {
   *   orderBy: [{ field: 'updatedAt', direction: 'DESC' }]
   * });
   *
   * // 使用 snake_case 字段名
   * const result = await client.getAllTables('account', {
   *   orderBy: [{ field: 'updated_at', direction: 'DESC' }]
   * });
   *
   * // 混合使用
   * const result = await client.getAllTables('account', {
   *   orderBy: [
   *     { field: 'updatedAt', direction: 'DESC' },
   *     { field: 'created_at', direction: 'ASC' }
   *   ]
   * });
   * ```
   */
  async getAllTables<T extends StoreTableRow>(
    tableName: string,
    params?: BaseQueryParams & {
      filter?: Record<string, any>;
      orderBy?: OrderBy[];
      fields?: string[]; // 允许用户指定需要查询的字段，如果不指定则自动从dubhe config解析
    }
  ): Promise<Connection<T>> {
    console.log(`🔍 GraphQL查询 - 表: ${tableName}`, {
      first: params?.first,
      fields: params?.fields?.length || '自动解析',
      hasFilter: !!params?.filter,
      hasOrderBy: !!params?.orderBy,
    });

    // 确保使用复数形式的表名
    const pluralTableName = this.getPluralTableName(tableName);

    // 转换OrderBy为枚举值
    const orderByEnums = convertOrderByToEnum(params?.orderBy);

    // 动态构建查询
    const query = gql`
      query GetAllTables(
        $first: Int
        $last: Int
        $after: Cursor
        $before: Cursor
        $filter: ${this.getFilterTypeName(tableName)}
        $orderBy: [${this.getOrderByTypeName(tableName)}!]
      ) {
        ${pluralTableName}(
          first: $first
          last: $last
          after: $after
          before: $before
          filter: $filter
          orderBy: $orderBy
        ) {
          totalCount
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            cursor
            node {
              ${this.convertTableFields(tableName, params?.fields)}
            }
          }
        }
      }
    `;

    // console.log(
    //   'query:',
    //   `
    //   query GetAllTables(
    //     $first: Int
    //     $last: Int
    //     $after: Cursor
    //     $before: Cursor
    //     $filter: ${this.getFilterTypeName(tableName)}
    //     $orderBy: [${this.getOrderByTypeName(tableName)}!]
    //   ) {
    //     ${pluralTableName}(
    //       first: $first
    //       last: $last
    //       after: $after
    //       before: $before
    //       filter: $filter
    //       orderBy: $orderBy
    //     ) {
    //       totalCount
    //       pageInfo {
    //         hasNextPage
    //         hasPreviousPage
    //         startCursor
    //         endCursor
    //       }
    //       edges {
    //         cursor
    //         node {
    //           ${this.convertTableFields(tableName, params?.fields)}
    //         }
    //       }
    //     }
    //   }
    // `
    // );
    // 构建查询参数，使用枚举值
    const queryParams = {
      first: params?.first,
      last: params?.last,
      after: params?.after,
      before: params?.before,
      filter: params?.filter,
      orderBy: orderByEnums,
    };

    // // 添加调试日志
    // console.log('queryParams:', JSON.stringify(queryParams, null, 2));

    // const result = await this.query(query, queryParams, {
    //   cachePolicy: 'no-cache',
    // });

    const result = await this.query(query, queryParams);

    if (result.error) {
      throw result.error;
    }

    return (
      (result.data as any)?.[pluralTableName] || {
        edges: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      }
    );
  }

  /**
   * 根据条件获取单个表记录 - 已适配去掉store前缀的API
   */
  async getTableByCondition<T extends StoreTableRow>(
    tableName: string,
    condition: Record<string, any>,
    fields?: string[] // 允许用户指定需要查询的字段
  ): Promise<T | null> {
    // 构建查询字段名，例如：accountByAssetIdAndAccount
    const conditionKeys = Object.keys(condition);

    // 使用单数形式的表名进行单个记录查询
    const singularTableName = this.getSingularTableName(tableName);

    const query = gql`
      query GetTableByCondition(${conditionKeys.map((key, index) => `$${key}: String!`).join(', ')}) {
        ${singularTableName}(${conditionKeys.map((key) => `${key}: $${key}`).join(', ')}) {
          ${this.convertTableFields(tableName, fields)}
        }
      }
    `;

    console.log(
      'query:',
      `
      query GetTableByCondition(${conditionKeys.map((key, index) => `$${key}: String!`).join(', ')}) {
        ${singularTableName}(${conditionKeys.map((key) => `${key}: $${key}`).join(', ')}) {
          ${this.convertTableFields(tableName, fields)}
        }
      }
    `
    );

    const result = await this.query(query, condition);

    if (result.error) {
      throw result.error;
    }

    return (result.data as any)?.[singularTableName] || null;
  }

  /**
   * 订阅表数据变更 - 使用PostGraphile的listen订阅功能
   */
  subscribeToTableChanges<T extends StoreTableRow>(
    tableName: string,
    options?: SubscriptionOptions & {
      fields?: string[]; // 允许用户指定需要订阅的字段
      initialEvent?: boolean; // 是否立即触发初始事件
      first?: number; // 限制返回的记录数
      topicPrefix?: string; // 自定义topic前缀，默认使用表名
    }
  ): Observable<SubscriptionResult<{ listen: { query: any } }>> {
    // PostGraphile会自动为所有topic添加 'postgraphile:' 前缀
    // 所以这里我们使用更简洁的topic命名
    const topic = options?.topicPrefix
      ? `${options.topicPrefix}${tableName}`
      : `store_${tableName}`;

    const pluralTableName = this.getPluralTableName(tableName); // 确保使用复数形式
    const fields = this.convertTableFields(tableName, options?.fields);

    const subscription = gql`
      subscription ListenToTableChanges($topic: String!, $initialEvent: Boolean) {
        listen(topic: $topic, initialEvent: $initialEvent) {
          query {
            ${pluralTableName}(first: ${options?.first || 10}, orderBy: UPDATED_AT_DESC) {
              totalCount
              nodes {
                ${fields}
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `;

    return this.subscribe(
      subscription,
      {
        topic,
        initialEvent: options?.initialEvent || false,
      },
      options
    );
  }

  /**
   * 高级listen订阅 - 支持自定义查询
   */
  subscribeWithListen<T = any>(
    topic: string,
    query: string,
    options?: SubscriptionOptions & {
      initialEvent?: boolean;
      variables?: Record<string, any>;
    }
  ): Observable<SubscriptionResult<{ listen: { query: T } }>> {
    const subscription = gql`
      subscription CustomListenSubscription($topic: String!, $initialEvent: Boolean) {
        listen(topic: $topic, initialEvent: $initialEvent) {
          query {
            ${query}
          }
        }
      }
    `;

    return this.subscribe(
      subscription,
      {
        topic,
        initialEvent: options?.initialEvent || false,
        ...options?.variables,
      },
      options
    );
  }

  /**
   * 订阅特定条件的数据变更
   */
  subscribeToFilteredTableChanges<T extends StoreTableRow>(
    tableName: string,
    filter?: Record<string, any>,
    options?: SubscriptionOptions & {
      fields?: string[];
      initialEvent?: boolean;
      orderBy?: OrderBy[];
      first?: number;
      topicPrefix?: string; // 自定义topic前缀
    }
  ): Observable<SubscriptionResult<{ listen: { query: any } }>> {
    // 改进topic命名，支持自定义前缀
    const topic = options?.topicPrefix
      ? `${options.topicPrefix}${tableName}`
      : `store_${tableName}`;

    const pluralTableName = this.getPluralTableName(tableName); // 确保使用复数形式
    const fields = this.convertTableFields(tableName, options?.fields);
    const orderByEnum = convertOrderByToEnum(options?.orderBy);
    const first = options?.first || 10;

    const subscription = gql`
      subscription FilteredListenSubscription(
        $topic: String!, 
        $initialEvent: Boolean,
        $filter: ${this.getFilterTypeName(tableName)},
        $orderBy: [${this.getOrderByTypeName(tableName)}!],
        $first: Int
      ) {
        listen(topic: $topic, initialEvent: $initialEvent) {
          query {
            ${pluralTableName}(
              first: $first, 
              filter: $filter, 
              orderBy: $orderBy
            ) {
              totalCount
              nodes {
                ${fields}
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `;

    return this.subscribe(
      subscription,
      {
        topic,
        initialEvent: options?.initialEvent || false,
        filter,
        orderBy: orderByEnum,
        first,
      },
      options
    );
  }

  /**
   * 订阅多个表的数据变更 - 支持表名列表批量订阅
   */
  subscribeToMultipleTables<T extends StoreTableRow>(
    tableConfigs: MultiTableSubscriptionConfig[],
    globalOptions?: SubscriptionOptions
  ): Observable<MultiTableSubscriptionData> {
    return new Observable((observer: any) => {
      const subscriptions: Array<{ tableName: string; subscription: any }> = [];
      const latestData: MultiTableSubscriptionData = {};

      // 为每个表创建独立的订阅
      tableConfigs.forEach(({ tableName, options }) => {
        const subscription = this.subscribeToFilteredTableChanges<T>(
          tableName,
          options?.filter,
          {
            ...options,
            onData: (data) => {
              // 更新该表的最新数据
              latestData[tableName] = data;

              // 调用表级别的回调
              if (options?.onData) {
                options.onData(data);
              }

              // 调用全局回调
              if (globalOptions?.onData) {
                globalOptions.onData(latestData);
              }

              // 发送完整的多表数据
              observer.next({ ...latestData });
            },
            onError: (error) => {
              // 调用表级别的错误回调
              if (options?.onError) {
                options.onError(error);
              }

              // 调用全局错误回调
              if (globalOptions?.onError) {
                globalOptions.onError(error);
              }

              // 发送错误
              observer.error(error);
            },
          }
        );

        subscriptions.push({ tableName, subscription });
      });

      // 启动所有订阅
      const activeSubscriptions = subscriptions.map(({ subscription }) =>
        subscription.subscribe()
      );

      // 返回清理函数
      return () => {
        activeSubscriptions.forEach((sub) => sub.unsubscribe());

        // 调用完成回调
        if (globalOptions?.onComplete) {
          globalOptions.onComplete();
        }
      };
    });
  }

  /**
   * 简化版多表订阅 - 支持表名数组和统一配置
   */
  subscribeToTableList<T extends StoreTableRow>(
    tableNames: string[],
    options?: SubscriptionOptions & {
      fields?: string[];
      filter?: Record<string, any>;
      initialEvent?: boolean;
      first?: number;
      topicPrefix?: string;
    }
  ): Observable<MultiTableSubscriptionData> {
    const tableConfigs: MultiTableSubscriptionConfig[] = tableNames.map(
      (tableName) => ({
        tableName,
        options: {
          ...options,
          // 为每个表使用相同的配置
          fields: options?.fields,
          filter: options?.filter,
          initialEvent: options?.initialEvent,
          first: options?.first,
          topicPrefix: options?.topicPrefix,
        },
      })
    );

    return this.subscribeToMultipleTables<T>(tableConfigs, options);
  }

  /**
   * 构建动态查询 - 已适配去掉store前缀的API
   */
  buildQuery(
    tableName: string,
    fields: string[],
    params?: {
      filter?: Record<string, any>;
      orderBy?: OrderBy[];
      first?: number;
      after?: string;
    }
  ): TypedDocumentNode {
    const pluralTableName = this.getPluralTableName(tableName); // 确保使用复数形式
    const fieldSelection = fields.join('\n        ');

    return gql`
      query DynamicQuery(
        $first: Int
        $after: Cursor
        $filter: ${this.getFilterTypeName(tableName)}
        $orderBy: [${this.getOrderByTypeName(tableName)}!]
      ) {
        ${pluralTableName}(
          first: $first
          after: $after
          filter: $filter
          orderBy: $orderBy
        ) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ${fieldSelection}
            }
          }
        }
      }
    `;
  }

  /**
   * 批量查询多个表 - 已适配去掉store前缀的API
   */
  async batchQuery<T extends Record<string, any>>(
    queries: Array<{
      key: string;
      tableName: string;
      params?: BaseQueryParams & {
        filter?: Record<string, any>;
        orderBy?: OrderBy[];
        fields?: string[]; // 允许用户指定需要查询的字段
      };
    }>
  ): Promise<Record<string, Connection<StoreTableRow>>> {
    const batchPromises = queries.map(async ({ key, tableName, params }) => {
      const result = await this.getAllTables(tableName, params);
      return { key, result };
    });

    const results = await Promise.all(batchPromises);

    return results.reduce(
      (acc, { key, result }) => {
        acc[key] = result;
        return acc;
      },
      {} as Record<string, Connection<StoreTableRow>>
    );
  }

  /**
   * 实时数据流监听 - 已适配去掉store前缀的API
   */
  createRealTimeDataStream<T extends StoreTableRow>(
    tableName: string,
    initialQuery?: BaseQueryParams & { filter?: Record<string, any> }
  ): Observable<Connection<T>> {
    return new Observable((observer: any) => {
      // 首先执行初始查询
      this.getAllTables<T>(tableName, initialQuery)
        .then((initialData) => {
          observer.next(initialData);
        })
        .catch((error) => observer.error(error));

      // 然后订阅实时更新
      const subscription = this.subscribeToTableChanges<T>(tableName, {
        onData: () => {
          // 当有数据变更时，重新执行查询
          this.getAllTables<T>(tableName, initialQuery)
            .then((updatedData) => {
              observer.next(updatedData);
            })
            .catch((error) => observer.error(error));
        },
        onError: (error) => observer.error(error),
      });

      return () => subscription.subscribe().unsubscribe();
    });
  }

  // 改进的表名处理方法
  private getFilterTypeName(tableName: string): string {
    // 转换为单数形式并应用PascalCase转换
    const singularName = this.getSingularTableName(tableName);
    const pascalCaseName = this.toPascalCase(singularName);

    // 如果已经以Store开头，就不再添加Store前缀
    if (pascalCaseName.startsWith('Store')) {
      return `${pascalCaseName}Filter`;
    }

    return `Store${pascalCaseName}Filter`;
  }

  private getOrderByTypeName(tableName: string): string {
    // 转换为复数形式并应用PascalCase转换
    const pluralName = this.getPluralTableName(tableName);
    const pascalCaseName = this.toPascalCase(pluralName);

    // 如果已经以Store开头，就不再添加Store前缀
    if (pascalCaseName.startsWith('Store')) {
      return `${pascalCaseName}OrderBy`;
    }

    return `Store${pascalCaseName}OrderBy`;
  }

  /**
   * 将单数表名转换为复数形式（使用pluralize库确保正确性）
   */
  private getPluralTableName(tableName: string): string {
    // 先转换为camelCase
    const camelCaseName = this.toCamelCase(tableName);

    // 使用pluralize库进行复数化
    return pluralize.plural(camelCaseName);
  }

  /**
   * 将复数表名转换为单数形式（使用pluralize库确保正确性）
   */
  private getSingularTableName(tableName: string): string {
    // 先转换为camelCase
    const camelCaseName = this.toCamelCase(tableName);

    // 使用pluralize库进行单数化
    return pluralize.singular(camelCaseName);
  }

  /**
   * 转换snake_case到camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * 转换snake_case到PascalCase
   */
  private toPascalCase(str: string): string {
    const camelCase = this.toCamelCase(str);
    return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
  }

  /**
   * 转换camelCase或snake_case到SNAKE_CASE（用于GraphQL枚举值）
   * 例如：updatedAt -> UPDATED_AT, updated_at -> UPDATED_AT
   */
  private toSnakeCase(str: string): string {
    // 如果已经是snake_case，直接转大写
    if (str.includes('_')) {
      return str.toUpperCase();
    }

    // 如果是camelCase，先转换为snake_case再转大写
    return str
      .replace(/([A-Z])/g, '_$1') // 在大写字母前添加下划线
      .toLowerCase() // 转小写
      .replace(/^_/, '') // 移除开头的下划线
      .toUpperCase(); // 转大写
  }

  // private buildSingleQueryName(
  //   tableName: string,
  //   conditionKeys: string[]
  // ): string {
  //   // 使用camelCase转换
  //   const camelCaseTableName = this.toCamelCase(tableName);
  //   const capitalizedKeys = conditionKeys.map(
  //     (key) => key.charAt(0).toUpperCase() + key.slice(1)
  //   );
  //   return `${camelCaseTableName}By${capitalizedKeys.join('And')}`;
  // }

  /**
   * 清除Apollo Client缓存
   */
  async clearCache(): Promise<void> {
    await this.apolloClient.clearStore();
  }

  /**
   * 重置Apollo Client缓存
   */
  async resetCache(): Promise<void> {
    await this.apolloClient.resetStore();
  }

  /**
   * 获取Apollo Client实例（用于高级用法）
   */
  getApolloClient(): ApolloClient<NormalizedCacheObject> {
    return this.apolloClient;
  }

  /**
   * 关闭客户端连接
   */
  close(): void {
    if (this.subscriptionClient) {
      this.subscriptionClient.dispose();
    }
  }

  /**
   * 获取 Dubhe 配置
   */
  getDubheConfig(): DubheConfig | undefined {
    return this.dubheConfig;
  }

  /**
   * 构建动态缓存字段配置
   */
  private buildCacheFields(
    cacheConfig?: DubheClientConfig['cacheConfig']
  ): Record<string, any> {
    const fields: Record<string, any> = {};

    // 如果没有配置，返回空的字段配置
    if (!cacheConfig) {
      return fields;
    }

    // 为每个配置的表创建分页缓存策略
    if (cacheConfig.paginatedTables) {
      cacheConfig.paginatedTables.forEach((tableName) => {
        // 确保使用复数形式的表名
        const pluralTableName = this.getPluralTableName(tableName);

        // 检查是否有自定义合并策略
        const customStrategy =
          cacheConfig.customMergeStrategies?.[pluralTableName];

        fields[pluralTableName] = {
          keyArgs: customStrategy?.keyArgs || ['filter', 'orderBy'],
          merge: customStrategy?.merge || this.defaultMergeStrategy,
        };
      });
    }

    // 应用自定义合并策略（如果有的话）
    if (cacheConfig.customMergeStrategies) {
      Object.entries(cacheConfig.customMergeStrategies).forEach(
        ([tableName, strategy]) => {
          // 如果表名还没有被配置过，添加它
          if (!fields[tableName]) {
            fields[tableName] = {
              keyArgs: strategy.keyArgs || ['filter', 'orderBy'],
              merge: strategy.merge || this.defaultMergeStrategy,
            };
          }
        }
      );
    }

    return fields;
  }

  /**
   * 默认的分页合并策略
   */
  private defaultMergeStrategy(existing = { edges: [] }, incoming: any) {
    // 安全检查，确保incoming有edges属性
    if (!incoming || !Array.isArray(incoming.edges)) {
      return existing;
    }
    return {
      ...incoming,
      edges: [...(existing.edges || []), ...incoming.edges],
    };
  }

  /**
   * 从dubhe配置中解析表信息
   */
  private parseTableInfoFromConfig(): void {
    if (!this.dubheConfig?.components) {
      return;
    }

    const { components, enums = {} } = this.dubheConfig;

    Object.entries(components).forEach(([componentName, component]) => {
      const tableName = this.toSnakeCase(componentName); // 转换为snake_case表名

      // 获取字段列表
      const fields: string[] = [];
      const enumFields: Record<string, string[]> = {};

      // 处理不同类型的组件定义
      if (typeof component === 'string') {
        // 如果组件是字符串（MoveType），创建一个value字段
        fields.push('id', 'value');
      } else if (Object.keys(component).length === 0) {
        // EmptyComponent - 只有id字段
        fields.push('id');
      } else {
        // Component 类型
        // 分析主键配置
        if (!('keys' in component)) {
          // keys未定义 → 添加默认id字段
          fields.push('id');
        } else if (component.keys && component.keys.length > 0) {
          // keys指定了字段 → 不添加默认id（主键字段会在下面处理）
          // 不添加id
        } else {
          // keys: [] → 明确指定无主键，不添加id
          // 不添加id
        }

        // 添加用户定义的字段
        if (component.fields) {
          Object.entries(component.fields).forEach(([fieldName, fieldType]) => {
            const fieldNameCamelCase = this.toCamelCase(fieldName);
            fields.push(fieldNameCamelCase);

            // 检查是否是枚举类型（根据sui-common，fieldType是MoveType字符串）
            const typeStr = String(fieldType);
            if (enums[typeStr]) {
              enumFields[fieldNameCamelCase] = enums[typeStr];
            }
          });
        }
      }

      // 添加系统字段
      fields.push('createdAt', 'updatedAt');

      // 确定主键
      let primaryKeys: string[] = [];
      let hasDefaultId = false;

      if (
        typeof component === 'string' ||
        Object.keys(component).length === 0
      ) {
        // 字符串类型和空组件都使用id作为主键
        primaryKeys = ['id'];
        hasDefaultId = true;
      } else if (!('keys' in component)) {
        // Component类型但没有定义keys，使用默认id
        primaryKeys = ['id'];
        hasDefaultId = true;
      } else if (!component.keys || component.keys.length === 0) {
        // keys: [] 明确指定无主键
        primaryKeys = [];
        hasDefaultId = false;
      } else {
        // 使用自定义主键
        primaryKeys = component.keys.map((key) => this.toCamelCase(key));
      }

      const tableInfo: ParsedTableInfo = {
        tableName,
        fields: [...new Set(fields)], // 去重
        primaryKeys,
        hasDefaultId,
        enumFields,
      };

      this.parsedTables.set(tableName, tableInfo);
      // 同时用camelCase版本作为key存储，方便查找
      this.parsedTables.set(this.toCamelCase(tableName), tableInfo);
    });
  }

  /**
   * 获取表的字段信息
   */
  getTableFields(tableName: string): string[] {
    // 直接使用getMinimalFields，逻辑更清晰
    return this.getMinimalFields(tableName);
  }

  /**
   * 获取表的主键信息
   */
  getTablePrimaryKeys(tableName: string): string[] {
    const tableInfo =
      this.parsedTables.get(tableName) ||
      this.parsedTables.get(this.toSnakeCase(tableName));
    return tableInfo?.primaryKeys || [];
  }

  /**
   * 获取表的枚举字段信息
   */
  getTableEnumFields(tableName: string): Record<string, string[]> {
    const tableInfo =
      this.parsedTables.get(tableName) ||
      this.parsedTables.get(this.toSnakeCase(tableName));
    return tableInfo?.enumFields || {};
  }

  /**
   * 获取所有解析的表信息
   */
  getAllTableInfo(): Map<string, ParsedTableInfo> {
    return new Map(this.parsedTables);
  }

  /**
   * 检查表是否有默认id字段
   */
  hasDefaultId(tableName: string): boolean {
    const tableInfo =
      this.parsedTables.get(tableName) ||
      this.parsedTables.get(this.toSnakeCase(tableName));
    return tableInfo?.hasDefaultId || false;
  }

  /**
   * 获取表的最小字段集（用于fallback）
   */
  getMinimalFields(tableName: string): string[] {
    // 如果有配置，使用配置中的字段
    const tableInfo =
      this.parsedTables.get(tableName) ||
      this.parsedTables.get(this.toSnakeCase(tableName));

    if (tableInfo) {
      return tableInfo.fields;
    }

    // 如果没有配置，返回最保守的字段集
    // 只包含系统字段，因为不确定表结构
    return ['createdAt', 'updatedAt'];
  }

  /**
   * 转换表字段为GraphQL查询字符串
   */
  private convertTableFields(
    tableName: string,
    customFields?: string[]
  ): string {
    let fields: string[];
    let source: string;

    if (customFields && customFields.length > 0) {
      fields = customFields;
      source = '用户指定';
    } else {
      // 尝试从dubhe配置中获取字段
      const autoFields = this.getTableFields(tableName);
      if (autoFields.length > 0) {
        fields = autoFields;
        source = 'dubhe配置';
      } else {
        fields = ['createdAt', 'updatedAt'];
        source = '默认字段';
      }
    }

    console.log(`  📋 字段解析 - 表: ${tableName}`, {
      source,
      fields: fields.join(', '),
      count: fields.length,
    });

    return fields.join('\n      ');
  }
}

// 导出便利函数
export function createDubheGraphqlClient(
  config: DubheClientConfig
): DubheGraphqlClient {
  return new DubheGraphqlClient(config);
}

/**
 * 导出类型以便外部使用
 */
export type { DubheClientConfig } from './types';

// 导出常用的GraphQL查询构建器
export const QueryBuilders = {
  // 构建基础查询 - 已适配去掉store前缀的API
  basic: (
    tableName: string,
    fields: string[] = ['createdAt', 'updatedAt']
  ) => gql`
    query Basic${tableName.charAt(0).toUpperCase() + tableName.slice(1)}Query(
      $first: Int
      $after: String
      $filter: ${tableName.charAt(0).toUpperCase() + tableName.slice(1)}Filter
    ) {
      ${tableName}(first: $first, after: $after, filter: $filter) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            ${fields.join('\n            ')}
          }
        }
      }
    }
  `,

  // 构建订阅查询 - 已适配去掉store前缀的API
  subscription: (tableName: string) => gql`
    subscription ${tableName.charAt(0).toUpperCase() + tableName.slice(1)}Subscription {
      ${tableName.charAt(0).toLowerCase() + tableName.slice(1)}Changed {
        createdAt
        updatedAt
      }
    }
  `,
};

/**
 * 辅助函数：转换OrderBy格式
 * 支持camelCase和snake_case字段名转换为GraphQL枚举值
 * 例如：updatedAt -> UPDATED_AT_ASC, updated_at -> UPDATED_AT_ASC
 */
function convertOrderByToEnum(orderBy?: OrderBy[]): string[] {
  if (!orderBy || orderBy.length === 0) {
    return ['NATURAL'];
  }

  return orderBy.map((order) => {
    // 使用统一的转换函数处理字段名
    const field = toSnakeCaseForEnum(order.field);
    const direction = order.direction === 'DESC' ? 'DESC' : 'ASC';

    // 将字段名和方向组合成枚举值
    return `${field}_${direction}`;
  });
}

/**
 * 转换camelCase或snake_case到SNAKE_CASE（用于GraphQL枚举值）
 * 例如：updatedAt -> UPDATED_AT, updated_at -> UPDATED_AT
 */
function toSnakeCaseForEnum(str: string): string {
  // 如果已经是snake_case，直接转大写
  if (str.includes('_')) {
    return str.toUpperCase();
  }

  // 如果是camelCase，先转换为snake_case再转大写
  return str
    .replace(/([A-Z])/g, '_$1') // 在大写字母前添加下划线
    .toLowerCase() // 转小写
    .replace(/^_/, '') // 移除开头的下划线
    .toUpperCase(); // 转大写
}

// 动态获取表字段的函数 - 真正通用化
function convertTableFields(customFields?: string[]): string {
  if (customFields && customFields.length > 0) {
    // 如果用户指定了字段，使用用户指定的字段
    return customFields.join('\n    ');
  }

  // 默认只查询 updatedAt，因为 nodeId 不是所有表都有
  // 其他字段应该由用户根据实际需要指定
  return 'updatedAt';
}
