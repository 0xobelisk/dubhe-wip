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

// 查询缓存策略
export type CachePolicy =
  | 'cache-first'
  | 'network-only'
  | 'cache-only'
  | 'no-cache'
  | 'standby';

// 分页缓存策略
export type PaginationCacheStrategy =
  | 'none' // 不启用分页缓存合并（Apollo默认行为）
  | 'filter-only' // 只根据过滤条件缓存
  | 'filter-orderby' // 根据过滤条件和排序缓存
  | 'table-level'; // 表级别缓存

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
      relatedNode?: any;
      relatedNodeId?: string;
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

export interface DubheConfig {
  name: string;
  description?: string;
  enums?: Record<string, string[]>; // 枚举定义
  errors?: Record<string, string>; // 错误定义
  components: Record<string, DubheComponent>; // 组件/表定义
}

// 自动解析的字段信息
export interface ParsedTableInfo {
  tableName: string; // 表名
  fields: string[]; // 所有字段名（包括自动添加的 createdAt, updatedAt）
  primaryKeys: string[]; // 主键字段
  hasDefaultId: boolean; // 是否有默认的id字段
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
  dubheConfig?: DubheConfig; // Dubhe配置，用于自动解析字段
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
