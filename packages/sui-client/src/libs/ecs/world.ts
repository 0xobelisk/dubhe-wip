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

    // 验证参数：不能两个都不传
    if (!componentNames?.length && !dubheConfig) {
      throw new Error(
        '组件发现配置错误：必须提供 componentNames（手动模式）或 dubheConfig（自动模式）中的一个'
      );
    }

    // 自动判断策略：优先使用 dubheConfig
    if (dubheConfig) {
      this.dubheConfig = dubheConfig;
      this.strategy = 'dubhe-config';
      console.log('🎯 自动选择策略：dubhe-config（从配置文件自动发现组件）');
    } else if (componentNames?.length) {
      this.componentNames = componentNames;
      this.strategy = 'manual';
      console.log('🔧 自动选择策略：manual（使用指定的组件名称列表）');
    }
  }

  async discover(): Promise<ComponentDiscoveryResult> {
    const components: ComponentMetadata[] = [];
    const errors: string[] = [];

    if (this.strategy === 'dubhe-config' && this.dubheConfig) {
      console.log('🎯 使用dubhe配置自动发现组件...');

      if (!this.dubheConfig.components) {
        throw new Error('dubhe配置中没有找到components部分');
      }

      for (const [componentName, componentConfig] of Object.entries(
        this.dubheConfig.components
      )) {
        const componentType = this.tableNameToComponentName(componentName);

        try {
          // 验证组件是否存在
          await this.graphqlClient.getAllTables(componentType, { first: 1 });

          // 构建字段信息
          const fields: ComponentField[] = [];
          const primaryKeys: string[] = [];
          const enumFields: string[] = [];

          console.log(`🔧 解析组件 ${componentName}:`, {
            type: typeof componentConfig,
            keys:
              typeof componentConfig === 'object' &&
              componentConfig !== null &&
              'keys' in componentConfig
                ? componentConfig.keys
                : 'N/A',
            hasFields:
              typeof componentConfig === 'object' &&
              componentConfig !== null &&
              'fields' in componentConfig,
            fieldCount:
              typeof componentConfig === 'object' &&
              componentConfig !== null &&
              'fields' in componentConfig &&
              componentConfig.fields
                ? Object.keys(componentConfig.fields).length
                : 0,
          });

          // 处理不同类型的组件
          if (typeof componentConfig === 'string') {
            // MoveType字符串，如 owned_by: "address"
            console.log(`  📝 MoveType字符串: ${componentConfig}`);
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
            // EmptyComponent，如 player: {}
            console.log(`  📝 EmptyComponent，添加默认id字段`);
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
            // Component类型，有fields定义
            console.log(
              `  📝 Component类型，有${Object.keys(componentConfig.fields).length}个字段`
            );

            // 分析主键配置
            let keyStrategy: 'custom' | 'default' | 'none' = 'default';
            if ('keys' in componentConfig) {
              if (Array.isArray(componentConfig.keys)) {
                if (componentConfig.keys.length > 0) {
                  keyStrategy = 'custom';
                  console.log(
                    `  🔑 使用自定义主键: [${componentConfig.keys.join(', ')}]`
                  );
                } else {
                  keyStrategy = 'none';
                  console.log(`  🚫 明确指定无主键 (keys: [])`);
                }
              }
            } else {
              console.log(`  📝 keys未定义，将添加默认id主键`);
            }

            // 首先处理业务字段
            for (const [fieldName, fieldType] of Object.entries(
              componentConfig.fields
            )) {
              // 根据sui-common定义，fieldType应该是MoveType（字符串）
              const camelFieldName = this.snakeToCamel(fieldName);
              const typeStr = String(fieldType);

              console.log(
                `    - ${fieldName} (${camelFieldName}): ${typeStr} -> ${this.dubheTypeToGraphQLType(typeStr)}`
              );

              // 检查该字段是否是自定义主键之一
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
                console.log(`    🔑 ${camelFieldName} 设置为主键字段`);
              }

              // 检查是否是枚举类型（检查dubheConfig.enums中是否存在）
              if (this.isEnumType(typeStr)) {
                enumFields.push(camelFieldName);
                console.log(
                  `    ✨ ${camelFieldName} 识别为枚举类型: ${typeStr}`
                );
              }
            }

            // 根据主键策略添加默认id字段
            if (keyStrategy === 'default') {
              console.log(`  📝 添加默认id主键字段`);
              fields.unshift({
                name: 'id',
                type: 'String',
                nullable: false,
                isPrimaryKey: true,
                isEnum: false,
              });
              primaryKeys.push('id');
            } else if (keyStrategy === 'none') {
              console.log(`  ⚠️ 该组件没有主键字段`);
            }
          }

          // 添加系统字段
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

          console.log(`  📊 最终字段解析结果:`);
          console.log(`    主键: [${primaryKeys.join(', ')}]`);
          console.log(`    字段 (${fields.length}个):`);
          fields.forEach((field) => {
            const tags = [];
            if (field.isPrimaryKey) tags.push('主键');
            if (field.isEnum) tags.push('枚举');
            if (!field.nullable) tags.push('必填');
            else tags.push('可空');
            console.log(
              `      - ${field.name}: ${field.type} (${tags.join(', ')})`
            );
          });
          if (enumFields.length > 0) {
            console.log(`    枚举字段: [${enumFields.join(', ')}]`);
          }

          // 检查是否应该作为ECS组件
          if (primaryKeys.length === 0) {
            console.log(
              `⚠️ ${componentType} 无主键，跳过ECS组件注册（建议使用专门的配置查询接口）`
            );
            continue; // 跳过无主键的表，不作为ECS组件
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
            description: `从dubhe配置自动发现的组件: ${componentName}`,
          };

          components.push(metadata);
          console.log(`✅ 发现组件 ${componentType} (表: ${componentName})`);
        } catch (error) {
          const errorMsg = `组件 ${componentType} 验证失败: ${formatError(error)}`;
          errors.push(errorMsg);
          console.warn(`⚠️ ${errorMsg}`);
        }
      }
    } else {
      // 手动模式
      console.log('🔧 使用手动模式发现组件...');
      console.log('📋 指定的组件类型:', this.componentNames);

      for (const componentType of this.componentNames) {
        try {
          // 验证组件是否存在
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
            description: `手动配置的组件: ${componentType}`,
          };

          components.push(metadata);
          console.log(`✅ 确认组件 ${componentType} 可用`);
        } catch (error) {
          const errorMsg = `组件 ${componentType} 验证失败: ${formatError(error)}`;
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
        // 如果不是已知的基本类型，可能是枚举或自定义类型
        // 对于未知类型，默认使用String
        console.log(`⚠️ 未知类型: ${dubheType}，使用String作为GraphQL类型`);
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
   * 检查是否是枚举类型
   */
  private isEnumType(typeStr: string): boolean {
    return !!(this.dubheConfig?.enums && this.dubheConfig.enums[typeStr]);
  }
}

/**
 * ECS世界 - 简化版本，内置组件发现
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

    // 检查GraphQL client是否包含dubhe config
    const clientDubheConfig = (this.graphqlClient as any).getDubheConfig?.();
    const configDubheConfig = config?.dubheConfig;
    const dubheConfig = configDubheConfig || clientDubheConfig;

    // 设置默认配置
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

    this.querySystem = new ECSQuery(graphqlClient);
    this.subscriptionSystem = new ECSSubscription(graphqlClient);
    this.componentDiscoverer = new SimpleComponentDiscoverer(
      graphqlClient,
      this.config.componentDiscovery.componentNames,
      this.config.componentDiscovery.dubheConfig
    );
  }

  // ============ 配置和初始化 ============

  /**
   * 配置ECS世界
   */
  async configure(config: Partial<ECSWorldConfig>): Promise<void> {
    this.config = { ...this.config, ...config };

    // 重新创建组件发现器如果配置改变
    if (config.componentDiscovery) {
      this.componentDiscoverer = new SimpleComponentDiscoverer(
        this.graphqlClient,
        this.config.componentDiscovery.componentNames,
        this.config.componentDiscovery.dubheConfig
      );
    }
  }

  /**
   * 初始化ECS世界
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 初始化ECS世界...');

      // 自动判断策略类型用于日志
      const strategy = this.config.componentDiscovery.dubheConfig
        ? 'dubhe-config'
        : 'manual';
      console.log(`📋 组件发现策略: ${strategy}`);

      if (strategy === 'dubhe-config') {
        console.log('🎯 使用dubhe配置自动发现组件，这是推荐的方式');
      }

      // 发现可用组件
      const discoveryResult = await this.componentDiscoverer.discover();
      console.log(
        `📦 发现 ${discoveryResult.components.length} 个组件 (策略: ${discoveryResult.strategy})`
      );

      if (discoveryResult.fromDubheConfig) {
        console.log('✨ 组件信息来自dubhe配置，包含完整的字段和类型信息');
      }

      if (discoveryResult.errors?.length) {
        console.warn('⚠️ 组件发现过程中遇到错误:', discoveryResult.errors);
      }

      // 更新查询系统的可用组件列表
      this.querySystem.setAvailableComponents(
        discoveryResult.components.map((comp) => comp.name)
      );

      if (this.config.queryConfig?.enableAutoFieldResolution) {
        console.log('🔧 已启用自动字段解析，查询将自动使用正确的字段');
      }

      this.isInitialized = true;
      console.log('✅ ECS世界初始化完成');
    } catch (error) {
      console.error('❌ ECS世界初始化失败:', formatError(error));
      throw error;
    }
  }

  // ============ 组件发现 ============

  /**
   * 发现组件
   */
  async discoverComponents(): Promise<ComponentType[]> {
    return this.componentDiscoverer.getComponentTypes();
  }

  /**
   * 获取可用组件列表
   */
  async getAvailableComponents(): Promise<ComponentType[]> {
    return this.componentDiscoverer.getComponentTypes();
  }

  /**
   * 获取组件元数据
   */
  async getComponentMetadata(
    componentType: ComponentType
  ): Promise<ComponentMetadata | null> {
    return this.componentDiscoverer.getComponentMetadata(componentType);
  }

  // ============ 实体查询 ============

  /**
   * 检查实体是否存在
   */
  async hasEntity(entityId: EntityId): Promise<boolean> {
    return this.querySystem.hasEntity(entityId);
  }

  /**
   * 获取所有实体ID
   */
  async getAllEntities(): Promise<EntityId[]> {
    return this.querySystem.getAllEntities();
  }

  /**
   * 获取实体总数
   */
  async getEntityCount(): Promise<number> {
    return this.querySystem.getEntityCount();
  }

  // ============ 标准ECS接口规范（驼峰命名） ============

  /**
   * 获取单个实体的完整数据
   * @param id 实体ID
   * @returns 实体的完整组件数据，如果实体不存在则返回null
   */
  async getEntity(id: EntityId): Promise<any | null> {
    try {
      // 首先检查实体是否存在
      const exists = await this.hasEntity(id);
      if (!exists) {
        return null;
      }

      // 获取实体的所有组件
      const componentTypes = await this.getComponents(id);
      if (componentTypes.length === 0) {
        return null;
      }

      // 获取所有组件的数据
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
      console.error(`获取实体 ${id} 失败:`, formatError(error));
      return null;
    }
  }

  /**
   * 获取所有实体ID列表
   * @returns 所有实体的ID数组
   */
  async getEntities(): Promise<EntityId[]> {
    return this.getAllEntities();
  }

  /**
   * 获取拥有特定组件的所有实体
   * @param componentType 组件类型
   * @returns 拥有该组件的实体ID数组
   */
  async getEntitiesByComponent(
    componentType: ComponentType
  ): Promise<EntityId[]> {
    return this.queryWith(componentType);
  }

  // 注意：getComponent, getComponents, hasComponent 方法已在下方定义

  // ============ 组件查询 ============

  /**
   * 检查实体是否拥有特定组件
   */
  async hasComponent(
    entityId: EntityId,
    componentType: ComponentType
  ): Promise<boolean> {
    return this.querySystem.hasComponent(entityId, componentType);
  }

  /**
   * 获取实体的特定组件数据
   */
  async getComponent<T>(
    entityId: EntityId,
    componentType: ComponentType
  ): Promise<T | null> {
    return this.querySystem.getComponent<T>(entityId, componentType);
  }

  /**
   * 获取实体拥有的所有组件类型
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
      console.error(`获取实体状态失败: ${formatError(error)}`);
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
      console.error(`获取组件统计失败: ${formatError(error)}`);
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
      console.error(`查找孤儿实体失败: ${formatError(error)}`);
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
   * 🆕 获取dubhe配置信息
   */
  getDubheConfig(): DubheConfig | null {
    return this.config.dubheConfig || null;
  }

  /**
   * 🆕 检查是否使用dubhe配置
   */
  isUsingDubheConfig(): boolean {
    return !!this.config.componentDiscovery.dubheConfig;
  }

  /**
   * 🆕 获取自动字段解析状态
   */
  isAutoFieldResolutionEnabled(): boolean {
    return !!this.config.queryConfig?.enableAutoFieldResolution;
  }

  // ============ 全局配置查询 ============

  /**
   * 查询全局配置表（无主键表）
   */
  async getGlobalConfig<T>(configType: string): Promise<T | null> {
    try {
      console.log(`🌐 查询全局配置: ${configType}`);
      const result = await this.graphqlClient.getAllTables(configType, {
        first: 1,
      });
      const record = result.edges[0]?.node;

      if (record) {
        console.log(`✅ 找到${configType}配置`);
        return record as T;
      } else {
        console.log(`⚠️ 未找到${configType}配置`);
        return null;
      }
    } catch (error) {
      console.error(`❌ 查询${configType}配置失败:`, formatError(error));
      return null;
    }
  }

  /**
   * 获取所有全局配置表的列表
   */
  getGlobalConfigTables(): string[] {
    if (!this.config.dubheConfig?.components) {
      return [];
    }

    const globalTables: string[] = [];

    Object.entries(this.config.dubheConfig.components).forEach(
      ([componentName, component]) => {
        // 检查是否是无主键的配置表
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
 * 创建ECS世界实例的工厂函数
 */
export function createECSWorld(
  graphqlClient: DubheGraphqlClient,
  config?: Partial<ECSWorldConfig>
): DubheECSWorld {
  return new DubheECSWorld(graphqlClient, config);
}

/**
 * 便利函数：创建带预设组件名称的ECS世界（手动模式）
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
