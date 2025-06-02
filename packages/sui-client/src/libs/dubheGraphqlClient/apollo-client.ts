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

// 预定义的GraphQL查询片段
const STORE_TABLE_FIELDS = gql`
  fragment StoreTableFields on Node {
    id
    ... on StoreTableRow {
      createdAt
      updatedAt
    }
  }
`;

const PAGE_INFO_FIELDS = gql`
  fragment PageInfoFields on PageInfo {
    hasNextPage
    hasPreviousPage
    startCursor
    endCursor
  }
`;

const CONNECTION_FIELDS = gql`
  fragment ConnectionFields on Connection {
    totalCount
    pageInfo {
      ...PageInfoFields
    }
    edges {
      cursor
      node {
        id
      }
    }
  }
  ${PAGE_INFO_FIELDS}
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

    let link: ApolloLink = httpLink;

    // 如果提供了订阅端点，创建WebSocket Link
    if (config.subscriptionEndpoint) {
      this.subscriptionClient = createClient({
        url: config.subscriptionEndpoint,
        connectionParams: {
          headers: config.headers,
        },
      });

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
        httpLink
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
              // 支持分页查询的缓存合并
              allStoreTables: {
                keyArgs: ['filter', 'orderBy'],
                merge(existing = { edges: [] }, incoming) {
                  return {
                    ...incoming,
                    edges: [...existing.edges, ...incoming.edges],
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
          : 'cache-first',
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
   * 获取所有Store表数据（通用查询方法）
   */
  async getAllStoreTables<T extends StoreTableRow>(
    tableName: string,
    params?: BaseQueryParams & {
      filter?: Record<string, any>;
      orderBy?: OrderBy[];
    }
  ): Promise<Connection<T>> {
    const query = gql`
      query GetAllStoreTables(
        $tableName: String!
        $first: Int
        $last: Int
        $after: String
        $before: String
        $filter: ${tableName}Filter
        $orderBy: [${tableName}sOrderBy!]
      ) {
        allStoreTables: all${tableName}s(
          first: $first
          last: $last
          after: $after
          before: $before
          filter: $filter
          orderBy: $orderBy
        ) {
          ...ConnectionFields
          edges {
            cursor
            node {
              ...StoreTableFields
            }
          }
        }
      }
      ${CONNECTION_FIELDS}
      ${STORE_TABLE_FIELDS}
    `;

    const result = await this.query(query, {
      tableName,
      ...params,
    });

    if (result.error) {
      throw result.error;
    }

    return (
      (result.data as any)?.allStoreTables || {
        edges: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      }
    );
  }

  /**
   * 根据ID获取单个Store表记录
   */
  async getStoreTableById<T extends StoreTableRow>(
    tableName: string,
    id: string
  ): Promise<T | null> {
    const query = gql`
      query GetStoreTableById($tableName: String!, $id: ID!) {
        storeTableById: ${tableName}ById(id: $id) {
          ...StoreTableFields
        }
      }
      ${STORE_TABLE_FIELDS}
    `;

    const result = await this.query(query, { tableName, id });

    if (result.error) {
      throw result.error;
    }

    return (result.data as any)?.storeTableById || null;
  }

  /**
   * 订阅Store表数据变更
   */
  subscribeToStoreTableChanges<T extends StoreTableRow>(
    tableName: string,
    options?: SubscriptionOptions
  ): Observable<SubscriptionResult<{ storeTableChanged: T }>> {
    const subscription = gql`
      subscription SubscribeToStoreTableChanges($tableName: String!) {
        storeTableChanged: ${tableName}Changed(tableName: $tableName) {
          ...StoreTableFields
        }
      }
      ${STORE_TABLE_FIELDS}
    `;

    return this.subscribe(subscription, { tableName }, options);
  }

  /**
   * 构建动态查询
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
        $after: String
        $filter: ${tableName}Filter
        $orderBy: [${tableName}sOrderBy!]
      ) {
        all${tableName}s(
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
   * 高级过滤查询构建器
   */
  createFilterBuilder<T extends StoreTableRow>(tableName: string) {
    return {
      where: (conditions: Record<string, any>) => ({
        query: this.buildQuery(tableName, ['id', 'createdAt', 'updatedAt'], {
          filter: conditions,
        }),
        variables: { filter: conditions },
      }),

      orderBy: (orders: OrderBy[]) => ({
        query: this.buildQuery(tableName, ['id', 'createdAt', 'updatedAt'], {
          orderBy: orders,
        }),
        variables: { orderBy: orders },
      }),

      paginate: (first?: number, after?: string) => ({
        query: this.buildQuery(tableName, ['id', 'createdAt', 'updatedAt'], {
          first,
          after,
        }),
        variables: { first, after },
      }),
    };
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

  /**
   * 批量查询多个表
   */
  async batchQuery<T extends Record<string, any>>(
    queries: Array<{
      key: string;
      tableName: string;
      params?: BaseQueryParams & { filter?: Record<string, any> };
    }>
  ): Promise<Record<string, Connection<StoreTableRow>>> {
    const batchPromises = queries.map(async ({ key, tableName, params }) => {
      const result = await this.getAllStoreTables(tableName, params);
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
   * 实时数据流监听
   */
  createRealTimeDataStream<T extends StoreTableRow>(
    tableName: string,
    initialQuery?: BaseQueryParams & { filter?: Record<string, any> }
  ): Observable<Connection<T>> {
    return new Observable((observer: any) => {
      // 首先执行初始查询
      this.getAllStoreTables<T>(tableName, initialQuery)
        .then((initialData) => {
          observer.next(initialData);
        })
        .catch((error) => observer.error(error));

      // 然后订阅实时更新
      const subscription = this.subscribeToStoreTableChanges<T>(tableName, {
        onData: () => {
          // 当有数据变更时，重新执行查询
          this.getAllStoreTables<T>(tableName, initialQuery)
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
}

// 导出便利函数
export function createDubheGraphqlClient(
  config: DubheClientConfig
): DubheGraphqlClient {
  return new DubheGraphqlClient(config);
}

// 导出常用的GraphQL查询构建器
export const QueryBuilders = {
  // 构建基础查询
  basic: (
    tableName: string,
    fields: string[] = ['id', 'createdAt', 'updatedAt']
  ) => gql`
    query Basic${tableName}Query(
      $first: Int
      $after: String
      $filter: ${tableName}Filter
    ) {
      all${tableName}s(first: $first, after: $after, filter: $filter) {
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

  // 构建订阅查询
  subscription: (tableName: string) => gql`
    subscription ${tableName}Subscription {
      ${tableName}Changed {
        id
        createdAt
        updatedAt
      }
    }
  `,
};
