// 组件发现系统 - 简化版本，仅支持手动模式和dubhe config模式

import { DubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import type { DubheConfig } from '../dubheGraphqlClient/types';
import {
  ComponentDiscoverer,
  ComponentDiscoveryConfig,
  ComponentDiscoveryResult,
  ComponentMetadata,
  ComponentType,
  ComponentField,
} from './types';
import { formatError } from './utils';

/**
 * ECS组件发现器 - 简化版本，支持手动模式和dubhe config自动发现
 */
export class ECSComponentDiscoverer implements ComponentDiscoverer {
  private graphqlClient: DubheGraphqlClient;
  private config: ComponentDiscoveryConfig;
  private cache: ComponentDiscoveryResult | null = null;
  private lastCacheTime = 0;
  private dubheConfig: DubheConfig | null = null;

  constructor(
    graphqlClient: DubheGraphqlClient,
    config: ComponentDiscoveryConfig
  ) {
    this.graphqlClient = graphqlClient;
    this.config = {
      cacheTTL: 300,
      autoRefresh: false,
      includePatterns: ['*'],
      excludePatterns: [],
      ...config,
    };

    // 如果配置中包含dubhe config，则保存并切换策略
    if (config.dubheConfig) {
      this.dubheConfig = config.dubheConfig;
      if (this.config.strategy !== 'manual') {
        this.config.strategy = 'dubhe-config';
      }
    }
  }

  /**
   * 设置dubhe配置
   */
  setDubheConfig(dubheConfig: DubheConfig): void {
    this.dubheConfig = dubheConfig;
    this.cache = null; // 清除缓存，强制重新发现
    this.lastCacheTime = 0;
  }

  /**
   * 获取dubhe配置
   */
  getDubheConfig(): DubheConfig | null {
    return this.dubheConfig;
  }

  /**
   * 发现组件
   */
  async discover(): Promise<ComponentDiscoveryResult> {
    // 检查缓存
    if (this.isValidCache()) {
      return this.cache!;
    }

    let result: ComponentDiscoveryResult;

    try {
      switch (this.config.strategy) {
        case 'dubhe-config':
          result = await this.discoverFromDubheConfig();
          break;
        case 'manual':
          result = await this.discoverManually();
          break;
        default:
          console.warn(
            `⚠️ 不支持的发现策略: ${this.config.strategy}，使用手动模式`
          );
          result = await this.discoverManually();
      }

      // 应用过滤器
      result.components = this.filterComponents(result.components);

      // 更新缓存
      this.cache = result;
      this.lastCacheTime = Date.now();

      return result;
    } catch (error) {
      console.error(`组件发现失败: ${formatError(error)}`);

      // 返回默认结果
      return {
        components: [],
        discoveredAt: Date.now(),
        strategy: this.config.strategy,
        errors: [formatError(error)],
        totalDiscovered: 0,
        fromDubheConfig: this.config.strategy === 'dubhe-config',
      };
    }
  }

  /**
   * 刷新组件发现
   */
  async refresh(): Promise<ComponentDiscoveryResult> {
    this.cache = null;
    this.lastCacheTime = 0;
    return this.discover();
  }

  /**
   * 获取组件类型列表
   */
  async getComponentTypes(): Promise<ComponentType[]> {
    const result = await this.discover();
    return result.components.map((comp) => comp.name);
  }

  /**
   * 获取组件元数据
   */
  async getComponentMetadata(
    componentType: ComponentType
  ): Promise<ComponentMetadata | null> {
    const result = await this.discover();
    return (
      result.components.find((comp) => comp.name === componentType) || null
    );
  }

  /**
   * 从dubhe配置发现组件 - 推荐的新方式
   */
  private async discoverFromDubheConfig(): Promise<ComponentDiscoveryResult> {
    try {
      const dubheConfig = this.dubheConfig || this.config.dubheConfig;
      if (!dubheConfig) {
        throw new Error('dubhe-config 策略需要提供 dubheConfig');
      }

      console.log('🎯 使用dubhe配置自动发现组件...');

      const components: ComponentMetadata[] = [];
      const errors: string[] = [];

      // 从dubhe config中的components获取表信息
      if (!dubheConfig.components) {
        throw new Error('dubhe配置中没有找到components部分');
      }

      for (const [componentName, componentConfig] of Object.entries(
        dubheConfig.components
      )) {
        const componentType = this.tableNameToComponentName(componentName);

        try {
          // 验证组件是否存在
          await this.graphqlClient.getAllTables(componentType, {
            first: 1,
          });

          // 从dubhe组件配置构建字段信息
          const fields: ComponentField[] = [];
          const primaryKeys: string[] = [];
          const enumFields: string[] = [];

          // 处理组件字段
          if (componentConfig.fields) {
            for (const [fieldName, fieldConfig] of Object.entries(
              componentConfig.fields
            )) {
              // 处理不同的字段配置格式
              if (typeof fieldConfig === 'string') {
                // 简单字符串类型
                const camelFieldName = this.snakeToCamel(fieldName);
                fields.push({
                  name: camelFieldName,
                  type: this.dubheTypeToGraphQLType(fieldConfig),
                  nullable: true,
                  isPrimaryKey: false,
                  isEnum: fieldConfig === 'enum',
                });

                if (fieldConfig === 'enum') {
                  enumFields.push(camelFieldName);
                }
              } else if (fieldConfig && typeof fieldConfig === 'object') {
                // 对象类型配置
                const camelFieldName = this.snakeToCamel(fieldName);
                const fieldObj = fieldConfig as any;
                fields.push({
                  name: camelFieldName,
                  type: this.dubheTypeToGraphQLType(fieldObj.type || 'string'),
                  nullable: !fieldObj.required,
                  isPrimaryKey: false,
                  isEnum: fieldObj.type === 'enum',
                });

                if (fieldObj.type === 'enum') {
                  enumFields.push(camelFieldName);
                }
              }
            }
          }

          // 处理主键配置
          if (componentConfig.keys) {
            if (Array.isArray(componentConfig.keys)) {
              primaryKeys.push(
                ...componentConfig.keys.map((key) => this.snakeToCamel(key))
              );
            }
          }

          // 添加系统字段
          fields.push({
            name: 'createdAt',
            type: 'String',
            nullable: false,
            isPrimaryKey: false,
            isEnum: false,
          });
          fields.push({
            name: 'updatedAt',
            type: 'String',
            nullable: false,
            isPrimaryKey: false,
            isEnum: false,
          });

          const metadata: ComponentMetadata = {
            name: componentType,
            tableName: componentName,
            fields,
            primaryKeys,
            hasDefaultId:
              !componentConfig.keys || componentConfig.keys.length === 0,
            enumFields,
            lastUpdated: Date.now(),
            description: `从dubhe配置自动发现的组件: ${componentName}`,
          };

          components.push(metadata);
          console.log(`✅ 发现组件 ${componentType} (表: ${componentName})`);
          console.log(`   - 主键: [${primaryKeys.join(', ')}]`);
          console.log(`   - 字段: [${fields.map((f) => f.name).join(', ')}]`);
          console.log(`   - 枚举字段: [${enumFields.join(', ')}]`);
        } catch (error) {
          const errorMsg = `组件 ${componentType} 验证失败: ${formatError(error)}`;
          errors.push(errorMsg);
          console.warn(`⚠️ ${errorMsg}`);
        }
      }

      return {
        components,
        discoveredAt: Date.now(),
        strategy: 'dubhe-config',
        errors: errors.length > 0 ? errors : undefined,
        totalDiscovered: components.length,
        fromDubheConfig: true,
      };
    } catch (error) {
      throw new Error(`Dubhe配置发现失败: ${formatError(error)}`);
    }
  }

  /**
   * snake_case转camelCase
   */
  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * dubhe类型转GraphQL类型
   */
  private dubheTypeToGraphQLType(dubheType: string): string {
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
        return 'String';
    }
  }

  /**
   * 手动指定组件 - 简化版本
   */
  private async discoverManually(): Promise<ComponentDiscoveryResult> {
    try {
      if (!this.config.componentTypes?.length) {
        throw new Error('手动模式下未指定组件类型，请设置 componentTypes');
      }

      console.log('🔧 使用手动模式发现组件...');
      console.log('📋 指定的组件类型:', this.config.componentTypes);

      const components: ComponentMetadata[] = [];

      for (const componentType of this.config.componentTypes) {
        try {
          // 验证组件是否存在
          await this.graphqlClient.getAllTables(componentType, {
            first: 1,
          });

          const metadata: ComponentMetadata = {
            name: componentType,
            tableName: this.componentNameToTableName(componentType),
            fields: await this.getBasicFields(componentType),
            primaryKeys: [],
            hasDefaultId: true,
            enumFields: [],
            lastUpdated: Date.now(),
            description: `手动配置的组件: ${componentType}`,
          };

          components.push(metadata);
          console.log(`✅ 确认组件 ${componentType} 可用`);
        } catch (error) {
          console.warn(
            `⚠️ 组件 ${componentType} 验证失败: ${formatError(error)}`
          );
        }
      }

      console.log(`🎉 手动发现完成，确认 ${components.length} 个有效组件`);

      return {
        components,
        discoveredAt: Date.now(),
        strategy: 'manual',
        totalDiscovered: components.length,
        fromDubheConfig: false,
      };
    } catch (error) {
      throw new Error(`手动发现失败: ${formatError(error)}`);
    }
  }

  /**
   * 获取基础字段信息（简化版本）
   */
  private async getBasicFields(
    componentType: ComponentType
  ): Promise<ComponentField[]> {
    // 为手动模式提供基础的系统字段
    return [
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
    ];
  }

  /**
   * 检查缓存是否有效
   */
  private isValidCache(): boolean {
    if (!this.cache || !this.config.cacheTTL) return false;

    const now = Date.now();
    const cacheAge = (now - this.lastCacheTime) / 1000;

    return cacheAge < this.config.cacheTTL;
  }

  /**
   * 过滤组件
   */
  private filterComponents(
    components: ComponentMetadata[]
  ): ComponentMetadata[] {
    return components.filter((comp) => {
      // 检查包含模式
      const includeMatch = this.config.includePatterns?.some((pattern) =>
        this.matchPattern(comp.name, pattern)
      );

      // 检查排除模式
      const excludeMatch = this.config.excludePatterns?.some((pattern) =>
        this.matchPattern(comp.name, pattern)
      );

      return includeMatch && !excludeMatch;
    });
  }

  /**
   * 模式匹配
   */
  private matchPattern(name: string, pattern: string): boolean {
    // 简单的通配符匹配
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      'i'
    );
    return regex.test(name);
  }

  /**
   * 组件名转换为表名
   */
  private componentNameToTableName(componentName: string): string {
    // 添加复数形式
    if (!componentName.endsWith('s')) {
      return componentName + 's';
    }
    return componentName;
  }

  /**
   * 表名转换为组件名
   */
  private tableNameToComponentName(tableName: string): string {
    // 去掉复数形式
    if (tableName.endsWith('s') && tableName.length > 1) {
      return tableName.slice(0, -1);
    }
    return tableName;
  }
}

/**
 * 创建组件发现器的工厂函数
 */
export function createComponentDiscoverer(
  graphqlClient: DubheGraphqlClient,
  config: ComponentDiscoveryConfig
): ComponentDiscoverer {
  return new ECSComponentDiscoverer(graphqlClient, config);
}

/**
 * 便利函数：创建带预设组件的发现器（手动模式）
 */
export function createDiscovererWithComponents(
  graphqlClient: DubheGraphqlClient,
  componentTypes: ComponentType[]
): ComponentDiscoverer {
  return new ECSComponentDiscoverer(graphqlClient, {
    strategy: 'manual',
    componentTypes,
    cacheTTL: 300,
    autoRefresh: false,
    includePatterns: ['*'],
    excludePatterns: ['_*', '__*', 'internal_*'],
  });
}

/**
 * 便利函数：创建带dubhe配置的发现器
 */
export function createDiscovererWithDubheConfig(
  graphqlClient: DubheGraphqlClient,
  dubheConfig: DubheConfig
): ComponentDiscoverer {
  return new ECSComponentDiscoverer(graphqlClient, {
    strategy: 'dubhe-config',
    dubheConfig,
    cacheTTL: 300,
    autoRefresh: false,
    includePatterns: ['*'],
    excludePatterns: ['_*', '__*', 'internal_*'],
  });
}

/**
 * 默认配置 - 推荐使用手动模式
 */
export const DEFAULT_DISCOVERY_CONFIG: ComponentDiscoveryConfig = {
  strategy: 'manual',
  cacheTTL: 300,
  autoRefresh: false,
  includePatterns: ['*'],
  excludePatterns: ['_*', '__*', 'internal_*'],
  componentTypes: [], // 需要手动指定
};
