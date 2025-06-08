// ECS系统实际测试Demo

import { gql } from '@apollo/client';
import { createDubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import {
  createECSWorldWithComponents,
  createDiscovererWithCandidates,
} from './index';

/**
 * 测试GraphQL连接和基本查询
 */
async function testGraphQLConnection() {
  console.log('🔗 测试GraphQL连接...');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  try {
    // 简单的健康检查查询
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
    console.log('📋 Schema查询类型:', result.data.__schema.queryType.name);
    return true;
  } catch (error) {
    console.error('❌ GraphQL连接失败:', error);
    return false;
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

  // 测试常见的表名候选
  const candidateTableNames = [
    'accounts',
    'users',
    'players',
    'entities',
    'positions',
    'locations',
    'coordinates',
    'encounters',
    'battles',
    'events',
    'mapConfigs',
    'maps',
    'configs',
    'settings',
    'items',
    'inventory',
    'components',
    'sessions',
    'logs',
    'history',
  ];

  const discoverer = createDiscovererWithCandidates(
    graphqlClient,
    candidateTableNames
  );

  try {
    const result = await discoverer.discover();

    console.log('📦 发现的组件数量:', result.components.length);
    console.log(
      '🏷️ 组件列表:',
      result.components.map((c) => c.name)
    );

    // 显示每个组件的详细信息
    for (const comp of result.components.slice(0, 3)) {
      // 只显示前3个
      console.log(`\n📋 组件: ${comp.name}`);
      console.log(`  表名: ${comp.tableName}`);
      console.log(`  字段数: ${comp.fields.length}`);
      console.log(
        `  字段: ${comp.fields.map((f) => `${f.name}(${f.type})`).join(', ')}`
      );
    }

    return result.components;
  } catch (error) {
    console.error('❌ 组件发现失败:', error);
    return [];
  }
}

/**
 * 测试手动指定组件
 */
async function testManualComponents() {
  console.log('\n🎯 测试手动指定组件...');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
  });

  // 尝试一些常见的组件名
  const potentialComponents = [
    'account',
    'position',
    'encounter',
    'user',
    'player',
    'entity',
  ];
  const validComponents: string[] = [];

  // 先验证哪些组件存在
  for (const componentName of potentialComponents) {
    try {
      await graphqlClient.getAllTables(componentName, {
        first: 1,
        fields: ['updatedAt'],
      });
      validComponents.push(componentName);
      console.log(`✅ 组件 ${componentName} 可用`);
    } catch (error: any) {
      console.log(`❌ 组件 ${componentName} 不存在`);
    }
  }

  if (validComponents.length === 0) {
    console.log('⚠️ 没有找到有效的组件，请检查GraphQL schema');
    return null;
  }

  // 使用找到的有效组件创建ECS世界
  const world = createECSWorldWithComponents(graphqlClient, validComponents);

  try {
    await world.initialize();

    const components = await world.getAvailableComponents();
    console.log('📦 ECS世界中的组件:', components);

    return world;
  } catch (error) {
    console.error('❌ ECS世界初始化失败:', error);
    return null;
  }
}

/**
 * 测试实际查询
 */
async function testQueries(world: any) {
  if (!world) {
    console.log('⚠️ 没有可用的ECS世界，跳过查询测试');
    return;
  }

  console.log('\n🔍 测试实际查询...');

  try {
    const components = await world.getAvailableComponents();

    for (const componentType of components.slice(0, 2)) {
      // 测试前2个组件
      console.log(`\n🎯 查询组件: ${componentType}`);

      try {
        // 查询该组件的所有实体
        const entities = await world.queryWith(componentType, { limit: 5 });
        console.log(`  📊 实体数量: ${entities.length}`);

        if (entities.length > 0) {
          console.log(`  🔍 前几个实体ID: ${entities.slice(0, 3).join(', ')}`);

          // 获取第一个实体的详细数据
          const firstEntity = entities[0];
          const componentData = await world.getComponent(
            firstEntity,
            componentType
          );
          console.log(
            `  📋 实体 ${firstEntity} 的数据:`,
            typeof componentData === 'object'
              ? JSON.stringify(componentData, null, 2).slice(0, 200) + '...'
              : componentData
          );
        }
      } catch (error) {
        console.error(`  ❌ 查询组件 ${componentType} 失败:`, error);
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
      } catch (error) {
        console.error('  ❌ 组合查询失败:', error);
      }
    }
  } catch (error) {
    console.error('❌ 查询测试失败:', error);
  } finally {
    world.dispose();
  }
}

/**
 * 查看GraphQL Schema中的可用查询字段
 */
async function inspectGraphQLSchema() {
  console.log('\n🔍 检查GraphQL Schema中的可用查询...');

  const graphqlClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
  });

  try {
    const apolloClient = graphqlClient.getApolloClient();
    const result = await apolloClient.query({
      query: gql`
        query IntrospectSchema {
          __schema {
            queryType {
              fields {
                name
                type {
                  name
                  kind
                  ofType {
                    name
                    kind
                  }
                }
                description
              }
            }
          }
        }
      `,
      fetchPolicy: 'network-only',
    });

    const queryFields = result.data.__schema.queryType.fields;
    console.log('📋 可用的查询字段:');

    // 过滤出可能的表查询（通常以复数形式结尾，或包含Connection）
    const tableQueries = queryFields.filter((field: any) => {
      const typeName = field.type?.name || field.type?.ofType?.name || '';
      return typeName.includes('Connection') || field.name.length > 3;
    });

    for (const field of tableQueries.slice(0, 20)) {
      // 只显示前20个
      const typeName =
        field.type?.name || field.type?.ofType?.name || 'Unknown';
      console.log(`  📄 ${field.name}: ${typeName}`);
      if (field.description) {
        console.log(`      描述: ${field.description}`);
      }
    }

    // 查找包含Connection的字段（这些通常是表查询）
    const connectionFields = queryFields.filter((field: any) => {
      const typeName = field.type?.name || field.type?.ofType?.name || '';
      return typeName.includes('Connection');
    });

    if (connectionFields.length > 0) {
      console.log('\n🎯 检测到的表查询（Connection类型）:');
      for (const field of connectionFields) {
        console.log(`  📊 ${field.name}`);
      }

      return connectionFields.map((field: any) => field.name);
    }

    return [];
  } catch (error: any) {
    console.error('❌ Schema检查失败:', error);
    return [];
  }
}

/**
 * 主测试函数
 */
export async function runTestDemo() {
  console.log('🚀 开始ECS系统测试Demo');
  console.log('='.repeat(50));

  try {
    // 1. 测试GraphQL连接
    const connectionOk = await testGraphQLConnection();
    if (!connectionOk) {
      console.log(
        '❌ GraphQL连接失败，请确保服务器运行在 http://localhost:4000/graphql'
      );
      return;
    }

    // 2. 检查GraphQL Schema
    const availableTables = await inspectGraphQLSchema();

    // 3. 测试组件发现
    const discoveredComponents = await testComponentDiscovery();

    // 4. 测试手动组件配置
    const world = await testManualComponents();

    // 5. 测试实际查询
    await testQueries(world);

    console.log('\n🎉 测试Demo完成！');
  } catch (error) {
    console.error('❌ 测试Demo失败:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runTestDemo().catch(console.error);
}
