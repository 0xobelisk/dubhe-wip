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
  | 'manual' // 手动指定
  | 'dubhe-config'; // 🆕 从dubhe配置自动发现

// 导入dubhe配置类型
import type { DubheConfig } from '../dubheGraphqlClient/types';

// 组件发现配置
export interface ComponentDiscoveryConfig {
  strategy: ComponentDiscoveryStrategy;

  // 手动指定组件列表（strategy = 'manual'）
  componentTypes?: ComponentType[];

  // 配置文件路径（strategy = 'configuration'）
  configPath?: string;

  // 候选表名列表（strategy = 'cache-analysis'）
  candidateTableNames?: string[];

  // 🆕 Dubhe配置（strategy = 'dubhe-config'）
  dubheConfig?: DubheConfig;

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
  primaryKeys: string[]; // 🆕 主键字段列表
  hasDefaultId: boolean; // 🆕 是否有默认ID字段
  enumFields: string[]; // 🆕 枚举字段列表
  lastUpdated: number; // 最后更新时间
}

// 组件字段信息
export interface ComponentField {
  name: string;
  type: string; // GraphQL类型
  nullable: boolean;
  description?: string;
  isEnum?: boolean; // 🆕 是否为枚举字段
  isPrimaryKey?: boolean; // 🆕 是否为主键字段
}

// 组件发现结果
export interface ComponentDiscoveryResult {
  components: ComponentMetadata[];
  discoveredAt: number;
  strategy: ComponentDiscoveryStrategy;
  errors?: string[];
  totalDiscovered?: number; // 🆕 发现的组件总数
  fromDubheConfig?: boolean; // 🆕 是否来自dubhe配置
}

// 组件发现器接口
export interface ComponentDiscoverer {
  discover(): Promise<ComponentDiscoveryResult>;
  refresh(): Promise<ComponentDiscoveryResult>;
  getComponentTypes(): Promise<ComponentType[]>;
  getComponentMetadata(
    componentType: ComponentType
  ): Promise<ComponentMetadata | null>;

  // 🆕 新增方法
  setDubheConfig?(dubheConfig: DubheConfig): void;
  getDubheConfig?(): DubheConfig | null;
}

// ECS世界配置
export interface ECSWorldConfig {
  // 组件发现配置
  componentDiscovery: ComponentDiscoveryConfig;

  // 🆕 Dubhe配置（可选，如果提供则自动配置组件发现）
  dubheConfig?: DubheConfig;

  // 查询配置
  queryConfig?: {
    defaultCacheTimeout?: number; // 默认缓存超时时间
    maxConcurrentQueries?: number; // 最大并发查询数
    enableBatchOptimization?: boolean; // 启用批量查询优化
    enableAutoFieldResolution?: boolean; // 🆕 启用自动字段解析
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

  // ============ 标准ECS接口（驼峰命名） ============

  // 实体查询接口
  getEntity(id: EntityId): Promise<any | null>; // 获取单个实体完整数据（新增）
  getEntities(): Promise<EntityId[]>; // 等同于 getAllEntities()
  getEntitiesByComponent(componentType: ComponentType): Promise<EntityId[]>; // 等同于 queryWith()

  // 组件查询接口
  getComponent<T>(
    entityId: EntityId,
    componentType: ComponentType
  ): Promise<T | null>; // 现有方法
  getComponents(entityId: EntityId): Promise<ComponentType[]>; // 现有方法
  hasComponent(
    entityId: EntityId,
    componentType: ComponentType
  ): Promise<boolean>; // 现有方法

  // ============ 完整API集合 ============

  // 实体查询
  hasEntity(entityId: EntityId): Promise<boolean>;
  getAllEntities(): Promise<EntityId[]>; // 别名：getEntities()
  getEntityCount(): Promise<number>;

  // 世界查询
  queryWith(
    componentType: ComponentType,
    options?: QueryOptions
  ): Promise<EntityId[]>; // 别名：getEntitiesByComponent()
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
