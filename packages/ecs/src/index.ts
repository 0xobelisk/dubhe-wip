// ECS类型定义
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
  ComponentDiscoveryStrategy,
  ComponentDiscoveryConfig,
  ComponentMetadata,
  ComponentField,
  ComponentDiscoveryResult,
  ECSWorldConfig,
  ECSWorld,
  ECSQueryBuilder,
} from './types';

// 主要类导出
export { DubheECSWorld } from './world';
export { ECSQuery } from './query';
export { ECSSubscription } from './subscription';

// 工厂函数导出
export { createECSWorld, createECSWorldWithComponents } from './world';

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
