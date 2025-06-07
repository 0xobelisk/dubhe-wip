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

// PostGraphile Listen订阅相关类型
export interface ListenPayload<T = any> {
  query: T;
  relatedNode?: any;
  relatedNodeId?: string;
}

export interface ListenSubscriptionResult<T = any> {
  listen: ListenPayload<T>;
}

// 高级订阅选项
export interface AdvancedSubscriptionOptions extends SubscriptionOptions {
  initialEvent?: boolean; // 是否立即触发初始事件
  variables?: Record<string, any>; // 订阅变量
}

// Listen订阅配置
export interface ListenSubscriptionConfig {
  topic: string;
  initialEvent?: boolean;
  filter?: Record<string, any>;
  orderBy?: OrderBy[];
  first?: number;
  fields?: string[];
}

// 查询操作类型
export type QueryOperation = 'query' | 'subscription';

// 类型化的GraphQL查询
export interface TypedDocumentNode<TResult = any, TVariables = any>
  extends DocumentNode {
  __resultType?: TResult;
  __variablesType?: TVariables;
}

// 重试配置选项
export interface RetryOptions {
  max?: number; // 最大重试次数，默认为3
  delay?: {
    initial?: number; // 初始延迟时间（毫秒），默认300ms
    max?: number; // 最大延迟时间（毫秒），默认30000ms
    jitter?: boolean; // 是否添加随机抖动，默认true
  };
  attempts?: {
    max?: number; // 最大尝试次数（包括初始请求），默认5
    retryIf?: (error: any, _operation: any) => boolean; // 自定义重试条件
  };
}

// 客户端配置
export interface DubheClientConfig {
  endpoint: string;
  subscriptionEndpoint?: string;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  retryOptions?: RetryOptions; // 重试配置
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
