// 组件发现系统 - 简化版

import { DubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
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
 * ECS组件发现器 - 简化实现
 */
export class ECSComponentDiscoverer implements ComponentDiscoverer {
  private graphqlClient: DubheGraphqlClient;
  private config: ComponentDiscoveryConfig;
  private cache: ComponentDiscoveryResult | null = null;
  private lastCacheTime = 0;

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
        case 'manual':
          result = await this.discoverManually();
          break;
        case 'cache-analysis':
          result = await this.discoverByCacheAnalysis();
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
   * 手动指定组件 - 推荐的发现方式
   */
  private async discoverManually(): Promise<ComponentDiscoveryResult> {
    try {
      if (!this.config.componentTypes?.length) {
        throw new Error('手动模式下未指定组件类型，请设置 componentTypes');
      }

      const components: ComponentMetadata[] = [];

      for (const componentType of this.config.componentTypes) {
        try {
          // 验证组件是否存在
          await this.graphqlClient.getAllTables(componentType, {
            first: 1,
            fields: ['updatedAt'],
          });

          const metadata: ComponentMetadata = {
            name: componentType,
            tableName: this.componentNameToTableName(componentType),
            fields: await this.inferFieldsFromSample(componentType),
            lastUpdated: Date.now(),
          };

          components.push(metadata);
          console.log(`✅ 确认组件 ${componentType} 可用`);
        } catch (error) {
          console.warn(
            `⚠️ 组件 ${componentType} 验证失败: ${formatError(error)}`
          );
        }
      }

      return {
        components,
        discoveredAt: Date.now(),
        strategy: 'manual',
      };
    } catch (error) {
      throw new Error(`手动发现失败: ${formatError(error)}`);
    }
  }

  /**
   * 通过缓存分析探测组件 - 需要用户提供候选表名
   */
  private async discoverByCacheAnalysis(): Promise<ComponentDiscoveryResult> {
    try {
      // 检查是否提供了候选表名
      if (!this.config.candidateTableNames?.length) {
        throw new Error(
          'cache-analysis 策略需要提供 candidateTableNames 选项。' +
            '请在配置中指定可能的表名列表，或使用 manual 策略直接指定已知的组件类型。'
        );
      }

      console.log('🔍 使用缓存分析策略探测组件...');
      console.log('📋 候选表名:', this.config.candidateTableNames);

      const components: ComponentMetadata[] = [];

      for (const tableName of this.config.candidateTableNames) {
        const componentName = this.tableNameToComponentName(tableName);

        try {
          // 验证组件是否存在
          await this.graphqlClient.getAllTables(componentName, {
            first: 1,
            fields: ['updatedAt'],
          });

          const metadata: ComponentMetadata = {
            name: componentName,
            tableName: tableName,
            fields: await this.inferFieldsFromSample(componentName),
            lastUpdated: Date.now(),
          };

          components.push(metadata);
          console.log(`✅ 发现组件 ${componentName} (表: ${tableName})`);
        } catch (error) {
          // 忽略不存在的表
          console.debug(`❌ 表 ${tableName} 不存在或无法访问`);
        }
      }

      console.log(
        `📋 发现的有效组件:`,
        components.map((c) => c.name)
      );

      if (components.length === 0) {
        console.warn(
          '⚠️ 没有发现任何组件，请检查候选表名是否正确，或使用手动模式明确指定需要的组件'
        );
      } else {
        console.log('💡 建议使用手动模式明确指定需要的组件，以获得更好的性能');
      }

      return {
        components,
        discoveredAt: Date.now(),
        strategy: 'cache-analysis',
      };
    } catch (error) {
      throw new Error(`缓存分析失败: ${formatError(error)}`);
    }
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

  /**
   * 从样本数据推断字段
   */
  private async inferFieldsFromSample(
    componentType: ComponentType
  ): Promise<ComponentField[]> {
    try {
      const connection = await this.graphqlClient.getAllTables(componentType, {
        first: 1,
      });

      if (connection.edges.length === 0) {
        // 返回默认字段
        return [
          {
            name: 'nodeId',
            type: 'String',
            nullable: false,
            description: '节点ID',
          },
          {
            name: 'createdAt',
            type: 'Datetime',
            nullable: false,
            description: '创建时间',
          },
          {
            name: 'updatedAt',
            type: 'Datetime',
            nullable: false,
            description: '更新时间',
          },
        ];
      }

      const sample = connection.edges[0].node;
      const fields: ComponentField[] = [];

      for (const [key, value] of Object.entries(sample)) {
        fields.push({
          name: key,
          type: this.inferFieldType(value),
          nullable: value === null,
          description: `${componentType}组件的${key}字段`,
        });
      }

      return fields;
    } catch (error) {
      console.warn(`推断字段失败 ${componentType}: ${formatError(error)}`);
      return [
        {
          name: 'nodeId',
          type: 'String',
          nullable: false,
          description: '节点ID',
        },
      ];
    }
  }

  /**
   * 推断字段类型
   */
  private inferFieldType(value: any): string {
    if (value === null) return 'String';

    const type = typeof value;
    switch (type) {
      case 'string':
        return 'String';
      case 'number':
        return Number.isInteger(value) ? 'Int' : 'Float';
      case 'boolean':
        return 'Boolean';
      case 'object':
        if (Array.isArray(value)) return '[String]';
        return 'JSON';
      default:
        return 'String';
    }
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
 * 便利函数：创建带预设组件的发现器
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
 * 便利函数：创建带候选表名的发现器
 */
export function createDiscovererWithCandidates(
  graphqlClient: DubheGraphqlClient,
  candidateTableNames: string[]
): ComponentDiscoverer {
  return new ECSComponentDiscoverer(graphqlClient, {
    strategy: 'cache-analysis',
    candidateTableNames,
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
