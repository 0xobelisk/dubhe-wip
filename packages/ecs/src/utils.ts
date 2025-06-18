// ECS工具函数

import { EntityId, ComponentType, QueryChange } from './types';
import { Connection, StoreTableRow } from '@0xobelisk/graphql-client';

/**
 * 从GraphQL查询结果中提取实体ID
 * @param connection GraphQL查询结果
 * @param options 提取选项
 * @param options.idFields 用作实体ID的字段名数组，默认尝试 ['nodeId', 'entityId']
 * @param options.composite 是否组合多个字段作为ID，默认false
 */
export function extractEntityIds<T extends StoreTableRow>(
  connection: Connection<T>,
  options?: {
    idFields?: string[];
    composite?: boolean;
  }
): EntityId[] {
  const { idFields = ['nodeId', 'entityId'], composite = false } =
    options || {};

  return connection.edges
    .map((edge) => {
      const node = edge.node as any;

      if (composite) {
        // 组合多个字段作为ID
        const idParts = idFields
          .map((field) => node[field] || '')
          .filter(Boolean);
        return idParts.join('|'); // 使用 | 分隔符组合
      } else {
        // 尝试找到第一个存在的字段作为ID
        for (const field of idFields) {
          if (node[field] !== undefined && node[field] !== null) {
            return node[field] as EntityId;
          }
        }

        // 如果都没找到，返回第一个可用的值或空字符串
        return (Object.values(node)[0] as EntityId) || '';
      }
    })
    .filter(Boolean); // 过滤掉空值
}

/**
 * 计算两个实体ID数组的差异
 */
export function calculateDelta(
  oldResults: EntityId[],
  newResults: EntityId[]
): QueryChange {
  const oldSet = new Set(oldResults);
  const newSet = new Set(newResults);

  const added = newResults.filter((id) => !oldSet.has(id));
  const removed = oldResults.filter((id) => !newSet.has(id));

  return {
    added,
    removed,
    current: newResults,
  };
}

/**
 * 找到多个实体ID数组的交集
 */
export function findEntityIntersection(entitySets: EntityId[][]): EntityId[] {
  if (entitySets.length === 0) return [];
  if (entitySets.length === 1) return entitySets[0];

  return entitySets.reduce((intersection, currentSet) => {
    const currentSetLookup = new Set(currentSet);
    return intersection.filter((id) => currentSetLookup.has(id));
  });
}

/**
 * 找到多个实体ID数组的并集
 */
export function findEntityUnion(entitySets: EntityId[][]): EntityId[] {
  const unionSet = new Set<EntityId>();

  entitySets.forEach((set) => {
    set.forEach((id) => unionSet.add(id));
  });

  return Array.from(unionSet);
}

/**
 * 从批量查询结果中提取实体交集
 */
export function extractIntersectionFromBatchResult(
  batchResult: Record<string, Connection<StoreTableRow>>,
  componentTypes: ComponentType[],
  options?: {
    idFields?: string[];
    composite?: boolean;
  }
): EntityId[] {
  const entitySets = componentTypes.map((type) => {
    const connection = batchResult[type];
    return connection ? extractEntityIds(connection, options) : [];
  });

  return findEntityIntersection(entitySets);
}

/**
 * 从批量查询结果中提取实体并集
 */
export function extractUnionFromBatchResult(
  batchResult: Record<string, Connection<StoreTableRow>>,
  componentTypes: ComponentType[],
  options?: {
    idFields?: string[];
    composite?: boolean;
  }
): EntityId[] {
  const entitySets = componentTypes.map((type) => {
    const connection = batchResult[type];
    return connection ? extractEntityIds(connection, options) : [];
  });

  return findEntityUnion(entitySets);
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, waitMs);
  };
}

/**
 * 标准化组件类型名称（处理单复数）
 */
export function normalizeComponentType(componentType: ComponentType): {
  singular: string;
  plural: string;
} {
  // 简单的单复数转换逻辑
  const singular = componentType.endsWith('s')
    ? componentType.slice(0, -1)
    : componentType;

  const plural = componentType.endsWith('s')
    ? componentType
    : componentType + 's';

  return { singular, plural };
}

/**
 * 创建缓存键
 */
export function createCacheKey(
  operation: string,
  componentTypes: ComponentType[],
  options?: Record<string, any>
): string {
  const sortedTypes = [...componentTypes].sort();
  const optionsStr = options ? JSON.stringify(options) : '';
  return `${operation}:${sortedTypes.join(',')}:${optionsStr}`;
}

/**
 * 验证实体ID格式
 */
export function isValidEntityId(entityId: any): entityId is EntityId {
  return typeof entityId === 'string' && entityId.length > 0;
}

/**
 * 验证组件类型格式
 */
export function isValidComponentType(
  componentType: any
): componentType is ComponentType {
  return typeof componentType === 'string' && componentType.length > 0;
}

/**
 * 深度比较两个对象是否相等
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;

  if (obj1 == null || obj2 == null) return false;

  if (typeof obj1 !== typeof obj2) return false;

  if (typeof obj1 !== 'object') return false;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
}

/**
 * 安全地解析JSON
 */
export function safeJsonParse<T = any>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
}

/**
 * 格式化错误消息
 */
export function formatError(error: any): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return JSON.stringify(error);
}

/**
 * 创建时间戳
 */
export function createTimestamp(): number {
  return Date.now();
}

/**
 * 限制数组大小
 */
export function limitArray<T>(array: T[], limit: number): T[] {
  return limit > 0 ? array.slice(0, limit) : array;
}

/**
 * 分页数组
 */
export function paginateArray<T>(
  array: T[],
  page: number,
  pageSize: number
): {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
} {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const items = array.slice(startIndex, endIndex);

  return {
    items,
    totalCount: array.length,
    hasMore: endIndex < array.length,
    page,
    pageSize,
  };
}
