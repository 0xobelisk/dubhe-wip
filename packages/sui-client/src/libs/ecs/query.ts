// ECS查询系统实现

import { DubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import {
  EntityId,
  ComponentType,
  QueryOptions,
  PagedResult,
  ECSQueryBuilder,
  ECSWorld,
} from './types';
import {
  extractEntityIds,
  extractIntersectionFromBatchResult,
  extractUnionFromBatchResult,
  isValidEntityId,
  isValidComponentType,
  createCacheKey,
  limitArray,
  paginateArray,
  formatError,
} from './utils';

/**
 * ECS查询系统核心实现
 */
export class ECSQuery {
  private graphqlClient: DubheGraphqlClient;
  private queryCache = new Map<
    string,
    { result: EntityId[]; timestamp: number }
  >();
  private cacheTimeout = 5000; // 5秒缓存超时
  private availableComponents: ComponentType[] = [];

  constructor(graphqlClient: DubheGraphqlClient) {
    this.graphqlClient = graphqlClient;
  }

  /**
   * 设置可用组件列表
   */
  setAvailableComponents(componentTypes: ComponentType[]): void {
    this.availableComponents = componentTypes;
  }

  /**
   * 检查实体是否存在
   */
  async hasEntity(entityId: EntityId): Promise<boolean> {
    if (!isValidEntityId(entityId)) return false;

    try {
      // 通过查询任何可能的组件表来检查实体是否存在
      // 这里可以优化为查询一个专门的实体表
      const tables = await this.getAvailableTables();

      for (const table of tables.slice(0, 3)) {
        // 只检查前3个表避免过多查询
        const component = await this.graphqlClient.getTableByCondition(table, {
          id: entityId,
        });
        if (component) return true;
      }

      return false;
    } catch (error) {
      console.warn(`检查实体存在性失败: ${formatError(error)}`);
      return false;
    }
  }

  /**
   * 获取所有实体ID（从所有组件表中收集）
   */
  async getAllEntities(): Promise<EntityId[]> {
    try {
      const tables = await this.getAvailableTables();
      const entitySets: EntityId[][] = [];

      // 并行查询所有表
      const queries = tables.map((table) => ({
        key: table,
        tableName: table,
        params: {
          fields: ['updatedAt'],
          filter: {},
        },
      }));

      const batchResult = await this.graphqlClient.batchQuery(queries);

      // 收集所有实体ID
      tables.forEach((table) => {
        const connection = batchResult[table];
        if (connection) {
          entitySets.push(
            extractEntityIds(connection, {
              idFields: ['updatedAt'], // 使用updatedAt作为临时ID，用于计算集合
              composite: false,
            })
          );
        }
      });

      // 返回所有实体的并集
      return extractUnionFromBatchResult(batchResult, tables, {
        idFields: ['updatedAt'], // 使用updatedAt作为临时ID，用于计算集合
        composite: false,
      });
    } catch (error) {
      console.error(`获取所有实体失败: ${formatError(error)}`);
      return [];
    }
  }

  /**
   * 获取实体总数
   */
  async getEntityCount(): Promise<number> {
    const entities = await this.getAllEntities();
    return entities.length;
  }

  /**
   * 检查实体是否拥有特定组件
   */
  async hasComponent(
    entityId: EntityId,
    componentType: ComponentType
  ): Promise<boolean> {
    if (!isValidEntityId(entityId) || !isValidComponentType(componentType)) {
      return false;
    }

    try {
      const component = await this.graphqlClient.getTableByCondition(
        componentType,
        { id: entityId }
      );
      return component !== null;
    } catch (error) {
      console.warn(`检查组件存在性失败: ${formatError(error)}`);
      return false;
    }
  }

  /**
   * 获取实体的特定组件数据
   */
  async getComponent<T>(
    entityId: EntityId,
    componentType: ComponentType
  ): Promise<T | null> {
    if (!isValidEntityId(entityId) || !isValidComponentType(componentType)) {
      return null;
    }

    try {
      const component = await this.graphqlClient.getTableByCondition(
        componentType,
        { id: entityId }
      );
      return component as T;
    } catch (error) {
      console.warn(`获取组件数据失败: ${formatError(error)}`);
      return null;
    }
  }

  /**
   * 获取实体拥有的所有组件类型
   */
  async getComponents(entityId: EntityId): Promise<ComponentType[]> {
    if (!isValidEntityId(entityId)) return [];

    try {
      const tables = await this.getAvailableTables();
      const componentTypes: ComponentType[] = [];

      // 检查每个表中是否存在该实体
      await Promise.all(
        tables.map(async (table) => {
          const hasComp = await this.hasComponent(entityId, table);
          if (hasComp) {
            componentTypes.push(table);
          }
        })
      );

      return componentTypes;
    } catch (error) {
      console.error(`获取实体组件列表失败: ${formatError(error)}`);
      return [];
    }
  }

  /**
   * 查询拥有特定组件的所有实体
   */
  async queryWith(
    componentType: ComponentType,
    options?: QueryOptions
  ): Promise<EntityId[]> {
    if (!isValidComponentType(componentType)) return [];

    const cacheKey = createCacheKey('queryWith', [componentType], options);
    const cached = this.getCachedResult(cacheKey);
    if (cached && options?.cache !== false) return cached;

    try {
      const connection = await this.graphqlClient.getAllTables(componentType, {
        first: options?.limit,
        fields: options?.fields ? options.fields : ['updatedAt'],
        orderBy: options?.orderBy,
      });

      const result = extractEntityIds(connection, {
        idFields: options?.idFields,
        composite: options?.compositeId,
      });
      this.setCachedResult(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`单组件查询失败: ${formatError(error)}`);
      return [];
    }
  }

  /**
   * 查询拥有所有指定组件的实体（交集）
   */
  async queryWithAll(
    componentTypes: ComponentType[],
    options?: QueryOptions
  ): Promise<EntityId[]> {
    if (componentTypes.length === 0) return [];
    if (componentTypes.length === 1)
      return this.queryWith(componentTypes[0], options);

    const validTypes = componentTypes.filter(isValidComponentType);
    if (validTypes.length === 0) return [];

    const cacheKey = createCacheKey('queryWithAll', validTypes, options);
    const cached = this.getCachedResult(cacheKey);
    if (cached && options?.cache !== false) return cached;

    try {
      // 批量查询所有组件表
      const queries = validTypes.map((type) => ({
        key: type,
        tableName: type,
        params: {
          fields: options?.fields ? options.fields : ['updatedAt'],
          first: options?.limit,
          orderBy: options?.orderBy,
        },
      }));

      const batchResult = await this.graphqlClient.batchQuery(queries);
      const result = extractIntersectionFromBatchResult(
        batchResult,
        validTypes,
        {
          idFields: options?.idFields,
          composite: options?.compositeId,
        }
      );

      this.setCachedResult(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`多组件交集查询失败: ${formatError(error)}`);
      return [];
    }
  }

  /**
   * 查询拥有任意指定组件的实体（并集）
   */
  async queryWithAny(
    componentTypes: ComponentType[],
    options?: QueryOptions
  ): Promise<EntityId[]> {
    if (componentTypes.length === 0) return [];
    if (componentTypes.length === 1)
      return this.queryWith(componentTypes[0], options);

    const validTypes = componentTypes.filter(isValidComponentType);
    if (validTypes.length === 0) return [];

    const cacheKey = createCacheKey('queryWithAny', validTypes, options);
    const cached = this.getCachedResult(cacheKey);
    if (cached && options?.cache !== false) return cached;

    try {
      const queries = validTypes.map((type) => ({
        key: type,
        tableName: type,
        params: {
          fields: options?.fields ? options.fields : ['updatedAt'],
          first: options?.limit,
          orderBy: options?.orderBy,
        },
      }));

      const batchResult = await this.graphqlClient.batchQuery(queries);
      const result = extractUnionFromBatchResult(batchResult, validTypes, {
        idFields: options?.idFields,
        composite: options?.compositeId,
      });

      this.setCachedResult(cacheKey, result);
      return result;
    } catch (error) {
      console.error(`多组件并集查询失败: ${formatError(error)}`);
      return [];
    }
  }

  /**
   * 查询拥有包含组件但不拥有排除组件的实体
   */
  async queryWithout(
    includeTypes: ComponentType[],
    excludeTypes: ComponentType[],
    options?: QueryOptions
  ): Promise<EntityId[]> {
    if (includeTypes.length === 0) return [];

    try {
      // 先获取拥有所有包含组件的实体
      const includedEntities = await this.queryWithAll(includeTypes, options);

      if (excludeTypes.length === 0) return includedEntities;

      // 获取拥有任意排除组件的实体
      const excludedEntities = await this.queryWithAny(excludeTypes);
      const excludedSet = new Set(excludedEntities);

      // 从包含实体中移除排除实体
      return includedEntities.filter((entityId) => !excludedSet.has(entityId));
    } catch (error) {
      console.error(`排除查询失败: ${formatError(error)}`);
      return [];
    }
  }

  /**
   * 基于条件查询组件
   */
  async queryWhere<T>(
    componentType: ComponentType,
    predicate: Record<string, any>,
    options?: QueryOptions
  ): Promise<EntityId[]> {
    if (!isValidComponentType(componentType)) return [];

    try {
      const connection = await this.graphqlClient.getAllTables(componentType, {
        filter: predicate,
        first: options?.limit,
        fields: options?.fields ? options.fields : ['updatedAt'],
        orderBy: options?.orderBy,
      });

      return extractEntityIds(connection, {
        idFields: options?.idFields,
        composite: options?.compositeId,
      });
    } catch (error) {
      console.error(`条件查询失败: ${formatError(error)}`);
      return [];
    }
  }

  /**
   * 范围查询
   */
  async queryRange(
    componentType: ComponentType,
    field: string,
    min: any,
    max: any,
    options?: QueryOptions
  ): Promise<EntityId[]> {
    if (!isValidComponentType(componentType)) return [];

    const predicate = {
      [field]: {
        greaterThanOrEqualTo: min,
        lessThanOrEqualTo: max,
      },
    };

    return this.queryWhere(componentType, predicate, options);
  }

  /**
   * 分页查询
   */
  async queryPaged(
    componentTypes: ComponentType[],
    page: number,
    pageSize: number
  ): Promise<PagedResult<EntityId>> {
    try {
      const allResults =
        componentTypes.length === 1
          ? await this.queryWith(componentTypes[0])
          : await this.queryWithAll(componentTypes);

      return paginateArray(allResults, page, pageSize);
    } catch (error) {
      console.error(`分页查询失败: ${formatError(error)}`);
      return {
        items: [],
        totalCount: 0,
        hasMore: false,
        page,
        pageSize,
      };
    }
  }

  /**
   * 创建查询构建器
   */
  query(): ECSQueryBuilder {
    return new QueryBuilder(this);
  }

  /**
   * 获取缓存结果
   */
  private getCachedResult(cacheKey: string): EntityId[] | null {
    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.result;
    }
    return null;
  }

  /**
   * 设置缓存结果
   */
  private setCachedResult(cacheKey: string, result: EntityId[]): void {
    this.queryCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * 清理过期缓存
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, cached] of this.queryCache.entries()) {
      if (now - cached.timestamp >= this.cacheTimeout) {
        this.queryCache.delete(key);
      }
    }
  }

  /**
   * 获取可用的表列表
   */
  private async getAvailableTables(): Promise<string[]> {
    if (this.availableComponents.length > 0) {
      return this.availableComponents;
    }

    // 默认返回空数组，由组件发现系统来设置
    console.warn('⚠️ 未设置可用组件列表，请先初始化ECS世界');
    return [];
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.queryCache.clear();
  }
}

/**
 * 查询构建器实现
 */
export class QueryBuilder implements ECSQueryBuilder {
  private ecsQuery: ECSQuery;
  private includeTypes: ComponentType[] = [];
  private excludeTypes: ComponentType[] = [];
  private whereConditions: Array<{
    componentType: ComponentType;
    predicate: Record<string, any>;
  }> = [];
  private orderByOptions: Array<{
    componentType: ComponentType;
    field: string;
    direction: 'ASC' | 'DESC';
  }> = [];
  private limitValue?: number;
  private offsetValue?: number;

  constructor(ecsQuery: ECSQuery) {
    this.ecsQuery = ecsQuery;
  }

  with(...componentTypes: ComponentType[]): ECSQueryBuilder {
    this.includeTypes.push(...componentTypes);
    return this;
  }

  without(...componentTypes: ComponentType[]): ECSQueryBuilder {
    this.excludeTypes.push(...componentTypes);
    return this;
  }

  where<T>(
    componentType: ComponentType,
    predicate: Record<string, any>
  ): ECSQueryBuilder {
    this.whereConditions.push({ componentType, predicate });
    return this;
  }

  orderBy(
    componentType: ComponentType,
    field: string,
    direction: 'ASC' | 'DESC' = 'ASC'
  ): ECSQueryBuilder {
    this.orderByOptions.push({ componentType, field, direction });
    return this;
  }

  limit(count: number): ECSQueryBuilder {
    this.limitValue = count;
    return this;
  }

  offset(count: number): ECSQueryBuilder {
    this.offsetValue = count;
    return this;
  }

  async execute(): Promise<EntityId[]> {
    try {
      const options: QueryOptions = {
        limit: this.limitValue,
        offset: this.offsetValue,
        orderBy: this.orderByOptions.map((order) => ({
          field: order.field,
          direction: order.direction,
        })),
      };

      // 如果有where条件，先处理过滤
      if (this.whereConditions.length > 0) {
        const filteredResults: EntityId[][] = [];

        for (const condition of this.whereConditions) {
          const result = await this.ecsQuery.queryWhere(
            condition.componentType,
            condition.predicate,
            options
          );
          filteredResults.push(result);
        }

        // 找到交集
        const intersection = filteredResults.reduce((acc, current) => {
          const currentSet = new Set(current);
          return acc.filter((id) => currentSet.has(id));
        });

        return intersection;
      }

      // 处理基本的包含/排除查询
      if (this.excludeTypes.length > 0) {
        return this.ecsQuery.queryWithout(
          this.includeTypes,
          this.excludeTypes,
          options
        );
      } else {
        return this.ecsQuery.queryWithAll(this.includeTypes, options);
      }
    } catch (error) {
      console.error(`查询构建器执行失败: ${formatError(error)}`);
      return [];
    }
  }
}
