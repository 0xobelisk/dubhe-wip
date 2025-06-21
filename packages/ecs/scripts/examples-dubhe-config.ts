// ECS世界使用示例 - 使用DubheMetadata JSON格式

import { createDubheGraphqlClient } from '@0xobelisk/graphql-client';
import { createECSWorld } from '../src';
import { DubheMetadata } from '../src/types';

// 模拟的DubheMetadata JSON格式
const exampleDubheMetadata: DubheMetadata = {
  components: [
    {
      // 1. 默认主键（自动添加entityId）
      Player: {
        fields: [{ name: 'string' }, { level: 'u32' }],
        keys: [], // 空keys表示使用默认entityId
      },
    },
    {
      // 3. 单一自定义主键
      UserProfile: {
        fields: [
          { userId: 'string' },
          { email: 'string' },
          { avatar: 'string' },
        ],
        keys: ['userId'], // 单一主键，符合ECS组件要求
      },
    },
  ],

  resources: [
    {
      // 2. 自定义主键（没有id字段）
      Position: {
        fields: [{ x: 'u32' }, { y: 'u32' }],
        keys: ['x', 'y'], // 复合主键，没有id字段
      },
    },
    {
      // 4. 无主键表
      GameLog: {
        fields: [
          { action: 'string' },
          { timestamp: 'u64' },
          { data: 'string' },
        ],
        keys: [], // 无主键
      },
    },
  ],

  enums: [],
};

async function testECSWorldFromGraphQLClient() {
  console.log('📋 方式1: 从 GraphQL Client 获取 DubheMetadata');

  try {
    // 创建GraphQL客户端，包含dubheMetadata
    const graphqlClient = createDubheGraphqlClient({
      endpoint: 'http://localhost:3001/graphql',
      subscriptionEndpoint: 'ws://localhost:3001/graphql',
      dubheMetadata: exampleDubheMetadata, // GraphQL client 包含元数据
    });

    console.log('🚀 Creating ECS World from GraphQL client metadata...');

    // 创建ECS世界实例 - 不需要再次提供 dubheMetadata
    const world = createECSWorld(graphqlClient, {
      // dubheMetadata 从 GraphQL client 自动获取
      queryConfig: {
        defaultCacheTimeout: 5 * 60 * 1000,
        maxConcurrentQueries: 10,
        enableBatchOptimization: true,
      },
    });

    console.log('✅ ECS World created successfully from GraphQL client');

    // 验证功能
    const ecsComponents = world.getAvailableComponents();
    const resources = world.getAvailableResources();

    console.log(`📦 ECS Components: [${ecsComponents.join(', ')}]`);
    console.log(`🗄️ Resources: [${resources.join(', ')}]`);

    // 清理资源
    world.dispose();
    console.log('✅ 方式1 测试完成!\n');
  } catch (error) {
    console.error('❌ 方式1 测试失败:', error);
  }
}

async function testECSWorldFromConfig() {
  console.log('📋 方式2: 在 ECS Config 中显式提供 DubheMetadata');

  try {
    // 创建GraphQL客户端，不包含dubheMetadata
    const graphqlClient = createDubheGraphqlClient({
      endpoint: 'http://localhost:3001/graphql',
      subscriptionEndpoint: 'ws://localhost:3001/graphql',
      // 不提供 dubheMetadata
    });

    console.log('🚀 Creating ECS World with explicit metadata...');

    // 创建ECS世界实例 - 显式提供 dubheMetadata
    const world = createECSWorld(graphqlClient, {
      dubheMetadata: exampleDubheMetadata, // 在 ECS config 中显式提供
      subscriptionConfig: {
        defaultDebounceMs: 100,
        maxSubscriptions: 50,
        reconnectOnError: true,
      },
    });

    console.log('✅ ECS World created successfully with explicit metadata');

    // 验证功能
    const ecsComponents = world.getAvailableComponents();
    const resources = world.getAvailableResources();

    console.log(`📦 ECS Components: [${ecsComponents.join(', ')}]`);
    console.log(`🗄️ Resources: [${resources.join(', ')}]`);

    // 清理资源
    world.dispose();
    console.log('✅ 方式2 测试完成!\n');
  } catch (error) {
    console.error('❌ 方式2 测试失败:', error);
  }
}

async function testECSWorldMinimal() {
  console.log('📋 方式3: 最简配置（仅需要 GraphQL Client）');

  try {
    // 创建GraphQL客户端，包含dubheMetadata
    const graphqlClient = createDubheGraphqlClient({
      endpoint: 'http://localhost:3001/graphql',
      dubheMetadata: exampleDubheMetadata,
    });

    console.log('🚀 Creating ECS World with minimal config...');

    // 最简配置 - 使用所有默认值
    const world = createECSWorld(graphqlClient);

    console.log('✅ ECS World created successfully with minimal config');

    // 验证功能
    const ecsComponents = world.getAvailableComponents();
    const resources = world.getAvailableResources();

    console.log(`📦 ECS Components: [${ecsComponents.join(', ')}]`);
    console.log(`🗄️ Resources: [${resources.join(', ')}]`);

    // 显示详细信息
    for (const componentType of ecsComponents) {
      const metadata = world.getComponentMetadata(componentType);
      if (metadata) {
        console.log(
          `🔍 Component "${componentType}": primaryKey=${metadata.primaryKeys[0]}, fields=${metadata.fields.length}`
        );
      }
    }

    for (const resourceType of resources) {
      const metadata = world.getResourceMetadata(resourceType);
      if (metadata) {
        console.log(
          `🔍 Resource "${resourceType}": keys=[${metadata.primaryKeys.join(', ')}], composite=${metadata.hasCompositeKeys}`
        );
      }
    }

    // 清理资源
    world.dispose();
    console.log('✅ 方式3 测试完成!');
  } catch (error) {
    console.error('❌ 方式3 测试失败:', error);
  }
}

async function testECSWorldError() {
  console.log('\n📋 错误测试: 没有提供 DubheMetadata');

  try {
    // 创建GraphQL客户端，不包含dubheMetadata
    const graphqlClient = createDubheGraphqlClient({
      endpoint: 'http://localhost:3001/graphql',
    });

    console.log('🚀 尝试创建 ECS World 而不提供 metadata...');

    // 这应该会抛出错误
    const world = createECSWorld(graphqlClient);

    console.log('❌ 意外成功 - 应该抛出错误');
  } catch (error) {
    console.log('✅ 正确捕获到错误:', (error as Error).message);
  }
}

async function runAllTests() {
  console.log('🎮 ECS World 使用示例 - 多种配置方式\n');

  await testECSWorldFromGraphQLClient();
  await testECSWorldFromConfig();
  await testECSWorldMinimal();
  await testECSWorldError();

  console.log('\n🎉 所有测试完成!');
}

// 运行示例
if (require.main === module) {
  runAllTests().catch(console.error);
}
