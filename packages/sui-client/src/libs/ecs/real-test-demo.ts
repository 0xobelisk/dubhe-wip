// ECS系统真实测试Demo - 使用实际的GraphQL schema

import { gql } from '@apollo/client';
import { createDubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import {
  createECSWorldWithComponents,
  createDiscovererWithCandidates,
} from './index';

/**
 * 测试GraphQL连接
 */
async function testConnection() {
  console.log('🔗 测试GraphQL连接...');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
  });

  try {
    const apolloClient = graphqlClient.getApolloClient();
    const result = await apolloClient.query({
      query: gql`
        query HealthCheck {
          __schema {
            queryType {
              name
            }
          }
        }
      `,
      fetchPolicy: 'network-only',
    });

    console.log('✅ GraphQL连接成功');
    return true;
  } catch (error: any) {
    console.error('❌ GraphQL连接失败:', error);
    return false;
  }
}

/**
 * 测试实际数据查询
 */
async function testRealQueries() {
  console.log('\n📊 测试实际数据查询...');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
  });

  // 测试accounts表
  console.log('🔍 查询accounts表...');
  try {
    const accountsResult = await graphqlClient.getAllTables('account', {
      first: 3,
      fields: [
        'nodeId',
        'assetId',
        'account',
        'balance',
        'createdAt',
        'updatedAt',
      ],
    });

    console.log(`✅ accounts查询成功: ${accountsResult.edges.length} 条记录`);
    console.log(`📊 总数: ${accountsResult.totalCount}`);

    if (accountsResult.edges.length > 0) {
      console.log(
        '📋 示例数据:',
        JSON.stringify(accountsResult.edges[0].node, null, 2)
      );
    }
  } catch (error: any) {
    console.error('❌ accounts查询失败:', error.message);
  }

  // 测试positions表
  console.log('\n🔍 查询positions表...');
  try {
    const positionsResult = await graphqlClient.getAllTables('position', {
      first: 3,
      fields: ['nodeId', 'player', 'x', 'y', 'createdAt', 'updatedAt'],
    });

    console.log(`✅ positions查询成功: ${positionsResult.edges.length} 条记录`);
    console.log(`📊 总数: ${positionsResult.totalCount}`);

    if (positionsResult.edges.length > 0) {
      console.log(
        '📋 示例数据:',
        JSON.stringify(positionsResult.edges[0].node, null, 2)
      );
    }
  } catch (error: any) {
    console.error('❌ positions查询失败:', error.message);
  }

  // 测试encounters表
  console.log('\n🔍 查询encounters表...');
  try {
    const encountersResult = await graphqlClient.getAllTables('encounter', {
      first: 3,
      fields: [
        'nodeId',
        'player',
        'exists',
        'monster',
        'catchAttempts',
        'createdAt',
        'updatedAt',
      ],
    });

    console.log(
      `✅ encounters查询成功: ${encountersResult.edges.length} 条记录`
    );
    console.log(`📊 总数: ${encountersResult.totalCount}`);

    if (encountersResult.edges.length > 0) {
      console.log(
        '📋 示例数据:',
        JSON.stringify(encountersResult.edges[0].node, null, 2)
      );
    }
  } catch (error: any) {
    console.error('❌ encounters查询失败:', error.message);
  }

  // 测试mapConfigs表
  console.log('\n🔍 查询mapConfigs表...');
  try {
    const mapConfigsResult = await graphqlClient.getAllTables('mapConfig', {
      first: 3,
      fields: ['width', 'height', 'createdAt', 'updatedAt'],
    });

    console.log(
      `✅ mapConfigs查询成功: ${mapConfigsResult.edges.length} 条记录`
    );
    console.log(`📊 总数: ${mapConfigsResult.totalCount}`);

    if (mapConfigsResult.edges.length > 0) {
      console.log(
        '📋 示例数据:',
        JSON.stringify(mapConfigsResult.edges[0].node, null, 2)
      );
    }
  } catch (error: any) {
    console.error('❌ mapConfigs查询失败:', error.message);
  }
}

/**
 * 测试ECS系统
 */
async function testECSSystem() {
  console.log('\n🎯 测试ECS系统...');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    cacheConfig: {
      paginatedTables: ['accounts', 'positions', 'encounters', 'mapConfigs'],
      strategy: 'filter-orderby',
    },
  });

  // 创建ECS世界，手动指定已知的组件
  const world = createECSWorldWithComponents(graphqlClient, [
    'account',
    'position',
    'encounter',
    'mapConfig',
  ]);

  try {
    console.log('🚀 初始化ECS世界...');
    await world.initialize();

    const components = await world.getAvailableComponents();
    console.log('📦 ECS世界中的组件:', components);

    // 测试查询各个组件
    for (const componentType of components) {
      console.log(`\n🔍 查询组件: ${componentType}`);

      try {
        let entities: any[] = [];
        if (componentType === 'encounter') {
          entities = await world.queryWith(componentType, {
            limit: 9999,
            fields: ['player'],
          });
          console.log(entities);
        } else {
          entities = await world.queryWith(componentType, { limit: 9999 });
        }
        console.log(`  📊 实体数量: ${entities.length}`);

        if (entities.length > 0) {
          console.log(`  🔍 实体ID: ${entities.slice(0, 2).join(', ')}`);

          // 获取第一个实体的详细数据
          const firstEntity = entities[0];
          const componentData = await world.getComponent(
            firstEntity,
            componentType
          );
          console.log(`  📋 实体 ${firstEntity} 的数据:`);
          console.log(`     ${JSON.stringify(componentData, null, 4)}`);
        }
      } catch (error: any) {
        console.error(`  ❌ 查询组件 ${componentType} 失败:`, error.message);
      }
    }

    // 测试组合查询
    if (components.length >= 2) {
      console.log(`\n🔗 测试组合查询: ${components[0]} + ${components[1]}`);
      try {
        const combinedEntities = await world.queryWithAll([
          components[0],
          components[1],
        ]);
        console.log(
          `  📊 同时拥有两个组件的实体数量: ${combinedEntities.length}`
        );

        if (combinedEntities.length > 0) {
          console.log(
            `  🔍 前几个实体: ${combinedEntities.slice(0, 3).join(', ')}`
          );
        }
      } catch (error: any) {
        console.error('  ❌ 组合查询失败:', error.message);
      }
    }

    // 测试组件元数据
    console.log('\n📋 测试组件元数据...');
    for (const component of components.slice(0, 2)) {
      const metadata = await world.getComponentMetadata(component);
      if (metadata) {
        console.log(`📄 组件 ${component}:`);
        console.log(`   表名: ${metadata.tableName}`);
        console.log(`   字段数: ${metadata.fields.length}`);
        console.log(
          `   字段: ${metadata.fields.map((f) => `${f.name}(${f.type})`).join(', ')}`
        );
      }
    }
  } finally {
    world.dispose();
  }
}

/**
 * 测试组件发现
 */
async function testComponentDiscovery() {
  console.log('\n🔍 测试组件发现...');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
  });

  // 使用已知的表名进行发现
  const discoverer = createDiscovererWithCandidates(graphqlClient, [
    'accounts',
    'positions',
    'encounters',
    'mapConfigs',
  ]);

  try {
    const result = await discoverer.discover();

    console.log('📦 发现的组件数量:', result.components.length);
    console.log(
      '🏷️ 组件列表:',
      result.components.map((c) => c.name)
    );

    // 显示每个组件的详细信息
    for (const comp of result.components) {
      console.log(`\n📋 组件: ${comp.name}`);
      console.log(`  表名: ${comp.tableName}`);
      console.log(`  字段数: ${comp.fields.length}`);
      console.log(
        `  字段: ${comp.fields.map((f) => `${f.name}(${f.type})`).join(', ')}`
      );
    }
  } catch (error: any) {
    console.error('❌ 组件发现失败:', error);
  }
}

/**
 * 主测试函数
 */
export async function runRealTestDemo() {
  console.log('🚀 开始ECS系统真实测试Demo');
  console.log('='.repeat(50));

  try {
    // 1. 测试连接
    const connectionOk = await testConnection();
    if (!connectionOk) {
      console.log(
        '❌ GraphQL连接失败，请确保服务器运行在 http://localhost:4000/graphql'
      );
      return;
    }

    // 2. 测试实际数据查询
    await testRealQueries();

    // 3. 测试组件发现
    await testComponentDiscovery();

    // 4. 测试完整的ECS系统
    await testECSSystem();

    console.log('\n🎉 真实测试Demo完成！');
  } catch (error: any) {
    console.error('❌ 测试Demo失败:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runRealTestDemo().catch(console.error);
}
