import { DocumentNode } from '@apollo/client';
import { DubheConfig } from '@0xobelisk/sui-common';

// DubheMetadata type definition for JSON format dubhe configuration
export type DubheMetadata = {
  components: Array<
    Record<
      string,
      {
        fields: Array<Record<string, any>>;
        keys: string[];
      }
    >
  >;
  resources: Array<
    Record<
      string,
      {
        fields: Array<Record<string, any>>;
        keys: string[];
      }
    >
  >;
  enums: any[];
};

// Basic pagination information
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

// Connection response common type
export interface Connection<T> {
  edges: Array<{
    cursor: string;
    node: T;
  }>;
  pageInfo: PageInfo;
  totalCount?: number;
}

// Basic query parameters
export interface BaseQueryParams {
  first?: number;
  last?: number;
  after?: string;
  before?: string;
}

// Sort parameters
export interface OrderBy {
  field: string;
  direction: 'ASC' | 'DESC';
}

// JSON path sort parameters
export interface JsonPathOrder {
  path: string;
  direction: 'ASC' | 'DESC';
  type?: 'STRING' | 'INTEGER' | 'FLOAT' | 'BOOLEAN';
}

// Query filter base type
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

// String filter
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

// Number filter
export interface NumberFilter extends FilterCondition {
  lessThan?: number;
  lessThanOrEqualTo?: number;
  greaterThan?: number;
  greaterThanOrEqualTo?: number;
}

// Date filter
export interface DateFilter extends FilterCondition {
  lessThan?: string;
  lessThanOrEqualTo?: string;
  greaterThan?: string;
  greaterThanOrEqualTo?: string;
}

// Store table base type (store prefix removed from API)
export interface StoreTableRow {
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

// Query builder type
export interface QueryBuilder<T> {
  where?: Record<string, any>;
  orderBy?: OrderBy[];
  first?: number;
  last?: number;
  after?: string;
  before?: string;
}

// Subscription type
export interface SubscriptionOptions {
  onData?: (data: any) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

// PostGraphile Listen subscription related types
export interface ListenPayload<T = any> {
  query: T;
}

export interface ListenSubscriptionResult<T = any> {
  listen: ListenPayload<T>;
}

// Advanced subscription options
export interface AdvancedSubscriptionOptions extends SubscriptionOptions {
  initialEvent?: boolean; // Whether to trigger initial event immediately
  variables?: Record<string, any>; // Subscription variables
}

// Listen subscription configuration
export interface ListenSubscriptionConfig {
  topic: string;
  initialEvent?: boolean;
  filter?: Record<string, any>;
  orderBy?: OrderBy[];
  first?: number;
  fields?: string[];
}

// Query operation type
export type QueryOperation = 'query' | 'subscription';

// Typed GraphQL query
export interface TypedDocumentNode<TResult = any, TVariables = any>
  extends DocumentNode {
  __resultType?: TResult;
  __variablesType?: TVariables;
}

// Retry configuration options
export interface RetryOptions {
  max?: number; // Maximum retry count, defaults to 3
  delay?: {
    initial?: number; // Initial delay time (milliseconds), defaults to 300ms
    max?: number; // Maximum delay time (milliseconds), defaults to 30000ms
    jitter?: boolean; // Whether to add random jitter, defaults to true
  };
  attempts?: {
    max?: number; // Maximum attempt count (including initial request), defaults to 5
    retryIf?: (error: any, _operation: any) => boolean; // Custom retry condition
  };
}

// Query cache policy
export type CachePolicy =
  | 'cache-first'
  | 'network-only'
  | 'cache-only'
  | 'no-cache'
  | 'standby';

// Pagination cache strategy
export type PaginationCacheStrategy =
  | 'none' // Disable pagination cache merging (Apollo default behavior)
  | 'filter-only' // Cache only based on filter conditions
  | 'filter-orderby' // Cache based on filter conditions and sorting
  | 'table-level'; // Table-level caching

// Query options
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

// 多表订阅配置
export interface MultiTableSubscriptionConfig {
  tableName: string;
  options?: SubscriptionOptions & {
    fields?: string[]; // 允许用户指定需要订阅的字段
    filter?: Record<string, any>; // 过滤条件
    initialEvent?: boolean; // 是否立即触发初始事件
    first?: number; // 限制返回的记录数
    orderBy?: OrderBy[]; // 排序条件
    topicPrefix?: string; // 自定义topic前缀，默认使用表名
  };
}

// 多表订阅结果
export interface MultiTableSubscriptionResult {
  [tableName: string]: SubscriptionResult<{ listen: { query: any } }>;
}

// 多表订阅数据结果
export interface MultiTableSubscriptionData {
  [tableName: string]: {
    listen: {
      query: any;
    };
  };
}

// Dubhe Config 相关类型定义
export interface DubheComponentField {
  type: string; // 字段类型，如 'u64', 'address', 'MonsterType' 等
}

export interface DubheComponent {
  fields?: Record<string, string | DubheComponentField>; // 字段定义
  keys?: string[]; // 主键字段列表，[] 表示没有主键，undefined 表示默认id主键
}

// 自动解析的字段信息
export interface ParsedTableInfo {
  tableName: string; // 表名
  fields: string[]; // 所有字段名（包括自动添加的 createdAt, updatedAt）
  primaryKeys: string[]; // 主键字段
  enumFields: Record<string, string[]>; // 枚举字段及其可能的值
}

// 表字段配置策略
export type FieldStrategy =
  | 'strict' // 严格模式：只使用dubhe config中定义的字段
  | 'safe' // 安全模式：默认只查询系统字段
  | 'legacy'; // 兼容模式：默认包含id字段（向后兼容）

// 客户端配置
export interface DubheClientConfig {
  endpoint: string;
  subscriptionEndpoint?: string;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  retryOptions?: RetryOptions; // 重试配置
  dubheMetadata?: any; // Dubhe元数据，用于自动解析字段
  cacheConfig?: {
    // 需要分页缓存策略的表名列表
    paginatedTables?: string[];
    // 分页缓存策略
    strategy?: PaginationCacheStrategy;
    // 自定义缓存合并策略（可选）
    customMergeStrategies?: Record<
      string,
      {
        keyArgs?: string[];
        merge?: (existing: any, incoming: any) => any;
      }
    >;
  };
}
