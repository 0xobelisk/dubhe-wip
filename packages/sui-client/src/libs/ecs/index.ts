// ECS模块主入口

// 导出类型定义
export type {
  EntityId,
  ComponentType,
  Unsubscribe,
  ComponentCallback,
  ComponentChangeCallback,
  EntityCallback,
  QueryChange,
  QueryChangeCallback,
  QueryWatcher,
  PagedResult,
  BatchQueryResult,
  ComponentChangeEvent,
  EntityChangeEvent,
  QueryOptions,
  SubscriptionOptions,
  ECSWorld,
  ECSQueryBuilder,
  ECSWorldConfig,
  ComponentDiscoveryConfig,
  ComponentDiscoveryStrategy,
  ComponentMetadata,
  ComponentField,
  ComponentDiscoveryResult,
  ComponentDiscoverer,
} from './types';

// 导出核心类
export { ECSQuery, QueryBuilder } from './query';
export { ECSSubscription } from './subscription';
export {
  DubheECSWorld,
  createECSWorld,
  createECSWorldWithComponents,
} from './world';
export {
  ECSComponentDiscoverer,
  createComponentDiscoverer,
  createDiscovererWithComponents,
  createDiscovererWithDubheConfig,
  DEFAULT_DISCOVERY_CONFIG,
} from './discovery';

// 导出工具函数
export {
  extractEntityIds,
  calculateDelta,
  findEntityIntersection,
  findEntityUnion,
  extractIntersectionFromBatchResult,
  extractUnionFromBatchResult,
  debounce,
  normalizeComponentType,
  createCacheKey,
  isValidEntityId,
  isValidComponentType,
  deepEqual,
  safeJsonParse,
  formatError,
  createTimestamp,
  limitArray,
  paginateArray,
} from './utils';

// 默认导出主要类
export { DubheECSWorld as default } from './world';
