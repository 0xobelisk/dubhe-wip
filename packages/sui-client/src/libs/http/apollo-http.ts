import {
  ApolloClient,
  InMemoryCache,
  gql,
  createHttpLink,
  NormalizedCacheObject,
  ApolloQueryResult,
  DocumentNode,
} from '@apollo/client';
import { BaseError, HttpError, GraphQLError, ParseError } from './errors';

export type FetchOptions = RequestInit & {
  next?: {
    revalidate?: boolean | number;
  };
};

export class ApolloHttp {
  private apolloClient: ApolloClient<NormalizedCacheObject>;
  private restEndpoint: string;
  private defaultOptions?: FetchOptions;

  constructor(
    apiEndpoint: string,
    restEndpoint: string,
    private customFetch?: typeof fetch,
    defaultOptions?: FetchOptions
  ) {
    this.restEndpoint = restEndpoint;
    this.defaultOptions = defaultOptions;

    // 创建 HTTP Link
    const httpLink = createHttpLink({
      uri: apiEndpoint,
      fetch: this.customFetch,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // 创建 Apollo Client 实例
    this.apolloClient = new ApolloClient({
      link: httpLink,
      cache: new InMemoryCache(),
      defaultOptions: {
        watchQuery: {
          errorPolicy: 'all',
        },
        query: {
          errorPolicy: 'all',
        },
      },
    });
  }

  private getFetch() {
    return this.customFetch || fetch;
  }

  async fetch(url: string): Promise<Response> {
    try {
      const fetchFn = this.getFetch();
      const response = await fetchFn(url, {
        ...this.defaultOptions,
      });

      if (!response.ok) {
        throw new HttpError(
          `HTTP error! status: ${response.status}`,
          response.status
        );
      }

      return response;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(`Failed to fetch: ${(error as Error).message}`, 500);
    }
  }

  /**
   * 使用 Apollo Client 执行 GraphQL 查询
   */
  async query<T>(
    query: DocumentNode,
    variables?: Record<string, any>
  ): Promise<T> {
    try {
      const result: ApolloQueryResult<T> = await this.apolloClient.query({
        query,
        variables,
        fetchPolicy: 'cache-first',
      });

      if (result.errors && result.errors.length > 0) {
        throw new GraphQLError(
          result.errors[0]?.message || 'GraphQL query failed'
        );
      }

      return result.data;
    } catch (error: any) {
      if (error instanceof BaseError) {
        throw error;
      }
      if (error.networkError) {
        throw new HttpError(
          `Network error: ${error.networkError.message}`,
          error.networkError.statusCode || 500
        );
      }
      if (error.graphQLErrors && error.graphQLErrors.length > 0) {
        throw new GraphQLError(
          error.graphQLErrors[0]?.message || 'GraphQL query failed'
        );
      }
      throw new HttpError(
        `Failed to execute GraphQL query: ${error.message}`,
        500
      );
    }
  }

  /**
   * 为了保持向后兼容性，保留原有的 fetchGraphql 方法
   */
  async fetchGraphql<T>(
    queryString: string,
    after: string,
    limit: number | null = 10
  ): Promise<T> {
    try {
      const isFirstPage = after === 'first';
      const variables: Record<string, any> = {
        limit,
        after: isFirstPage ? undefined : after,
      };

      const query = gql(queryString);
      const result = await this.query<T>(query, variables);
      // 包装结果以匹配原有格式
      return result;
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw new HttpError(
        `Failed to fetch GraphQL: ${(error as Error).message}`,
        500
      );
    }
  }

  /**
   * 使用类型化的 GraphQL 查询
   */
  async typedQuery<T>(
    query: DocumentNode,
    variables?: Record<string, any>
  ): Promise<T> {
    return this.query<T>(query, variables);
  }

  async fetchRest(path: string): Promise<any> {
    try {
      const fetchFn = this.getFetch();
      const response = await fetchFn(`${this.restEndpoint}${path}`, {
        ...this.defaultOptions,
      });

      if (!response.ok) {
        throw new HttpError(
          `HTTP error! status: ${response.status}`,
          response.status
        );
      }

      try {
        return await response.json();
      } catch (error) {
        throw new ParseError('Failed to parse JSON response');
      }
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      throw new HttpError(
        `Failed to fetch REST: ${(error as Error).message}`,
        500
      );
    }
  }

  /**
   * 清除 Apollo Client 缓存
   */
  async clearCache(): Promise<void> {
    await this.apolloClient.clearStore();
  }

  /**
   * 重置 Apollo Client 缓存
   */
  async resetCache(): Promise<void> {
    await this.apolloClient.resetStore();
  }

  /**
   * 获取 Apollo Client 实例（如果需要直接访问）
   */
  getApolloClient(): ApolloClient<NormalizedCacheObject> {
    return this.apolloClient;
  }
}
