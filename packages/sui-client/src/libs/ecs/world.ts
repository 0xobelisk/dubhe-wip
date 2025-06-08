// ECS世界主类实现

import { DubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import type { DubheConfig } from '../dubheGraphqlClient/types';
import { ECSQuery } from './query';
import { ECSSubscription } from './subscription';
import {
  createComponentDiscoverer,
  DEFAULT_DISCOVERY_CONFIG,
} from './discovery';
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
  ComponentDiscoverer,
  ComponentMetadata,
} from './types';
import { formatError } from './utils';

/**
 * ECS世界 - 统一的ECS系统入口，支持dubhe config自动配置
 */
export class DubheECSWorld implements ECSWorld {
  private graphqlClient: DubheGraphqlClient;
  private querySystem: ECSQuery;
  private subscriptionSystem: ECSSubscription;
  private componentDiscoverer: ComponentDiscoverer;
  private config: ECSWorldConfig;
  private isInitialized = false;

  constructor(
    graphqlClient: DubheGraphqlClient,
    config?: Partial<ECSWorldConfig>
  ) {
    this.graphqlClient = graphqlClient;

    // 🆕 检查GraphQL client是否包含dubhe config
    const clientDubheConfig = (this.graphqlClient as any).getDubheConfig?.();
    const configDubheConfig = config?.dubheConfig;
    const dubheConfig = configDubheConfig || clientDubheConfig;

    // 设置默认配置，如果有dubhe config则自动配置组件发现
    let componentDiscoveryConfig = DEFAULT_DISCOVERY_CONFIG;

    if (dubheConfig) {
      console.log('🎯 检测到dubhe配置，自动配置组件发现策略为 dubhe-config');
      componentDiscoveryConfig = {
        strategy: 'dubhe-config',
        dubheConfig,
        cacheTTL: 300,
        autoRefresh: false,
        includePatterns: ['*'],
        excludePatterns: ['_*', '__*', 'internal_*'],
      };
    }

    this.config = {
      componentDiscovery: componentDiscoveryConfig,
      dubheConfig,
      queryConfig: {
        defaultCacheTimeout: 5000,
        maxConcurrentQueries: 10,
        enableBatchOptimization: true,
        enableAutoFieldResolution: !!dubheConfig, // 🆕 有dubhe config时启用自动字段解析
      },
      subscriptionConfig: {
        defaultDebounceMs: 100,
        maxSubscriptions: 100,
        reconnectOnError: true,
      },
      ...config,
    };

    // 如果config覆盖了componentDiscovery但没有dubheConfig，则使用传入的dubheConfig
    if (
      config?.componentDiscovery &&
      !config.componentDiscovery.dubheConfig &&
      dubheConfig
    ) {
      this.config.componentDiscovery.dubheConfig = dubheConfig;
    }

    this.querySystem = new ECSQuery(graphqlClient);
    this.subscriptionSystem = new ECSSubscription(graphqlClient);
    this.componentDiscoverer = createComponentDiscoverer(
      graphqlClient,
      this.config.componentDiscovery
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
      this.componentDiscoverer = createComponentDiscoverer(
        this.graphqlClient,
        this.config.componentDiscovery
      );
    }

    // 🆕 如果设置了新的dubhe config，则更新组件发现器
    if (config.dubheConfig && this.componentDiscoverer.setDubheConfig) {
      this.componentDiscoverer.setDubheConfig(config.dubheConfig);
    }
  }

  /**
   * 初始化ECS世界
   */
  async initialize(): Promise<void> {
    try {
      console.log('🚀 初始化ECS世界...');

      // 🆕 显示使用的发现策略
      const strategy = this.config.componentDiscovery.strategy;
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

      // 🆕 如果启用了自动字段解析，显示提示
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

  /**
   * 刷新组件缓存
   */
  async refreshComponentCache(): Promise<void> {
    console.log('🔄 刷新组件缓存...');
    const result = await this.componentDiscoverer.refresh();

    // 更新查询系统
    this.querySystem.setAvailableComponents(
      result.components.map((comp) => comp.name)
    );

    console.log(`✅ 组件缓存已刷新，发现 ${result.components.length} 个组件`);
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
   * 获取组件发现器
   */
  getComponentDiscoverer(): ComponentDiscoverer {
    return this.componentDiscoverer;
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
    return this.config.componentDiscovery.strategy === 'dubhe-config';
  }

  /**
   * 🆕 获取自动字段解析状态
   */
  isAutoFieldResolutionEnabled(): boolean {
    return !!this.config.queryConfig?.enableAutoFieldResolution;
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
 * 便利函数：创建带预设组件的ECS世界
 */
export function createECSWorldWithComponents(
  graphqlClient: DubheGraphqlClient,
  componentTypes: ComponentType[],
  config?: Partial<ECSWorldConfig>
): DubheECSWorld {
  return new DubheECSWorld(graphqlClient, {
    ...config,
    componentDiscovery: {
      strategy: 'manual',
      componentTypes,
      cacheTTL: 300,
      autoRefresh: false,
      includePatterns: ['*'],
      excludePatterns: ['_*', '__*', 'internal_*'],
      ...config?.componentDiscovery,
    },
  });
}
