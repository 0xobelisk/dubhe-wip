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
} from './types';
import { parseValue } from './utils';

// GraphQL fragments - 通用化设计
const CONNECTION_FIELDS = gql`
  fragment ConnectionFields on Node {
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    totalCount
  }
`;

// 通用的表字段 fragment - 不硬编码具体类型
const TABLE_FIELDS = gql`
  fragment TableFields on Node {
    nodeId
  }
`;

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

  constructor(config: DubheClientConfig) {
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
      cache: new InMemoryCache({
        typePolicies: {
          // 为Connection类型配置缓存策略
          Query: {
            fields: {
              // 支持分页查询的缓存合并（适配新的表名）
              accounts: {
                keyArgs: ['filter', 'orderBy'],
                merge(existing = { edges: [] }, incoming) {
                  // 安全检查，确保incoming有edges属性
                  if (!incoming || !Array.isArray(incoming.edges)) {
                    return existing;
                  }
                  return {
                    ...incoming,
                    edges: [...(existing.edges || []), ...incoming.edges],
                  };
                },
              },
              encounters: {
                keyArgs: ['filter', 'orderBy'],
                merge(existing = { edges: [] }, incoming) {
                  // 安全检查，确保incoming有edges属性
                  if (!incoming || !Array.isArray(incoming.edges)) {
                    return existing;
                  }
                  return {
                    ...incoming,
                    edges: [...(existing.edges || []), ...incoming.edges],
                  };
                },
              },
              positions: {
                keyArgs: ['filter', 'orderBy'],
                merge(existing = { edges: [] }, incoming) {
                  // 安全检查，确保incoming有edges属性
                  if (!incoming || !Array.isArray(incoming.edges)) {
                    return existing;
                  }
                  return {
                    ...incoming,
                    edges: [...(existing.edges || []), ...incoming.edges],
                  };
                },
              },
              mapConfigs: {
                keyArgs: ['filter', 'orderBy'],
                merge(existing = { edges: [] }, incoming) {
                  // 安全检查，确保incoming有edges属性
                  if (!incoming || !Array.isArray(incoming.edges)) {
                    return existing;
                  }
                  return {
                    ...incoming,
                    edges: [...(existing.edges || []), ...incoming.edges],
                  };
                },
              },
            },
          },
        },
      }),
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
   * 获取表数据（通用查询方法）- 已适配去掉store前缀的API
   */
  async getAllTables<T extends StoreTableRow>(
    tableName: string,
    params?: BaseQueryParams & {
      filter?: Record<string, any>;
      orderBy?: OrderBy[];
      fields?: string[]; // 允许用户指定需要查询的字段
    }
  ): Promise<Connection<T>> {
    // 转换OrderBy为枚举值
    const orderByEnums = convertOrderByToEnum(tableName, params?.orderBy);

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
        ${tableName}(
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
              ${getTableFields(tableName, params?.fields)}
            }
          }
        }
      }
    `;

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
      (result.data as any)?.[tableName] || {
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
    const queryFieldName = this.buildSingleQueryName(tableName, conditionKeys);

    const query = gql`
      query GetTableByCondition(${conditionKeys.map((key, index) => `$${key}: String!`).join(', ')}) {
        ${queryFieldName}(${conditionKeys.map((key) => `${key}: $${key}`).join(', ')}) {
          ${getTableFields(tableName, fields)}
        }
      }
    `;

    const result = await this.query(query, condition);

    if (result.error) {
      throw result.error;
    }

    return (result.data as any)?.[queryFieldName] || null;
  }

  /**
   * 订阅表数据变更 - 已适配去掉store前缀的API
   */
  subscribeToTableChanges<T extends StoreTableRow>(
    tableName: string,
    options?: SubscriptionOptions & {
      fields?: string[]; // 允许用户指定需要订阅的字段
    }
  ): Observable<SubscriptionResult<{ [key: string]: T }>> {
    // 订阅字段名和查询字段名相同，不需要"Changed"后缀
    const subscriptionName = tableName;

    const subscription = gql`
      subscription SubscribeToTableChanges {
        ${subscriptionName} {
          ${getTableFields(tableName, options?.fields)}
        }
      }
    `;

    return this.subscribe(subscription, {}, options);
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
    const fieldSelection = fields.join('\n        ');

    return gql`
      query DynamicQuery(
        $first: Int
        $after: Cursor
        $filter: ${this.getFilterTypeName(tableName)}
        $orderBy: [${this.getOrderByTypeName(tableName)}!]
      ) {
        ${tableName}(
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
      params?: BaseQueryParams & { filter?: Record<string, any> };
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

  // 私有辅助方法 - 通用化处理
  private getFilterTypeName(tableName: string): string {
    // 动态推断Filter类型名
    // 将 encounters -> StoreEncounterFilter
    // 将 accounts -> StoreAccountFilter
    // 规则：tableName 去掉复数形式，首字母大写，加上Store前缀和Filter后缀
    const singularName = tableName.endsWith('s')
      ? tableName.slice(0, -1)
      : tableName;
    const capitalizedName =
      singularName.charAt(0).toUpperCase() + singularName.slice(1);
    return `Store${capitalizedName}Filter`;
  }

  private getOrderByTypeName(tableName: string): string {
    // 动态推断OrderBy类型名
    // 将 encounters -> StoreEncountersOrderBy
    // 将 accounts -> StoreAccountsOrderBy
    // 规则：tableName 首字母大写，加上Store前缀和OrderBy后缀
    const capitalizedName =
      tableName.charAt(0).toUpperCase() + tableName.slice(1);
    return `Store${capitalizedName}OrderBy`;
  }

  private buildSingleQueryName(
    tableName: string,
    conditionKeys: string[]
  ): string {
    const capitalizedKeys = conditionKeys.map(
      (key) => key.charAt(0).toUpperCase() + key.slice(1)
    );
    return `${tableName.charAt(0).toLowerCase() + tableName.slice(1)}By${capitalizedKeys.join('And')}`;
  }

  // 为了向后兼容，保留旧的方法名作为别名
  /** @deprecated 请使用 getAllTables */
  async getAllStoreTables<T extends StoreTableRow>(
    tableName: string,
    params?: BaseQueryParams & {
      filter?: Record<string, any>;
      orderBy?: OrderBy[];
    }
  ): Promise<Connection<T>> {
    console.warn('getAllStoreTables is deprecated, please use getAllTables');
    return this.getAllTables(tableName, params);
  }

  /** @deprecated 请使用 getTableByCondition */
  async getStoreTableById<T extends StoreTableRow>(
    tableName: string,
    id: string
  ): Promise<T | null> {
    console.warn(
      'getStoreTableById is deprecated, please use getTableByCondition'
    );
    return this.getTableByCondition(tableName, { id });
  }

  /** @deprecated 请使用 subscribeToTableChanges */
  subscribeToStoreTableChanges<T extends StoreTableRow>(
    tableName: string,
    options?: SubscriptionOptions
  ): Observable<SubscriptionResult<{ storeTableChanged: T }>> {
    console.warn(
      'subscribeToStoreTableChanges is deprecated, please use subscribeToTableChanges'
    );
    return this.subscribeToTableChanges(tableName, options) as any;
  }

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
}

// 导出便利函数
export function createDubheGraphqlClient(
  config: DubheClientConfig
): DubheGraphqlClient {
  return new DubheGraphqlClient(config);
}

// 导出常用的GraphQL查询构建器
export const QueryBuilders = {
  // 构建基础查询 - 已适配去掉store前缀的API
  basic: (
    tableName: string,
    fields: string[] = ['id', 'createdAt', 'updatedAt']
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
        id
        createdAt
        updatedAt
      }
    }
  `,
};

// 辅助函数：转换OrderBy格式
function convertOrderByToEnum(
  tableName: string,
  orderBy?: OrderBy[]
): string[] {
  if (!orderBy || orderBy.length === 0) {
    return ['NATURAL'];
  }

  return orderBy.map((order) => {
    const field = order.field.toUpperCase();
    const direction = order.direction === 'DESC' ? 'DESC' : 'ASC';

    // 将字段名和方向组合成枚举值
    return `${field}_${direction}`;
  });
}

// 动态获取表字段的函数 - 真正通用化
function getTableFields(tableName: string, customFields?: string[]): string {
  if (customFields && customFields.length > 0) {
    // 如果用户指定了字段，使用用户指定的字段
    return customFields.join('\n    ');
  }

  // 默认只查询 nodeId，这是所有表都应该有的基础字段
  // 其他字段应该由用户根据实际需要指定
  return 'nodeId';
}
