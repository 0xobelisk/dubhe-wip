// 完整的动态ECS系统使用示例

import { createDubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import { createECSWorld } from './index';

/**
 * 完整示例：展示从GraphQL客户端到ECS系统的完整动态配置
 */
export async function completeExample() {
  console.log('🎯 完整动态系统示例');

  // 1. 创建带动态缓存配置的GraphQL客户端
  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
    subscriptionEndpoint: 'ws://localhost:5000/graphql',
    headers: {
      Authorization: 'Bearer your-token',
    },
    // 配置动态缓存策略
    cacheConfig: {
      // 为需要分页缓存的表配置缓存策略
      paginatedTables: ['account', 'encounter', 'position'],
      strategy: 'filter-orderby', // 根据filter和orderBy缓存
    },
  });

  // 2. 创建带组件发现配置的ECS世界
  const world = createECSWorld(graphqlClient, {
    componentDiscovery: {
      strategy: 'cache-analysis', // 使用缓存分析策略
      includePatterns: ['*'],
      excludePatterns: ['_*', '__*', 'internal_*'],
      cacheTTL: 300,
    },
    queryConfig: {
      enableBatchOptimization: true,
      maxConcurrentQueries: 10,
    },
    subscriptionConfig: {
      defaultDebounceMs: 100,
      maxSubscriptions: 50,
    },
  });

  try {
    // 3. 初始化ECS世界（自动发现组件和配置缓存）
    console.log('🚀 初始化ECS世界...');
    await world.initialize();

    // 4. 查看发现的组件
    const discoveredComponents = await world.getAvailableComponents();
    console.log('📦 自动发现的组件:', discoveredComponents);

    // 5. 演示查询功能
    console.log('\n🔍 查询示例...');

    if (discoveredComponents.length > 0) {
      const firstComponent = discoveredComponents[0];

      // 基本查询
      const entities = await world.queryWith(firstComponent);
      console.log(`📊 组件 ${firstComponent} 的实体数量:`, entities.length);

      // 获取组件元数据
      const metadata = await world.getComponentMetadata(firstComponent);
      if (metadata) {
        console.log(
          `📋 组件 ${firstComponent} 的字段:`,
          metadata.fields.map((f) => `${f.name}(${f.type})`).join(', ')
        );
      }

      // 多组件查询（如果有多个组件）
      if (discoveredComponents.length >= 2) {
        const multiEntities = await world.queryWithAll(
          discoveredComponents.slice(0, 2)
        );
        console.log('🔗 多组件查询结果:', multiEntities.length);
      }
    }

    // 6. 演示订阅功能
    console.log('\n📡 订阅示例...');

    if (discoveredComponents.length > 0) {
      const component = discoveredComponents[0];

      // 组件变化订阅
      const unsubscribe = world.onComponentChanged(
        component,
        (entityId, data) => {
          console.log(`🔔 组件 ${component} 变化: 实体 ${entityId}`, data);
        },
        {
          debounceMs: 100,
        }
      );

      // 实时数据流
      const stream = world.createRealTimeStream(component);
      const streamSub = stream.subscribe({
        next: (data: any) => {
          console.log(`📍 实时数据:`, data.length || 0, '条记录');
        },
        error: (error: any) => {
          console.error('❌ 实时数据错误:', error);
        },
      });

      // 运行10秒后停止订阅
      setTimeout(() => {
        console.log('⏹️ 停止订阅');
        unsubscribe();
        streamSub.unsubscribe();
      }, 10000);
    }

    // 7. 性能和统计信息
    console.log('\n📊 统计信息...');

    const stats = await world.getComponentStats();
    console.log('组件统计:', stats);

    const entityCount = await world.getEntityCount();
    console.log('总实体数量:', entityCount);

    // 8. ECS世界状态检查
    console.log('\n✅ 系统状态检查...');
    console.log('ECS世界就绪:', world.isReady());
    console.log('ECS配置:', world.getConfig());
  } catch (error) {
    console.error('❌ 示例执行失败:', error);
  } finally {
    // 清理资源
    setTimeout(() => {
      world.dispose();
      graphqlClient.close();
    }, 15000);
  }
}

/**
 * 最小化配置示例
 */
export async function minimalExample() {
  console.log('🎯 最小化配置示例');

  // 最简配置 - 使用默认InMemoryCache
  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
  });

  const world = createECSWorld(graphqlClient);

  try {
    await world.initialize();

    const components = await world.getAvailableComponents();
    console.log('发现的组件:', components);

    if (components.length > 0) {
      const entities = await world.queryWith(components[0]);
      console.log('查询结果:', entities.length, '个实体');
    }
  } finally {
    world.dispose();
  }
}

/**
 * 自定义缓存策略示例
 */
export async function customCacheExample() {
  console.log('🎯 自定义缓存策略示例');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
    cacheConfig: {
      paginatedTables: ['account', 'encounter'],
      strategy: 'filter-only', // 只根据filter缓存，忽略orderBy
      customMergeStrategies: {
        accounts: {
          keyArgs: ['filter'], // 只根据filter缓存
          merge: (existing, incoming) => {
            if (!incoming || !Array.isArray(incoming.edges)) {
              return existing;
            }
            return {
              ...incoming,
              edges: [...(existing?.edges || []), ...incoming.edges],
            };
          },
        },
      },
    },
  });

  const world = createECSWorld(graphqlClient);

  try {
    await world.initialize();

    const components = await world.getAvailableComponents();
    console.log('发现的组件:', components);

    // 演示缓存行为
    if (components.includes('account')) {
      console.log('🔍 演示缓存行为...');

      // 第一次查询
      const page1 = await world.queryWith('account');
      console.log('第一页结果:', page1.length);

      // 演示使用查询构建器
      const filteredResults = await world
        .query()
        .with('account')
        .limit(5)
        .execute();
      console.log('过滤查询结果:', filteredResults.length);
    }
  } finally {
    world.dispose();
  }
}

/**
 * 高级配置示例
 */
export async function advancedExample() {
  console.log('🎯 高级配置示例');

  // 高级配置
  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
    subscriptionEndpoint: 'ws://localhost:5000/graphql',
    // 完整的缓存配置
    cacheConfig: {
      paginatedTables: ['account', 'encounter', 'position', 'mapConfig'],
      strategy: 'filter-orderby',
      customMergeStrategies: {
        accounts: {
          keyArgs: ['filter'],
          merge: (existing: any, incoming: any) => {
            if (!incoming || !Array.isArray(incoming.edges)) {
              return existing;
            }
            return {
              ...incoming,
              edges: [...(existing?.edges || []), ...incoming.edges],
            };
          },
        },
      },
    },
  });

  const world = createECSWorld(graphqlClient, {
    componentDiscovery: {
      strategy: 'manual', // 手动指定组件
      componentTypes: ['account', 'encounter', 'position', 'mapConfig'],
    },
    queryConfig: {
      defaultCacheTimeout: 10000,
      maxConcurrentQueries: 20,
      enableBatchOptimization: true,
    },
    subscriptionConfig: {
      defaultDebounceMs: 50,
      maxSubscriptions: 100,
      reconnectOnError: true,
    },
  });

  try {
    await world.initialize();

    // 高级查询示例
    const builder = world
      .query()
      .with('account', 'position')
      .where('position', { x: { gte: 0 } })
      .orderBy('position', 'x', 'ASC')
      .limit(10);

    const results = await builder.execute();
    console.log('高级查询结果:', results.length);

    // 条件订阅
    const unsubscribe = world.onComponentCondition(
      'position',
      { x: { gt: 100 } },
      (entityId, data) => {
        console.log('高级订阅触发:', entityId, data);
      },
      { debounceMs: 50 }
    );

    setTimeout(() => unsubscribe(), 5000);
  } finally {
    world.dispose();
  }
}

/**
 * 错误处理示例
 */
export async function errorHandlingExample() {
  console.log('🎯 错误处理示例');

  try {
    // 故意配置错误的endpoint
    const graphqlClient = createDubheGraphqlClient({
      endpoint: 'http://invalid-endpoint:9999/graphql',
    });

    const world = createECSWorld(graphqlClient, {
      componentDiscovery: {
        strategy: 'cache-analysis',
      },
    });

    // 尝试初始化（会失败）
    await world.initialize();
  } catch (error: any) {
    console.log('✅ 预期的错误被正确捕获:', error.message);
  }

  // 正确的配置
  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
    cacheConfig: {
      paginatedTables: ['nonExistentTable'], // 不存在的表
    },
  });

  const world = createECSWorld(graphqlClient);

  try {
    await world.initialize();

    // 查询不存在的组件
    const result = await world.queryWith('nonExistentTable');
    console.log('查询不存在组件的结果:', result.length);
  } catch (error: any) {
    console.log('✅ 查询错误被正确处理:', error.message);
  } finally {
    world.dispose();
  }
}

// 默认导出
export default {
  completeExample,
  minimalExample,
  advancedExample,
  errorHandlingExample,
};

// 运行所有示例
export async function runCompleteExamples() {
  const examples = [
    { name: '完整示例', fn: completeExample },
    { name: '最小化配置', fn: minimalExample },
    { name: '高级配置', fn: advancedExample },
    { name: '错误处理', fn: errorHandlingExample },
  ];

  for (const example of examples) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🚀 运行示例: ${example.name}`);
      console.log(`${'='.repeat(60)}`);

      await example.fn();

      console.log(`✅ 示例 "${example.name}" 执行完成`);

      // 等待2秒再执行下一个示例
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ 示例 "${example.name}" 执行失败:`, error);
    }
  }

  console.log('\n✅ 所有完整示例执行完成！');
}
