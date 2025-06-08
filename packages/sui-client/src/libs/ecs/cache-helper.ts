// Apollo缓存配置辅助工具

import { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import { formatError } from './utils';

/**
 * Apollo缓存配置分析器
 */
export class ApolloCacheAnalyzer {
  private apolloClient: ApolloClient<NormalizedCacheObject>;

  constructor(apolloClient: ApolloClient<NormalizedCacheObject>) {
    this.apolloClient = apolloClient;
  }

  /**
   * 从Apollo缓存配置中提取表字段名
   */
  extractTableFieldsFromCache(): string[] {
    try {
      const cache = this.apolloClient.cache as any;
      const tableFields: string[] = [];

      // 尝试访问typePolicies配置
      if (this.hasTypePolicies(cache)) {
        const typePolicies = cache.config.typePolicies;

        if (typePolicies.Query && typePolicies.Query.fields) {
          const queryFields = typePolicies.Query.fields;

          // 遍历所有查询字段
          for (const fieldName of Object.keys(queryFields)) {
            if (this.isTableField(fieldName)) {
              tableFields.push(fieldName);
            }
          }
        }
      }

      return tableFields;
    } catch (error) {
      console.warn('从Apollo缓存提取表字段失败:', formatError(error));
      return [];
    }
  }

  /**
   * 获取已知的缓存字段策略
   */
  getKnownCacheFields(): { [fieldName: string]: any } {
    try {
      const cache = this.apolloClient.cache as any;

      if (this.hasTypePolicies(cache)) {
        const typePolicies = cache.config.typePolicies;

        if (typePolicies.Query && typePolicies.Query.fields) {
          return typePolicies.Query.fields;
        }
      }

      return {};
    } catch (error) {
      console.warn('获取缓存字段策略失败:', formatError(error));
      return {};
    }
  }

  /**
   * 分析缓存配置结构
   */
  analyzeCacheStructure(): {
    hasTypePolicies: boolean;
    hasQueryFields: boolean;
    fieldCount: number;
    tableFields: string[];
    structure: any;
  } {
    try {
      const cache = this.apolloClient.cache as any;
      const hasTypePolicies = this.hasTypePolicies(cache);

      let hasQueryFields = false;
      let fieldCount = 0;
      let tableFields: string[] = [];
      let structure: any = {};

      if (hasTypePolicies) {
        const typePolicies = cache.config.typePolicies;

        if (typePolicies.Query && typePolicies.Query.fields) {
          hasQueryFields = true;
          const queryFields = typePolicies.Query.fields;
          fieldCount = Object.keys(queryFields).length;
          tableFields = this.extractTableFieldsFromCache();

          structure = {
            typePolicies: Object.keys(typePolicies),
            queryFields: Object.keys(queryFields),
          };
        }
      }

      return {
        hasTypePolicies,
        hasQueryFields,
        fieldCount,
        tableFields,
        structure,
      };
    } catch (error) {
      console.warn('分析缓存结构失败:', formatError(error));
      return {
        hasTypePolicies: false,
        hasQueryFields: false,
        fieldCount: 0,
        tableFields: [],
        structure: {},
      };
    }
  }

  /**
   * 检查是否有typePolicies配置
   */
  private hasTypePolicies(cache: any): boolean {
    return !!(
      cache &&
      cache.config &&
      cache.config.typePolicies &&
      typeof cache.config.typePolicies === 'object'
    );
  }

  /**
   * 检查字段名是否为表字段
   */
  private isTableField(fieldName: string): boolean {
    // 排除内部字段和特殊字段
    const internalFields = [
      '__schema',
      '__type',
      'node',
      'query',
      '__typename',
    ];

    const specialPrefixes = ['__', '_'];

    // 检查是否为内部字段
    if (internalFields.includes(fieldName.toLowerCase())) {
      return false;
    }

    // 检查是否以特殊前缀开头
    if (specialPrefixes.some((prefix) => fieldName.startsWith(prefix))) {
      return false;
    }

    // 检查字段名长度
    if (fieldName.length <= 1) {
      return false;
    }

    return true;
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): {
    size: number;
    keys: string[];
    fieldPolicies: number;
  } {
    try {
      const cache = this.apolloClient.cache as any;
      const stats = {
        size: 0,
        keys: [] as string[],
        fieldPolicies: 0,
      };

      // 尝试获取缓存大小
      if (cache.data && cache.data.data) {
        stats.keys = Object.keys(cache.data.data);
        stats.size = stats.keys.length;
      }

      // 统计字段策略数量
      if (this.hasTypePolicies(cache)) {
        const typePolicies = cache.config.typePolicies;
        if (typePolicies.Query && typePolicies.Query.fields) {
          stats.fieldPolicies = Object.keys(typePolicies.Query.fields).length;
        }
      }

      return stats;
    } catch (error) {
      console.warn('获取缓存统计失败:', formatError(error));
      return {
        size: 0,
        keys: [],
        fieldPolicies: 0,
      };
    }
  }
}

/**
 * 创建Apollo缓存分析器
 */
export function createCacheAnalyzer(
  apolloClient: ApolloClient<NormalizedCacheObject>
): ApolloCacheAnalyzer {
  return new ApolloCacheAnalyzer(apolloClient);
}

/**
 * 便捷函数：直接从Apollo客户端提取表字段
 */
export function extractTableFieldsFromApollo(
  apolloClient: ApolloClient<NormalizedCacheObject>
): string[] {
  const analyzer = new ApolloCacheAnalyzer(apolloClient);
  return analyzer.extractTableFieldsFromCache();
}

/**
 * 便捷函数：分析Apollo缓存结构
 */
export function analyzeApolloCache(
  apolloClient: ApolloClient<NormalizedCacheObject>
) {
  const analyzer = new ApolloCacheAnalyzer(apolloClient);
  return analyzer.analyzeCacheStructure();
}
