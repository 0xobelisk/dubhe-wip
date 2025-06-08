// 动态组件发现功能使用示例

import { createDubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import {
  createECSWorld,
  createECSWorldWithComponents,
  createDiscovererWithCandidates,
  DEFAULT_DISCOVERY_CONFIG,
  ComponentDiscoveryStrategy,
} from './index';

// ============ 基本使用示例 ============

/**
 * 示例1: 使用默认配置创建ECS世界
 */
export async function basicExample() {
  console.log('🚀 基本使用示例');

  // 创建GraphQL客户端 - 使用默认InMemoryCache
  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
    headers: {
      Authorization: 'Bearer your-token',
    },
  });

  // 创建ECS世界 - 使用默认的cache-analysis策略
  const world = createECSWorld(graphqlClient);

  try {
    // 初始化世界（自动发现组件）
    await world.initialize();

    // 获取发现的组件列表
    const components = await world.getAvailableComponents();
    console.log('📦 发现的组件:', components);

    // 查询特定组件的实体
    if (components.length > 0) {
      const firstComponent = components[0];
      const entities = await world.queryWith(firstComponent);
      console.log(`🔍 组件 ${firstComponent} 的实体数量:`, entities.length);
    }
  } finally {
    world.dispose();
  }
}

/**
 * 示例2: 使用手动配置组件列表
 */
export async function manualConfigExample() {
  console.log('🔧 手动配置示例');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
  });

  // 手动指定组件列表 - 使用便利函数
  const world = createECSWorldWithComponents(graphqlClient, [
    'account',
    'position',
    'encounter',
  ]);

  try {
    await world.initialize();

    const components = await world.getAvailableComponents();
    console.log('📦 手动配置的组件:', components);

    // 获取组件元数据
    for (const component of components) {
      const metadata = await world.getComponentMetadata(component);
      if (metadata) {
        console.log(
          `📋 组件 ${component} 字段:`,
          metadata.fields.map((f) => f.name)
        );
      }
    }
  } finally {
    world.dispose();
  }
}

/**
 * 示例3: 使用分页缓存配置和候选表名探测
 */
export async function paginationCacheExample() {
  console.log('🔍 分页缓存示例');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
    cacheConfig: {
      paginatedTables: ['accounts', 'positions', 'encounters'],
      strategy: 'filter-orderby',
    },
  });

  // 使用cache-analysis策略时需要提供候选表名
  const world = createECSWorld(graphqlClient, {
    componentDiscovery: {
      strategy: 'cache-analysis',
      candidateTableNames: [
        'accounts',
        'positions',
        'encounters',
        'mapConfigs',
      ],
      includePatterns: ['*'], // 包含所有
      excludePatterns: ['_*', '__*'], // 排除内部字段
      cacheTTL: 300,
    },
  });

  try {
    await world.initialize();

    const components = await world.getAvailableComponents();
    console.log('📦 发现的组件:', components);

    // 展示组件的详细信息
    for (const component of components.slice(0, 3)) {
      // 只显示前3个
      const metadata = await world.getComponentMetadata(component);
      if (metadata) {
        console.log(`📋 组件 ${component}:`);
        console.log(`  表名: ${metadata.tableName}`);
        console.log(`  字段数: ${metadata.fields.length}`);
        console.log(
          `  字段: ${metadata.fields.map((f) => `${f.name}(${f.type})`).join(', ')}`
        );
      }
    }
  } catch (error) {
    console.error('❌ 可能需要检查GraphQL端点配置或候选表名设置');
  } finally {
    world.dispose();
  }
}

/**
 * 示例4: 动态刷新组件配置
 */
export async function dynamicRefreshExample() {
  console.log('🔄 动态刷新示例');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
  });

  const world = createECSWorld(graphqlClient, {
    componentDiscovery: {
      strategy: 'cache-analysis',
      autoRefresh: true,
      cacheTTL: 60, // 1分钟缓存
    },
  });

  try {
    await world.initialize();

    let components = await world.getAvailableComponents();
    console.log('📦 初始组件:', components);

    // 模拟等待一段时间后刷新
    console.log('⏳ 等待5秒后刷新组件缓存...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await world.refreshComponentCache();
    components = await world.getAvailableComponents();
    console.log('📦 刷新后的组件:', components);
  } finally {
    world.dispose();
  }
}

/**
 * 示例5: 组合查询与动态组件
 */
export async function dynamicQueryExample() {
  console.log('🔗 动态查询示例');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
  });

  const world = createECSWorld(graphqlClient);

  try {
    await world.initialize();

    const components = await world.getAvailableComponents();
    console.log('📦 可用组件:', components);

    if (components.length >= 2) {
      // 动态选择两个组件进行查询
      const [comp1, comp2] = components.slice(0, 2);

      console.log(`🔍 查询同时拥有 ${comp1} 和 ${comp2} 组件的实体...`);
      const entities = await world.queryWithAll([comp1, comp2]);
      console.log(`✅ 找到 ${entities.length} 个实体`);

      // 获取详细数据
      if (entities.length > 0) {
        const entityData = await world.queryMultiComponentData(comp1, comp2);
        console.log(`📊 前3个实体的数据:`, entityData.slice(0, 3));
      }
    }

    // 使用查询构建器进行动态查询
    if (components.length > 0) {
      const results = await world
        .query()
        .with(components[0])
        .limit(5)
        .execute();

      console.log(`📊 查询构建器结果:`, results.length);
    }
  } finally {
    world.dispose();
  }
}

/**
 * 示例6: 实时订阅与动态组件
 */
export async function dynamicSubscriptionExample() {
  console.log('📡 动态订阅示例');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
    subscriptionEndpoint: 'ws://localhost:5000/graphql',
  });

  const world = createECSWorld(graphqlClient);

  try {
    await world.initialize();

    const components = await world.getAvailableComponents();

    if (components.length > 0) {
      const component = components[0];
      console.log(`📡 订阅组件 ${component} 的变化...`);

      // 创建组件变化订阅
      const unsubscribe = world.onComponentChanged(
        component,
        (entityId, data) => {
          console.log(`🔔 组件 ${component} 变化: 实体 ${entityId}`, data);
        }
      );

      // 创建实时数据流
      const stream = world.createRealTimeStream(component);
      const streamSubscription = stream.subscribe({
        next: (data: any) => {
          console.log(
            `📍 收到 ${component} 实时数据:`,
            data.length || 0,
            '条记录'
          );
        },
        error: (error: any) => {
          console.error('❌ 实时数据流错误:', error);
        },
      });

      // 运行30秒后取消订阅
      setTimeout(() => {
        console.log('⏹️ 停止订阅');
        unsubscribe();
        streamSubscription.unsubscribe();
      }, 30000);
    }
  } finally {
    // 注意：这里不要立即dispose，等待订阅完成
  }
}

/**
 * 示例7: 错误处理与容错机制
 */
export async function errorHandlingExample() {
  console.log('🛡️ 错误处理示例');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
  });

  // 配置包含不存在的组件
  const world = createECSWorld(graphqlClient, {
    componentDiscovery: {
      strategy: 'manual',
      componentTypes: ['existing_component', 'non_existing_component'],
    },
  });

  try {
    await world.initialize();

    const components = await world.getAvailableComponents();
    console.log('📦 有效组件（过滤后）:', components);

    // 尝试查询不存在的组件
    try {
      const result = await world.queryWith('non_existing_component');
      console.log('🔍 不存在组件查询结果:', result.length);
    } catch (error) {
      console.log('⚠️ 查询不存在组件的错误已被处理');
    }

    // 检查ECS世界状态
    console.log('✅ ECS世界就绪状态:', world.isReady());
    console.log('⚙️ ECS世界配置:', world.getConfig());
  } finally {
    world.dispose();
  }
}

/**
 * 示例8: 性能测试
 */
export async function performanceExample() {
  console.log('⚡ 性能测试示例');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
  });

  const world = createECSWorld(graphqlClient, {
    queryConfig: {
      enableBatchOptimization: true,
      maxConcurrentQueries: 20,
    },
  });

  try {
    // 测试初始化时间
    const initStart = Date.now();
    await world.initialize();
    const initTime = Date.now() - initStart;
    console.log(`⏱️ 初始化耗时: ${initTime}ms`);

    const components = await world.getAvailableComponents();

    if (components.length > 0) {
      // 测试并行查询性能
      const queryStart = Date.now();
      const promises = components
        .slice(0, 5)
        .map((comp) => world.queryWith(comp, { cache: true }));

      const results = await Promise.all(promises);
      const queryTime = Date.now() - queryStart;

      console.log(`⚡ 并行查询 ${promises.length} 个组件耗时: ${queryTime}ms`);
      console.log(
        `📊 查询结果: ${results.map((r) => r.length).join(', ')} 个实体`
      );

      // 测试缓存性能
      const cacheStart = Date.now();
      await world.queryWith(components[0], { cache: true }); // 第二次查询，应该使用缓存
      const cacheTime = Date.now() - cacheStart;
      console.log(`🚀 缓存查询耗时: ${cacheTime}ms`);
    }
  } finally {
    world.dispose();
  }
}

/**
 * 示例9: 使用便利函数进行组件探测
 */
export async function convenienceFunctionExample() {
  console.log('🛠️ 便利函数示例');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:5000/graphql',
  });

  // 方式1: 使用预设组件的便利函数
  console.log('📦 使用预设组件创建ECS世界...');
  const worldWithComponents = createECSWorldWithComponents(graphqlClient, [
    'account',
    'position',
    'encounter',
  ]);

  try {
    await worldWithComponents.initialize();
    const components1 = await worldWithComponents.getAvailableComponents();
    console.log('✅ 预设组件:', components1);
  } finally {
    worldWithComponents.dispose();
  }

  // 方式2: 使用候选表名探测的便利函数
  console.log('🔍 使用候选表名探测组件...');
  const discoverer = createDiscovererWithCandidates(graphqlClient, [
    'accounts',
    'positions',
    'encounters',
    'mapConfigs',
    'players',
  ]);

  try {
    const result = await discoverer.discover();
    console.log(
      '✅ 发现的组件:',
      result.components.map((c) => c.name)
    );
    console.log('📊 发现统计:', {
      策略: result.strategy,
      组件数量: result.components.length,
      发现时间: new Date(result.discoveredAt).toLocaleTimeString(),
    });
  } catch (error) {
    console.error('❌ 组件探测失败:', error);
  }
}

// ============ 运行所有示例 ============

export async function runAllExamples() {
  const examples = [
    { name: '基本使用', fn: basicExample },
    { name: '手动配置', fn: manualConfigExample },
    { name: '分页缓存', fn: paginationCacheExample },
    { name: '动态刷新', fn: dynamicRefreshExample },
    { name: '动态查询', fn: dynamicQueryExample },
    { name: '动态订阅', fn: dynamicSubscriptionExample },
    { name: '错误处理', fn: errorHandlingExample },
    { name: '性能测试', fn: performanceExample },
    { name: '便利函数', fn: convenienceFunctionExample },
  ];

  for (const example of examples) {
    try {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`🎯 运行示例: ${example.name}`);
      console.log(`${'='.repeat(50)}`);

      await example.fn();

      console.log(`✅ 示例 "${example.name}" 完成`);
    } catch (error) {
      console.error(`❌ 示例 "${example.name}" 失败:`, error);
    }
  }

  console.log('\n🎉 所有示例运行完成！');
}

// 默认导出
export default {
  basicExample,
  manualConfigExample,
  paginationCacheExample,
  dynamicRefreshExample,
  dynamicQueryExample,
  dynamicSubscriptionExample,
  errorHandlingExample,
  performanceExample,
  convenienceFunctionExample,
  runAllExamples,
};
