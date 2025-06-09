// ECS世界主类实现 - 简化版本，内置组件发现

import { DubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import { DubheConfig } from '@0xobelisk/sui-common';
import { ECSQuery } from './query';
import { ECSSubscription } from './subscription';
import {
  EntityId,
  ComponentType,
  QueryOptions,
  SubscriptionOptions,
  ComponentCallback,
  QueryChangeCallback,
  QueryWatcher,
  Unsubscribe,
  ECSWorld,
  PagedResult,
  ECSWorldConfig,
  ComponentMetadata,
  ComponentDiscoveryResult,
  ComponentField,
} from './types';
import { formatError } from './utils';

/**
 * 简化的组件发现器 - 自动策略判断
 */
class SimpleComponentDiscoverer {
  private graphqlClient: DubheGraphqlClient;
  private componentNames: ComponentType[] = [];
  private dubheConfig: DubheConfig | null = null;
  private strategy: 'manual' | 'dubhe-config' = 'manual';

  constructor(
    graphqlClient: DubheGraphqlClient,
    componentNames?: ComponentType[],
    dubheConfig?: DubheConfig
  ) {
    this.graphqlClient = graphqlClient;

    // Validate parameters: cannot have both empty
    if (!componentNames?.length && !dubheConfig) {
      throw new Error(
        'Component discovery configuration error: must provide either componentNames (manual mode) or dubheConfig (auto mode)'
      );
    }

    // Auto-determine strategy: prioritize dubheConfig
    if (dubheConfig) {
      this.dubheConfig = dubheConfig;
      this.strategy = 'dubhe-config';
    } else if (componentNames?.length) {
      this.componentNames = componentNames;
      this.strategy = 'manual';
    }
  }

  async discover(): Promise<ComponentDiscoveryResult> {
    const components: ComponentMetadata[] = [];
    const errors: string[] = [];

    if (this.strategy === 'dubhe-config' && this.dubheConfig) {
      if (!this.dubheConfig.components) {
        throw new Error('Components section not found in dubhe configuration');
      }

      for (const [componentName, componentConfig] of Object.entries(
        this.dubheConfig.components
      )) {
        const componentType = this.tableNameToComponentName(componentName);

        try {
          // Verify component exists
          await this.graphqlClient.getAllTables(componentType, { first: 1 });

          // Build field information
          const fields: ComponentField[] = [];
          const primaryKeys: string[] = [];
          const enumFields: string[] = [];

          // Handle different component types
          if (typeof componentConfig === 'string') {
            // MoveType string, e.g. owned_by: "address"
            fields.push(
              {
                name: 'id',
                type: 'String',
                nullable: false,
                isPrimaryKey: true,
                isEnum: false,
              },
              {
                name: 'value',
                type: this.dubheTypeToGraphQLType(componentConfig),
                nullable: true,
                isPrimaryKey: false,
                isEnum: this.isEnumType(componentConfig),
              }
            );
            primaryKeys.push('id');
          } else if (
            typeof componentConfig === 'object' &&
            componentConfig !== null &&
            Object.keys(componentConfig).length === 0
          ) {
            // EmptyComponent, e.g. player: {}
            fields.push({
              name: 'id',
              type: 'String',
              nullable: false,
              isPrimaryKey: true,
              isEnum: false,
            });
            primaryKeys.push('id');
          } else if (
            typeof componentConfig === 'object' &&
            componentConfig !== null &&
            'fields' in componentConfig &&
            componentConfig.fields
          ) {
            // Component type with fields definition

            // Analyze primary key configuration
            let keyStrategy: 'custom' | 'default' | 'none' = 'default';
            if ('keys' in componentConfig) {
              if (Array.isArray(componentConfig.keys)) {
                if (componentConfig.keys.length > 0) {
                  keyStrategy = 'custom';
                } else {
                  keyStrategy = 'none';
                }
              }
            }

            // First handle business fields
            for (const [fieldName, fieldType] of Object.entries(
              componentConfig.fields
            )) {
              // According to sui-common definition, fieldType should be MoveType (string)
              const camelFieldName = this.snakeToCamel(fieldName);
              const typeStr = String(fieldType);

              // Check if this field is one of the custom primary keys
              const isCustomKey =
                keyStrategy === 'custom' &&
                componentConfig.keys!.includes(fieldName);

              fields.push({
                name: camelFieldName,
                type: this.dubheTypeToGraphQLType(typeStr),
                nullable: !isCustomKey, // 主键字段不可为空
                isPrimaryKey: isCustomKey,
                isEnum: this.isEnumType(typeStr),
              });

              if (isCustomKey) {
                primaryKeys.push(camelFieldName);
              }

              // Check if it's an enum type (check if exists in dubheConfig.enums)
              if (this.isEnumType(typeStr)) {
                enumFields.push(camelFieldName);
              }
            }

            // Add default id field based on primary key strategy
            if (keyStrategy === 'default') {
              fields.unshift({
                name: 'id',
                type: 'String',
                nullable: false,
                isPrimaryKey: true,
                isEnum: false,
              });
              primaryKeys.push('id');
            }
          }

          // Add system fields
          fields.push(
            {
              name: 'createdAt',
              type: 'String',
              nullable: false,
              isPrimaryKey: false,
              isEnum: false,
            },
            {
              name: 'updatedAt',
              type: 'String',
              nullable: false,
              isPrimaryKey: false,
              isEnum: false,
            }
          );

          // console.log(`  📊 最终字段解析结果:`);
          // console.log(`    主键: [${primaryKeys.join(', ')}]`);
          // console.log(`    字段 (${fields.length}个):`);
          // fields.forEach((field) => {
          //   const tags = [];
          //   if (field.isPrimaryKey) tags.push('主键');
          //   if (field.isEnum) tags.push('枚举');
          //   if (!field.nullable) tags.push('必填');
          //   else tags.push('可空');
          //   console.log(
          //     `      - ${field.name}: ${field.type} (${tags.join(', ')})`
          //   );
          // });
          // if (enumFields.length > 0) {
          //   console.log(`    枚举字段: [${enumFields.join(', ')}]`);
          // }

          // Check if should be registered as ECS component
          if (primaryKeys.length === 0) {
            console.log(
              `⚠️ ${componentType} has no primary key, skipping ECS component registration (recommend using dedicated config query interface)`
            );
            continue; // Skip tables without primary keys
          }

          const metadata: ComponentMetadata = {
            name: componentType,
            tableName: componentName,
            fields,
            primaryKeys,
            hasDefaultId:
              typeof componentConfig !== 'object' ||
              componentConfig === null ||
              !('keys' in componentConfig) ||
              !componentConfig.keys ||
              componentConfig.keys.length === 0,
            enumFields,
            lastUpdated: Date.now(),
            description: `Auto-discovered component from dubhe config: ${componentName}`,
          };

          components.push(metadata);
          console.log(
            `✅ Discovered component ${componentType} (table: ${componentName})`
          );
        } catch (error) {
          const errorMsg = `Component ${componentType} validation failed: ${formatError(error)}`;
          errors.push(errorMsg);
          console.warn(`⚠️ ${errorMsg}`);
        }
      }
    } else {
      // Manual mode

      for (const componentType of this.componentNames) {
        try {
          // Verify component exists
          await this.graphqlClient.getAllTables(componentType, { first: 1 });

          const metadata: ComponentMetadata = {
            name: componentType,
            tableName: this.componentNameToTableName(componentType),
            fields: [
              {
                name: 'id',
                type: 'String',
                nullable: false,
                isPrimaryKey: true,
                isEnum: false,
              },
              {
                name: 'createdAt',
                type: 'String',
                nullable: false,
                isPrimaryKey: false,
                isEnum: false,
              },
              {
                name: 'updatedAt',
                type: 'String',
                nullable: false,
                isPrimaryKey: false,
                isEnum: false,
              },
            ],
            primaryKeys: [],
            hasDefaultId: true,
            enumFields: [],
            lastUpdated: Date.now(),
            description: `Manually configured component: ${componentType}`,
          };

          components.push(metadata);
          console.log(`✅ Confirmed component ${componentType} available`);
        } catch (error) {
          const errorMsg = `Component ${componentType} validation failed: ${formatError(error)}`;
          errors.push(errorMsg);
          console.warn(`⚠️ ${errorMsg}`);
        }
      }
    }

    return {
      components,
      discoveredAt: Date.now(),
      strategy: this.strategy,
      errors: errors.length > 0 ? errors : undefined,
      totalDiscovered: components.length,
      fromDubheConfig: this.strategy === 'dubhe-config',
    };
  }

  async getComponentTypes(): Promise<ComponentType[]> {
    const result = await this.discover();
    return result.components.map((comp) => comp.name);
  }

  async getComponentMetadata(
    componentType: ComponentType
  ): Promise<ComponentMetadata | null> {
    const result = await this.discover();
    return (
      result.components.find((comp) => comp.name === componentType) || null
    );
  }

  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private dubheTypeToGraphQLType(dubheType: string): string {
    // 处理向量类型 vector<T>
    if (dubheType.startsWith('vector<') && dubheType.endsWith('>')) {
      return 'String'; // GraphQL通常将复杂类型序列化为JSON字符串
    }

    switch (dubheType) {
      case 'u8':
      case 'u16':
      case 'u32':
      case 'u64':
      case 'u128':
      case 'i8':
      case 'i16':
      case 'i32':
      case 'i64':
      case 'i128':
        return 'Int';
      case 'address':
      case 'string':
        return 'String';
      case 'bool':
        return 'Boolean';
      case 'enum':
        return 'String';
      default:
        // If not a known basic type, might be enum or custom type
        // For unknown types, default to String
        return 'String';
    }
  }

  private componentNameToTableName(componentName: string): string {
    if (!componentName.endsWith('s')) {
      return componentName + 's';
    }
    return componentName;
  }

  private tableNameToComponentName(tableName: string): string {
    if (tableName.endsWith('s') && tableName.length > 1) {
      return tableName.slice(0, -1);
    }
    return tableName;
  }

  /**
   * Check if type is enum
   */
  private isEnumType(typeStr: string): boolean {
    return !!(this.dubheConfig?.enums && this.dubheConfig.enums[typeStr]);
  }
}

/**
 * ECS World - Simplified version with built-in component discovery
 */
export class DubheECSWorld implements ECSWorld {
  private graphqlClient: DubheGraphqlClient;
  private querySystem: ECSQuery;
  private subscriptionSystem: ECSSubscription;
  private componentDiscoverer: SimpleComponentDiscoverer;
  private config: ECSWorldConfig;
  private isInitialized = false;

  constructor(
    graphqlClient: DubheGraphqlClient,
    config?: Partial<ECSWorldConfig>
  ) {
    this.graphqlClient = graphqlClient;

    // Check if GraphQL client contains dubhe config
    const clientDubheConfig = (this.graphqlClient as any).getDubheConfig?.();
    const configDubheConfig = config?.dubheConfig;
    const dubheConfig = configDubheConfig || clientDubheConfig;

    // Set default configuration
    this.config = {
      componentDiscovery: {
        componentNames: config?.componentDiscovery?.componentNames || [],
        dubheConfig,
      },
      dubheConfig,
      queryConfig: {
        defaultCacheTimeout: 5000,
        maxConcurrentQueries: 10,
        enableBatchOptimization: true,
        enableAutoFieldResolution: !!dubheConfig,
      },
      subscriptionConfig: {
        defaultDebounceMs: 100,
        maxSubscriptions: 100,
        reconnectOnError: true,
      },
      ...config,
    };

    this.componentDiscoverer = new SimpleComponentDiscoverer(
      graphqlClient,
      this.config.componentDiscovery.componentNames,
      this.config.componentDiscovery.dubheConfig
    );
    this.querySystem = new ECSQuery(graphqlClient, this.componentDiscoverer);
    this.subscriptionSystem = new ECSSubscription(graphqlClient);
  }

  // ============ Configuration and Initialization ============

  /**
   * Configure ECS world
   */
  async configure(config: Partial<ECSWorldConfig>): Promise<void> {
    this.config = { ...this.config, ...config };

    // Recreate component discoverer if configuration changed
    if (config.componentDiscovery) {
      this.componentDiscoverer = new SimpleComponentDiscoverer(
        this.graphqlClient,
        this.config.componentDiscovery.componentNames,
        this.config.componentDiscovery.dubheConfig
      );
    }
  }

  /**
   * Initialize ECS world
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing ECS world...');

      // Discover available components
      const discoveryResult = await this.componentDiscoverer.discover();

      // Update query system's available components list
      this.querySystem.setAvailableComponents(
        discoveryResult.components.map((comp) => comp.name)
      );

      if (this.config.queryConfig?.enableAutoFieldResolution) {
        console.log(
          '🔧 Auto field resolution enabled, queries will use correct fields automatically'
        );
      }

      this.isInitialized = true;
      console.log('✅ ECS world initialization completed');
    } catch (error) {
      console.error('❌ ECS world initialization failed:', formatError(error));
      throw error;
    }
  }

  // ============ Component Discovery ============

  /**
   * Discover components
   */
  async discoverComponents(): Promise<ComponentType[]> {
    return this.componentDiscoverer.getComponentTypes();
  }

  /**
   * Get available components list
   */
  async getAvailableComponents(): Promise<ComponentType[]> {
    return this.componentDiscoverer.getComponentTypes();
  }

  /**
   * Get component metadata
   */
  async getComponentMetadata(
    componentType: ComponentType
  ): Promise<ComponentMetadata | null> {
    return this.componentDiscoverer.getComponentMetadata(componentType);
  }

  // ============ Entity Queries ============

  /**
   * Check if entity exists
   */
  async hasEntity(entityId: EntityId): Promise<boolean> {
    return this.querySystem.hasEntity(entityId);
  }

  /**
   * Get all entity IDs
   */
  async getAllEntities(): Promise<EntityId[]> {
    return this.querySystem.getAllEntities();
  }

  /**
   * Get entity count
   */
  async getEntityCount(): Promise<number> {
    return this.querySystem.getEntityCount();
  }

  // ============ Standard ECS Interface (camelCase naming) ============

  /**
   * Get complete data of a single entity
   * @param id Entity ID
   * @returns Complete component data of the entity, or null if entity doesn't exist
   */
  async getEntity(id: EntityId): Promise<any | null> {
    try {
      // First check if entity exists
      const exists = await this.hasEntity(id);
      if (!exists) {
        return null;
      }

      // Get all components of the entity
      const componentTypes = await this.getComponents(id);
      if (componentTypes.length === 0) {
        return null;
      }

      // Get data for all components
      const entityData: Record<string, any> = {
        id: id,
        components: {},
      };

      for (const componentType of componentTypes) {
        const componentData = await this.getComponent(id, componentType);
        if (componentData) {
          entityData.components[componentType] = componentData;
        }
      }

      return entityData;
    } catch (error) {
      console.error(`Failed to get entity ${id}:`, formatError(error));
      return null;
    }
  }

  /**
   * Get all entity ID list
   * @returns Array of all entity IDs
   */
  async getEntities(): Promise<EntityId[]> {
    return this.getAllEntities();
  }

  /**
   * Get all entities that have a specific component
   * @param componentType Component type
   * @returns Array of entity IDs that have this component
   */
  async getEntitiesByComponent(
    componentType: ComponentType
  ): Promise<EntityId[]> {
    return this.queryWith(componentType);
  }

  // Note: getComponent, getComponents, hasComponent methods are defined below

  // ============ Component Queries ============

  /**
   * Check if entity has specific component
   */
  async hasComponent(
    entityId: EntityId,
    componentType: ComponentType
  ): Promise<boolean> {
    return this.querySystem.hasComponent(entityId, componentType);
  }

  /**
   * Get specific component data of entity
   */
  async getComponent<T>(
    entityId: EntityId,
    componentType: ComponentType
  ): Promise<T | null> {
    return this.querySystem.getComponent<T>(entityId, componentType);
  }

  /**
   * Get all component types that entity has
   */
  async getComponents(entityId: EntityId): Promise<ComponentType[]> {
    return this.querySystem.getComponents(entityId);
  }

  // ============ 世界查询 ============

  /**
   * 查询拥有特定组件的所有实体
   */
  async queryWith(
    componentType: ComponentType,
    options?: QueryOptions
  ): Promise<EntityId[]> {
    return this.querySystem.queryWith(componentType, options);
  }

  /**
   * 查询拥有所有指定组件的实体（交集）
   */
  async queryWithAll(
    componentTypes: ComponentType[],
    options?: QueryOptions
  ): Promise<EntityId[]> {
    return this.querySystem.queryWithAll(componentTypes, options);
  }

  /**
   * 查询拥有任意指定组件的实体（并集）
   */
  async queryWithAny(
    componentTypes: ComponentType[],
    options?: QueryOptions
  ): Promise<EntityId[]> {
    return this.querySystem.queryWithAny(componentTypes, options);
  }

  /**
   * 查询拥有包含组件但不拥有排除组件的实体
   */
  async queryWithout(
    includeTypes: ComponentType[],
    excludeTypes: ComponentType[],
    options?: QueryOptions
  ): Promise<EntityId[]> {
    return this.querySystem.queryWithout(includeTypes, excludeTypes, options);
  }

  // ============ 条件查询 ============

  /**
   * 基于条件查询组件
   */
  async queryWhere<T>(
    componentType: ComponentType,
    predicate: Record<string, any>,
    options?: QueryOptions
  ): Promise<EntityId[]> {
    return this.querySystem.queryWhere<T>(componentType, predicate, options);
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
    return this.querySystem.queryRange(componentType, field, min, max, options);
  }

  /**
   * 分页查询
   */
  async queryPaged(
    componentTypes: ComponentType[],
    page: number,
    pageSize: number
  ): Promise<PagedResult<EntityId>> {
    return this.querySystem.queryPaged(componentTypes, page, pageSize);
  }

  // ============ 查询构建器 ============

  /**
   * 创建查询构建器
   */
  query() {
    return this.querySystem.query();
  }

  // ============ 订阅系统 ============

  /**
   * 监听组件添加事件
   */
  onComponentAdded<T>(
    componentType: ComponentType,
    callback: ComponentCallback<T>,
    options?: SubscriptionOptions
  ): Unsubscribe {
    return this.subscriptionSystem.onComponentAdded<T>(
      componentType,
      callback,
      options
    );
  }

  /**
   * 监听组件移除事件
   */
  onComponentRemoved<T>(
    componentType: ComponentType,
    callback: ComponentCallback<T>,
    options?: SubscriptionOptions
  ): Unsubscribe {
    return this.subscriptionSystem.onComponentRemoved<T>(
      componentType,
      callback,
      options
    );
  }

  /**
   * 监听组件变化事件
   */
  onComponentChanged<T>(
    componentType: ComponentType,
    callback: ComponentCallback<T>,
    options?: SubscriptionOptions
  ): Unsubscribe {
    return this.subscriptionSystem.onComponentChanged<T>(
      componentType,
      callback,
      options
    );
  }

  /**
   * 监听特定条件的组件变化
   */
  onComponentCondition<T>(
    componentType: ComponentType,
    filter: Record<string, any>,
    callback: ComponentCallback<T>,
    options?: SubscriptionOptions
  ): Unsubscribe {
    return this.subscriptionSystem.onComponentCondition<T>(
      componentType,
      filter,
      callback,
      options
    );
  }

  /**
   * 监听查询结果变化
   */
  watchQuery(
    componentTypes: ComponentType[],
    callback: QueryChangeCallback,
    options?: SubscriptionOptions
  ): QueryWatcher {
    return this.subscriptionSystem.watchQuery(
      componentTypes,
      callback,
      options
    );
  }

  /**
   * 创建实时数据流
   */
  createRealTimeStream<T>(
    componentType: ComponentType,
    initialFilter?: Record<string, any>
  ) {
    return this.subscriptionSystem.createRealTimeStream<T>(
      componentType,
      initialFilter
    );
  }

  // ============ 便捷方法 ============

  /**
   * 查询拥有指定组件的实体数据（包含组件数据）
   */
  async queryWithComponentData<T>(
    componentType: ComponentType,
    options?: QueryOptions
  ): Promise<Array<{ entityId: EntityId; data: T }>> {
    try {
      const entityIds = await this.queryWith(componentType, options);
      const results: Array<{ entityId: EntityId; data: T }> = [];

      for (const entityId of entityIds) {
        const componentData = await this.getComponent<T>(
          entityId,
          componentType
        );
        if (componentData) {
          results.push({ entityId, data: componentData });
        }
      }

      return results;
    } catch (error) {
      console.error(`查询组件数据失败: ${formatError(error)}`);
      return [];
    }
  }

  /**
   * 查询多组件实体数据
   */
  async queryMultiComponentData<T1, T2>(
    component1Type: ComponentType,
    component2Type: ComponentType,
    options?: QueryOptions
  ): Promise<Array<{ entityId: EntityId; data1: T1; data2: T2 }>> {
    try {
      const entityIds = await this.queryWithAll(
        [component1Type, component2Type],
        options
      );
      const results: Array<{ entityId: EntityId; data1: T1; data2: T2 }> = [];

      for (const entityId of entityIds) {
        const [data1, data2] = await Promise.all([
          this.getComponent<T1>(entityId, component1Type),
          this.getComponent<T2>(entityId, component2Type),
        ]);

        if (data1 && data2) {
          results.push({ entityId, data1, data2 });
        }
      }

      return results;
    } catch (error) {
      console.error(`查询多组件数据失败: ${formatError(error)}`);
      return [];
    }
  }

  /**
   * 获取实体的完整状态（所有组件数据）
   */
  async getEntityState(entityId: EntityId): Promise<{
    entityId: EntityId;
    components: Record<ComponentType, any>;
  } | null> {
    try {
      const componentTypes = await this.getComponents(entityId);
      if (componentTypes.length === 0) return null;

      const components: Record<ComponentType, any> = {};

      for (const componentType of componentTypes) {
        const componentData = await this.getComponent(entityId, componentType);
        if (componentData) {
          components[componentType] = componentData;
        }
      }

      return { entityId, components };
    } catch (error) {
      console.error(`Failed to get entity state: ${formatError(error)}`);
      return null;
    }
  }

  // ============ 统计和分析 ============

  /**
   * 获取组件统计信息
   */
  async getComponentStats(): Promise<Record<ComponentType, number>> {
    try {
      const stats: Record<ComponentType, number> = {};

      // 获取所有可用组件类型
      const componentTypes = await this.getAvailableComponents();

      await Promise.all(
        componentTypes.map(async (componentType) => {
          try {
            const entities = await this.queryWith(componentType);
            stats[componentType] = entities.length;
          } catch (error) {
            stats[componentType] = 0;
          }
        })
      );

      return stats;
    } catch (error) {
      console.error(`Failed to get component stats: ${formatError(error)}`);
      return {};
    }
  }

  /**
   * 查找孤儿实体（只有一个组件的实体）
   */
  async findOrphanEntities(): Promise<EntityId[]> {
    try {
      const allEntities = await this.getAllEntities();
      const orphanEntities: EntityId[] = [];

      for (const entityId of allEntities) {
        const components = await this.getComponents(entityId);
        if (components.length === 1) {
          orphanEntities.push(entityId);
        }
      }

      return orphanEntities;
    } catch (error) {
      console.error(`Failed to find orphan entities: ${formatError(error)}`);
      return [];
    }
  }

  // ============ 资源管理 ============

  /**
   * 取消所有订阅
   */
  unsubscribeAll(): void {
    this.subscriptionSystem.unsubscribeAll();
  }

  /**
   * 清理所有缓存
   */
  clearCache(): void {
    this.querySystem.dispose();
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.querySystem.dispose();
    this.subscriptionSystem.dispose();
  }

  // ============ 获取底层客户端 ============

  /**
   * 获取GraphQL客户端（用于高级操作）
   */
  getGraphQLClient(): DubheGraphqlClient {
    return this.graphqlClient;
  }

  /**
   * 获取查询系统（用于高级查询操作）
   */
  getQuerySystem(): ECSQuery {
    return this.querySystem;
  }

  /**
   * 获取订阅系统（用于高级订阅操作）
   */
  getSubscriptionSystem(): ECSSubscription {
    return this.subscriptionSystem;
  }

  /**
   * 获取ECS世界配置
   */
  getConfig(): ECSWorldConfig {
    return { ...this.config };
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get dubhe configuration info
   */
  getDubheConfig(): DubheConfig | null {
    return this.config.dubheConfig || null;
  }

  /**
   * Check if using dubhe configuration
   */
  isUsingDubheConfig(): boolean {
    return !!this.config.componentDiscovery.dubheConfig;
  }

  /**
   * Get auto field resolution status
   */
  isAutoFieldResolutionEnabled(): boolean {
    return !!this.config.queryConfig?.enableAutoFieldResolution;
  }

  // ============ Global Config Queries ============

  /**
   * Query global config table (table without primary key)
   */
  async getGlobalConfig<T>(configType: string): Promise<T | null> {
    try {
      console.log(`🌐 Querying global config: ${configType}`);
      const result = await this.graphqlClient.getAllTables(configType, {
        first: 1,
      });
      const record = result.edges[0]?.node;

      if (record) {
        console.log(`✅ Found ${configType} config`);
        return record as T;
      } else {
        console.log(`⚠️ ${configType} config not found`);
        return null;
      }
    } catch (error) {
      console.error(
        `❌ Failed to query ${configType} config:`,
        formatError(error)
      );
      return null;
    }
  }

  /**
   * Get list of all global config tables
   */
  getGlobalConfigTables(): string[] {
    if (!this.config.dubheConfig?.components) {
      return [];
    }

    const globalTables: string[] = [];

    Object.entries(this.config.dubheConfig.components).forEach(
      ([componentName, component]) => {
        // Check if it's a config table without primary key
        if (
          typeof component === 'object' &&
          component !== null &&
          'keys' in component
        ) {
          if (Array.isArray(component.keys) && component.keys.length === 0) {
            globalTables.push(componentName);
          }
        }
      }
    );

    return globalTables;
  }
}

/**
 * Factory function to create ECS world instance
 */
export function createECSWorld(
  graphqlClient: DubheGraphqlClient,
  config?: Partial<ECSWorldConfig>
): DubheECSWorld {
  return new DubheECSWorld(graphqlClient, config);
}

/**
 * Convenience function: Create ECS world with preset component names (manual mode)
 */
export function createECSWorldWithComponents(
  graphqlClient: DubheGraphqlClient,
  componentNames: ComponentType[],
  config?: Partial<ECSWorldConfig>
): DubheECSWorld {
  return new DubheECSWorld(graphqlClient, {
    ...config,
    componentDiscovery: {
      componentNames,
      ...config?.componentDiscovery,
    },
  });
}
