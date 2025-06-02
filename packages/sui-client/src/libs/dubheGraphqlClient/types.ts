import { DocumentNode } from '@apollo/client';

// 基础分页信息
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

// 连接响应通用类型
export interface Connection<T> {
  edges: Array<{
    cursor: string;
    node: T;
  }>;
  pageInfo: PageInfo;
  totalCount?: number;
}

// 基础查询参数
export interface BaseQueryParams {
  first?: number;
  last?: number;
  after?: string;
  before?: string;
}

// 排序参数
export interface OrderBy {
  field: string;
  direction: 'ASC' | 'DESC';
}

// JSON路径排序参数
export interface JsonPathOrder {
  path: string;
  direction: 'ASC' | 'DESC';
  type?: 'STRING' | 'INTEGER' | 'FLOAT' | 'BOOLEAN';
}

// 查询过滤器基础类型
export interface FilterCondition {
  equalTo?: any;
  notEqualTo?: any;
  lessThan?: any;
  lessThanOrEqualTo?: any;
  greaterThan?: any;
  greaterThanOrEqualTo?: any;
  in?: any[];
  notIn?: any[];
  like?: string;
  notLike?: string;
  isNull?: boolean;
}

// 字符串过滤器
export interface StringFilter extends FilterCondition {
  like?: string;
  notLike?: string;
  ilike?: string;
  notIlike?: string;
  startsWith?: string;
  endsWith?: string;
  includes?: string;
  notIncludes?: string;
}

// 数字过滤器
export interface NumberFilter extends FilterCondition {
  lessThan?: number;
  lessThanOrEqualTo?: number;
  greaterThan?: number;
  greaterThanOrEqualTo?: number;
}

// 日期过滤器
export interface DateFilter extends FilterCondition {
  lessThan?: string;
  lessThanOrEqualTo?: string;
  greaterThan?: string;
  greaterThanOrEqualTo?: string;
}

// Store表基础类型（现在API中已去掉store前缀）
export interface StoreTableRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

// 查询构建器类型
export interface QueryBuilder<T> {
  where?: Record<string, any>;
  orderBy?: OrderBy[];
  first?: number;
  last?: number;
  after?: string;
  before?: string;
}

// 订阅类型
export interface SubscriptionOptions {
  onData?: (data: any) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

// 查询操作类型
export type QueryOperation = 'query' | 'subscription';

// 类型化的GraphQL查询
export interface TypedDocumentNode<TResult = any, TVariables = any>
  extends DocumentNode {
  __resultType?: TResult;
  __variablesType?: TVariables;
}

// 客户端配置
export interface DubheClientConfig {
  endpoint: string;
  subscriptionEndpoint?: string;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
}

// 查询缓存策略
export type CachePolicy =
  | 'cache-first'
  | 'network-only'
  | 'cache-only'
  | 'no-cache'
  | 'standby';

// 查询选项
export interface QueryOptions {
  cachePolicy?: CachePolicy;
  pollInterval?: number;
  notifyOnNetworkStatusChange?: boolean;
}

// 错误类型
export interface GraphQLFormattedError {
  message: string;
  locations?: Array<{
    line: number;
    column: number;
  }>;
  path?: Array<string | number>;
  extensions?: any;
}

// 查询结果
export interface QueryResult<TData = any> {
  data?: TData;
  loading: boolean;
  error?: Error;
  networkStatus: number;
  refetch: () => Promise<QueryResult<TData>>;
}

// 订阅结果
export interface SubscriptionResult<TData = any> {
  data?: TData;
  loading: boolean;
  error?: Error;
}
