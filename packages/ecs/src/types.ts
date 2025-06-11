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

// 导入sui-common的dubhe配置类型，更通用
import type { DubheConfig } from '@0xobelisk/sui-common';

// 组件发现配置 - 只支持dubhe config自动解析
export interface ComponentDiscoveryConfig {
  // Dubhe配置（自动解析模式）
  dubheConfig: DubheConfig;
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
  errors?: string[];
  totalDiscovered?: number; // 🆕 发现的组件总数
  fromDubheConfig?: boolean; // 🆕 是否来自dubhe配置
}

// ECS世界配置
export interface ECSWorldConfig {
  // 组件发现配置

  // 🆕 Dubhe配置（可选，如果提供则自动配置组件发现）
  dubheConfig?: DubheConfig;

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
