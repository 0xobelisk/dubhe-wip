// ECS查询系统实现

import { DubheGraphqlClient } from '@0xobelisk/graphql-client';
import {
  EntityId,
  ComponentType,
  QueryOptions,
  PagedResult,
  ECSQueryBuilder,
  ECSWorld,
  ComponentMetadata,
  ComponentDiscoverer,
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
  private componentDiscoverer: ComponentDiscoverer | null = null;
  // 🆕 组件主键信息缓存 - 在初始化时预先解析
  private componentPrimaryKeys = new Map<ComponentType, string>();

  constructor(
    graphqlClient: DubheGraphqlClient,
    componentDiscoverer?: ComponentDiscoverer
  ) {
    this.graphqlClient = graphqlClient;
    this.componentDiscoverer = componentDiscoverer || null;
  }

  /**
   * 设置可用组件列表
   */
  setAvailableComponents(componentTypes: ComponentType[]): void {
    this.availableComponents = componentTypes;
  }

  /**
   * 🆕 预先解析并缓存所有组件的主键信息
   */
  async initializeComponentMetadata(
    componentMetadataList: Array<{ name: ComponentType; primaryKeys: string[] }>
  ): Promise<void> {
    console.log('🔧 Initializing component primary key cache...');

    this.componentPrimaryKeys.clear();

    for (const metadata of componentMetadataList) {
      // 只处理ECS规范的组件（单主键）
      if (metadata.primaryKeys.length === 1) {
        this.componentPrimaryKeys.set(metadata.name, metadata.primaryKeys[0]);
        console.log(
          `   📋 ${metadata.name} -> primary key: ${metadata.primaryKeys[0]}`
        );
      } else {
        console.warn(
          `⚠️ Skipping ${metadata.name}: invalid primary key count (${metadata.primaryKeys.length})`
        );
      }
    }

    console.log(
      `✅ Component primary key cache initialized with ${this.componentPrimaryKeys.size} components`
    );
  }

  /**
   * 🆕 获取组件的主键字段名（从缓存中快速获取）
   */
  getComponentPrimaryKeyField(componentType: ComponentType): string {
    return this.componentPrimaryKeys.get(componentType) || 'id';
  }

  /**
   * 设置组件发现器
   */
  setComponentDiscoverer(discoverer: ComponentDiscoverer): void {
    this.componentDiscoverer = discoverer;
  }

  /**
   * 获取组件的字段信息
   */
  private async getComponentFields(
    componentType: ComponentType
  ): Promise<string[]> {
    if (this.componentDiscoverer) {
      try {
        const metadata = await this.componentDiscoverer.getComponentMetadata(
          componentType
        );
        if (metadata) {
          return metadata.fields.map((field) => field.name);
        }
      } catch (error) {
        console.warn(`获取${componentType}字段信息失败: ${formatError(error)}`);
      }
    }

    // 无法自动解析时抛出错误，要求用户显式指定
    throw new Error(
      `无法获取组件${componentType}的字段信息，请在QueryOptions中显式指定fields，或确保组件发现器已正确配置`
    );
  }

  /**
   * 获取组件的主键字段
   */
  private async getComponentPrimaryKeys(
    componentType: ComponentType
  ): Promise<string[]> {
    if (this.componentDiscoverer) {
      try {
        const metadata = await this.componentDiscoverer.getComponentMetadata(
          componentType
        );
        if (metadata && metadata.primaryKeys.length > 0) {
          return metadata.primaryKeys;
        }
      } catch (error) {
        console.warn(`获取${componentType}主键信息失败: ${formatError(error)}`);
      }
    }

    // 无法自动解析时抛出错误，要求用户显式指定
    throw new Error(
      `无法获取组件${componentType}的主键信息，请在QueryOptions中显式指定idFields，或确保组件发现器已正确配置`
    );
  }

  /**
   * 获取查询时应该使用的字段（优先级：用户指定 > dubhe配置自动解析）
   */
  private async getQueryFields(
    componentType: ComponentType,
    userFields?: string[]
  ): Promise<string[]> {
    if (userFields && userFields.length > 0) {
      return userFields;
    }

    // 使用dubhe配置自动解析的字段，如果失败会抛出错误要求用户显式指定
    return this.getComponentFields(componentType);
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
        try {
          const condition = this.buildEntityCondition(table, entityId);
          const component = await this.graphqlClient.getTableByCondition(
            table,
            condition
          );
          if (component) return true;
        } catch (error) {
          // 如果某个表查询失败，继续检查下一个表
          console.warn(
            `Failed to check entity ${entityId} in table ${table}:`,
            formatError(error)
          );
        }
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

      // 并行查询所有表，使用缓存的字段信息
      const queries = await Promise.all(
        tables.map(async (table) => {
          const fields = await this.getQueryFields(table);
          const primaryKey = this.componentPrimaryKeys.get(table) || 'id';

          return {
            key: table,
            tableName: table,
            params: {
              fields: fields,
              filter: {},
            },
            primaryKey, // 使用缓存的主键信息
          };
        })
      );

      const batchResult = await this.graphqlClient.batchQuery(
        queries.map((q) => ({
          key: q.key,
          tableName: q.tableName,
          params: q.params,
        }))
      );

      // 使用缓存的主键字段提取实体ID
      return extractUnionFromBatchResult(batchResult, tables, {
        idFields: undefined, // 让extractEntityIds自动推断
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

    // 验证是否为ECS规范的组件
    if (!this.isECSComponent(componentType)) {
      console.warn(
        `⚠️ Component '${componentType}' is not a valid ECS component. Only single-primary-key tables are supported for ECS queries.`
      );
      return false;
    }

    try {
      const condition = this.buildEntityCondition(componentType, entityId);
      const component = await this.graphqlClient.getTableByCondition(
        componentType,
        condition
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

    // 验证是否为ECS规范的组件
    if (!this.isECSComponent(componentType)) {
      console.warn(
        `⚠️ Component '${componentType}' is not a valid ECS component. Only single-primary-key tables are supported for ECS queries.`
      );
      return null;
    }

    try {
      const condition = this.buildEntityCondition(componentType, entityId);
      const component = await this.graphqlClient.getTableByCondition(
        componentType,
        condition
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
   * 验证组件类型是否为ECS规范的组件
   */
  private isECSComponent(componentType: ComponentType): boolean {
    return this.availableComponents.includes(componentType);
  }

  /**
   * 构建实体查询条件（使用缓存的主键字段名）
   */
  private buildEntityCondition(
    componentType: ComponentType,
    entityId: EntityId
  ): Record<string, any> {
    // 从缓存中获取主键字段名
    const primaryKeyField = this.componentPrimaryKeys.get(componentType);

    if (primaryKeyField) {
      return { [primaryKeyField]: entityId };
    } else {
      // 如果缓存中没有，回退到默认的'id'字段
      console.warn(
        `⚠️ No cached primary key for ${componentType}, falling back to 'id' field`
      );
      return { id: entityId };
    }
  }

  /**
   * 过滤并验证组件类型列表，只保留ECS规范的组件
   */
  private filterValidECSComponents(
    componentTypes: ComponentType[]
  ): ComponentType[] {
    const validComponents = componentTypes.filter((componentType) => {
      if (!isValidComponentType(componentType)) {
        return false;
      }

      if (!this.isECSComponent(componentType)) {
        console.warn(
          `⚠️ Component '${componentType}' is not a valid ECS component. Only single-primary-key tables are supported for ECS queries.`
        );
        return false;
      }

      return true;
    });

    return validComponents;
  }

  /**
   * 查询拥有特定组件的所有实体
   */
  async queryWith(
    componentType: ComponentType,
    options?: QueryOptions
  ): Promise<EntityId[]> {
    if (!isValidComponentType(componentType)) return [];

    // 验证是否为ECS规范的组件
    if (!this.isECSComponent(componentType)) {
      console.warn(
        `⚠️ Component '${componentType}' is not a valid ECS component. Only single-primary-key tables are supported for ECS queries.`
      );
      return [];
    }

    const cacheKey = createCacheKey('queryWith', [componentType], options);
    const cached = this.getCachedResult(cacheKey);
    if (cached && options?.cache !== false) return cached;

    try {
      // 智能获取查询字段和主键信息
      const queryFields = await this.getQueryFields(
        componentType,
        options?.fields
      );
      const primaryKeys = await this.getComponentPrimaryKeys(componentType);

      const connection = await this.graphqlClient.getAllTables(componentType, {
        first: options?.limit,
        fields: queryFields,
        orderBy: options?.orderBy,
      });

      const result = extractEntityIds(connection, {
        idFields: options?.idFields || primaryKeys,
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

    const validTypes = this.filterValidECSComponents(componentTypes);
    if (validTypes.length === 0) return [];

    const cacheKey = createCacheKey('queryWithAll', validTypes, options);
    const cached = this.getCachedResult(cacheKey);
    if (cached && options?.cache !== false) return cached;

    try {
      // 批量查询所有组件表，使用智能字段解析
      const queries = await Promise.all(
        validTypes.map(async (type) => {
          const queryFields = await this.getQueryFields(type, options?.fields);
          return {
            key: type,
            tableName: type,
            params: {
              fields: queryFields,
              first: options?.limit,
              orderBy: options?.orderBy,
            },
          };
        })
      );

      const batchResult = await this.graphqlClient.batchQuery(queries);

      // 如果用户没有指定idFields，尝试使用第一个组件的主键
      let idFields = options?.idFields;
      if (!idFields && validTypes.length > 0) {
        try {
          idFields = await this.getComponentPrimaryKeys(validTypes[0]);
        } catch (error) {
          // 如果无法获取主键，保持idFields为undefined，让extractEntityIds自动推断
        }
      }

      const result = extractIntersectionFromBatchResult(
        batchResult,
        validTypes,
        {
          idFields,
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

    const validTypes = this.filterValidECSComponents(componentTypes);
    if (validTypes.length === 0) return [];

    const cacheKey = createCacheKey('queryWithAny', validTypes, options);
    const cached = this.getCachedResult(cacheKey);
    if (cached && options?.cache !== false) return cached;

    try {
      // 批量查询所有组件表，使用智能字段解析
      const queries = await Promise.all(
        validTypes.map(async (type) => {
          const queryFields = await this.getQueryFields(type, options?.fields);
          return {
            key: type,
            tableName: type,
            params: {
              fields: queryFields,
              first: options?.limit,
              orderBy: options?.orderBy,
            },
          };
        })
      );

      const batchResult = await this.graphqlClient.batchQuery(queries);

      // 如果用户没有指定idFields，尝试使用第一个组件的主键
      let idFields = options?.idFields;
      if (!idFields && validTypes.length > 0) {
        try {
          idFields = await this.getComponentPrimaryKeys(validTypes[0]);
        } catch (error) {
          // 如果无法获取主键，保持idFields为undefined，让extractEntityIds自动推断
        }
      }

      const result = extractUnionFromBatchResult(batchResult, validTypes, {
        idFields,
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

    // 验证包含类型都是ECS规范的组件
    const validIncludeTypes = this.filterValidECSComponents(includeTypes);
    if (validIncludeTypes.length === 0) return [];

    // 验证排除类型都是ECS规范的组件
    const validExcludeTypes = this.filterValidECSComponents(excludeTypes);

    try {
      // 先获取拥有所有包含组件的实体
      const includedEntities = await this.queryWithAll(
        validIncludeTypes,
        options
      );

      if (validExcludeTypes.length === 0) return includedEntities;

      // 获取拥有任意排除组件的实体
      const excludedEntities = await this.queryWithAny(validExcludeTypes);
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

    // 验证是否为ECS规范的组件
    if (!this.isECSComponent(componentType)) {
      console.warn(
        `⚠️ Component '${componentType}' is not a valid ECS component. Only single-primary-key tables are supported for ECS queries.`
      );
      return [];
    }

    try {
      // 智能获取查询字段和主键信息
      const queryFields = await this.getQueryFields(
        componentType,
        options?.fields
      );
      const primaryKeys = await this.getComponentPrimaryKeys(componentType);

      const connection = await this.graphqlClient.getAllTables(componentType, {
        filter: predicate,
        first: options?.limit,
        fields: queryFields,
        orderBy: options?.orderBy,
      });

      return extractEntityIds(connection, {
        idFields: options?.idFields || primaryKeys,
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

    // 验证是否为ECS规范的组件
    if (!this.isECSComponent(componentType)) {
      console.warn(
        `⚠️ Component '${componentType}' is not a valid ECS component. Only single-primary-key tables are supported for ECS queries.`
      );
      return [];
    }

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
