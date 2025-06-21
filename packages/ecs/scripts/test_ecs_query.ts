/**
 * ECS Monster Hunter 测试脚本
 *
 * 使用最新的 Dubhe ECS 系统测试 monster_hunter 游戏的组件查询
 * 主要测试 position 和 player 组件的查询功能
 */

import { createDubheGraphqlClient } from '@0xobelisk/graphql-client';
import { createECSWorld, DubheECSWorld } from '../src';
import { dubheConfig } from '../monster_dubhe.config';

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
    dubheConfig: dubheConfig,
  });

  // 2. 创建 ECS world（自动使用 dubhe-config 模式）
  console.log('🌍 创建 ECS world...');
  world = createECSWorld(client);

  const entity = await world.getEntity(
    '0xfc8f7d0eec60cc35beb5e0dce4e71a2e245a1f2fbb1ac736c4428e62f36bbe82'
  );
  console.log(entity);
}

testMonsterHunterECS();
