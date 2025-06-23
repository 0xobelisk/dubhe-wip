/**
 * ECS Monster Hunter 测试脚本
 *
 * 使用最新的 Dubhe ECS 系统测试 monster_hunter 游戏的组件查询
 * 主要测试 position 和 player 组件的查询功能
 */

import { createDubheGraphqlClient } from '@0xobelisk/graphql-client';
import { createECSWorld, DubheECSWorld } from '../src';
import dubheMetadata from '../dubhe.config_1.json';

// GraphQL 端点配置
const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';

/**
 * 主测试函数
 */
async function testMonsterHunterECS() {
  console.log('🎮 === Monster Hunter ECS 测试 ===\n');

  let world: DubheECSWorld | null = null;

  // 1. 创建 GraphQL client（使用 dubhe 配置）
  console.log('🔌 创建 GraphQL client...');
  const client = createDubheGraphqlClient({
    endpoint: GRAPHQL_ENDPOINT,
    dubheMetadata,
  });

  // 2. 创建 ECS world（自动使用 dubhe-config 模式）
  console.log('🌍 创建 ECS world...');
  world = createECSWorld(client);
  const components = await world.getAvailableComponents();
  console.log('components', components);
  const resources = await world.getAvailableResources();
  console.log('resources', resources);

  const entity = await world.getEntity(
    '0xd7b69493da10a0e733b13d3213b20beb1630a50b949876b352b002f4818a9388'
  );
  console.log(entity);

  const component = await world.getComponent(
    '0xd7b69493da10a0e733b13d3213b20beb1630a50b949876b352b002f4818a9388',
    'counter1'
  );
  console.log(component);

  // const resource = await world.getResources('counter2');
  const resource = await world.getResource('counter2', {
    value: '1',
  });
  console.log(resource);
}

testMonsterHunterECS();
