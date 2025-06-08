// ECS类型定义

export type EntityId = string;
export type ComponentType = string;

// 取消订阅函数
export type Unsubscribe = () => void;

// 组件回调函数
export type ComponentCallback<T> = (entityId: EntityId, component: T) => void;
export type ComponentChangeCallback<T> = (
  entityId: EntityId,
  oldComponent: T,
  newComponent: T
) => void;
export type EntityCallback = (entityId: EntityId) => void;

// 查询变化结果
export interface QueryChange {
  added: EntityId[]; // 新匹配的实体
  removed: EntityId[]; // 不再匹配的实体
  current: EntityId[]; // 当前所有匹配的实体
}

export type QueryChangeCallback = (changes: QueryChange) => void;

// 查询监听器
export interface QueryWatcher {
  unsubscribe: Unsubscribe;
  getCurrentResults: () => EntityId[];
}

// 分页查询结果
export interface PagedResult<T = EntityId> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}

// 批量查询结果
export interface BatchQueryResult {
  [componentType: string]: EntityId[];
}

// 组件变化事件
export interface ComponentChangeEvent<T = any> {
  entityId: EntityId;
  componentType: ComponentType;
  changeType: 'ADDED' | 'REMOVED' | 'MODIFIED';
  oldValue?: T;
  newValue?: T;
  timestamp: number;
}

// 实体变化事件
export interface EntityChangeEvent {
  entityId: EntityId;
  changeType: 'CREATED' | 'DESTROYED';
  componentTypes: ComponentType[];
  timestamp: number;
}

// 查询选项
export interface QueryOptions {
  fields?: string[]; // 允许用户指定需要查询的字段
  idFields?: string[]; // 用作实体ID的字段名数组，默认尝试 ['nodeId', 'id']
  compositeId?: boolean; // 是否组合多个字段作为ID，默认false
  limit?: number;
  offset?: number;
  orderBy?: Array<{
    field: string;
    direction: 'ASC' | 'DESC';
  }>;
  cache?: boolean;
}

// 订阅选项
export interface SubscriptionOptions {
  initialEvent?: boolean;
  debounceMs?: number;
  filter?: Record<string, any>;
}

// 组件发现策略
export type ComponentDiscoveryStrategy =
  | 'introspection' // 从GraphQL schema自省
  | 'configuration' // 从配置文件
  | 'cache-analysis' // 从Apollo缓存分析
  | 'manual' // 手动指定
  | 'auto-schema'; // 使用自动schema查询

// 组件发现配置
export interface ComponentDiscoveryConfig {
  strategy: ComponentDiscoveryStrategy;

  // 手动指定组件列表（strategy = 'manual'）
  componentTypes?: ComponentType[];

  // 配置文件路径（strategy = 'configuration'）
  configPath?: string;

  // 候选表名列表（strategy = 'cache-analysis'）
  candidateTableNames?: string[];

  // 组件名称过滤器
  includePatterns?: string[]; // 包含的模式，如 ['*_component', 'player*']
  excludePatterns?: string[]; // 排除的模式，如 ['_*', 'internal_*']

  // 缓存设置
  cacheTTL?: number; // 缓存时间（秒），默认300秒
  autoRefresh?: boolean; // 是否自动刷新，默认false
}

// 组件元数据
export interface ComponentMetadata {
  name: ComponentType;
  tableName: string; // 对应的数据库表名
  description?: string; // 组件描述
  fields: ComponentField[]; // 字段信息
  lastUpdated: number; // 最后更新时间
}

// 组件字段信息
export interface ComponentField {
  name: string;
  type: string; // GraphQL类型
  nullable: boolean;
  description?: string;
}

// 组件发现结果
export interface ComponentDiscoveryResult {
  components: ComponentMetadata[];
  discoveredAt: number;
  strategy: ComponentDiscoveryStrategy;
  errors?: string[];
}

// 组件发现器接口
export interface ComponentDiscoverer {
  discover(): Promise<ComponentDiscoveryResult>;
  refresh(): Promise<ComponentDiscoveryResult>;
  getComponentTypes(): Promise<ComponentType[]>;
  getComponentMetadata(
    componentType: ComponentType
  ): Promise<ComponentMetadata | null>;
}

// ECS世界配置
export interface ECSWorldConfig {
  // 组件发现配置
  componentDiscovery: ComponentDiscoveryConfig;

  // 查询配置
  queryConfig?: {
    defaultCacheTimeout?: number; // 默认缓存超时时间
    maxConcurrentQueries?: number; // 最大并发查询数
    enableBatchOptimization?: boolean; // 启用批量查询优化
  };

  // 订阅配置
  subscriptionConfig?: {
    defaultDebounceMs?: number; // 默认防抖时间
    maxSubscriptions?: number; // 最大订阅数
    reconnectOnError?: boolean; // 错误时自动重连
  };
}

// ECS世界接口
export interface ECSWorld {
  // 配置和初始化
  configure(config: Partial<ECSWorldConfig>): Promise<void>;
  initialize(): Promise<void>;

  // 组件发现
  discoverComponents(): Promise<ComponentType[]>;
  getAvailableComponents(): Promise<ComponentType[]>;
  getComponentMetadata(
    componentType: ComponentType
  ): Promise<ComponentMetadata | null>;
  refreshComponentCache(): Promise<void>;

  // 实体查询
  hasEntity(entityId: EntityId): Promise<boolean>;
  getAllEntities(): Promise<EntityId[]>;
  getEntityCount(): Promise<number>;

  // 组件查询
  hasComponent(
    entityId: EntityId,
    componentType: ComponentType
  ): Promise<boolean>;
  getComponent<T>(
    entityId: EntityId,
    componentType: ComponentType
  ): Promise<T | null>;
  getComponents(entityId: EntityId): Promise<ComponentType[]>;

  // 世界查询
  queryWith(
    componentType: ComponentType,
    options?: QueryOptions
  ): Promise<EntityId[]>;
  queryWithAll(
    componentTypes: ComponentType[],
    options?: QueryOptions
  ): Promise<EntityId[]>;
  queryWithAny(
    componentTypes: ComponentType[],
    options?: QueryOptions
  ): Promise<EntityId[]>;
  queryWithout(
    includeTypes: ComponentType[],
    excludeTypes: ComponentType[],
    options?: QueryOptions
  ): Promise<EntityId[]>;

  // 条件查询
  queryWhere<T>(
    componentType: ComponentType,
    predicate: Record<string, any>,
    options?: QueryOptions
  ): Promise<EntityId[]>;
  queryRange(
    componentType: ComponentType,
    field: string,
    min: any,
    max: any,
    options?: QueryOptions
  ): Promise<EntityId[]>;

  // 订阅
  onComponentAdded<T>(
    componentType: ComponentType,
    callback: ComponentCallback<T>,
    options?: SubscriptionOptions
  ): Unsubscribe;
  onComponentRemoved<T>(
    componentType: ComponentType,
    callback: ComponentCallback<T>,
    options?: SubscriptionOptions
  ): Unsubscribe;
  onComponentChanged<T>(
    componentType: ComponentType,
    callback: ComponentCallback<T>,
    options?: SubscriptionOptions
  ): Unsubscribe;

  watchQuery(
    componentTypes: ComponentType[],
    callback: QueryChangeCallback,
    options?: SubscriptionOptions
  ): QueryWatcher;
}

// 查询构建器接口
export interface ECSQueryBuilder {
  with(...componentTypes: ComponentType[]): ECSQueryBuilder;
  without(...componentTypes: ComponentType[]): ECSQueryBuilder;
  where<T>(
    componentType: ComponentType,
    predicate: Record<string, any>
  ): ECSQueryBuilder;
  orderBy(
    componentType: ComponentType,
    field: string,
    direction?: 'ASC' | 'DESC'
  ): ECSQueryBuilder;
  limit(count: number): ECSQueryBuilder;
  offset(count: number): ECSQueryBuilder;
  execute(): Promise<EntityId[]>;
}
