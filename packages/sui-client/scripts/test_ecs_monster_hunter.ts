/**
 * ECS Monster Hunter 测试脚本
 *
 * 使用最新的 Dubhe ECS 系统测试 monster_hunter 游戏的组件查询
 * 主要测试 position 和 player 组件的查询功能
 */

import { createDubheGraphqlClient } from '../src/libs/dubheGraphqlClient';
import { createECSWorld, DubheECSWorld } from '../src/libs/ecs';
import { dubheConfig } from '../dubhe.config';

// GraphQL 端点配置
const GRAPHQL_ENDPOINT =
  process.env.GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';

/**
 * 主测试函数
 */
async function testMonsterHunterECS() {
  console.log('🎮 === Monster Hunter ECS 测试 ===\n');

  let world: DubheECSWorld | null = null;

  try {
    // 1. 创建 GraphQL client（使用 dubhe 配置）
    console.log('🔌 创建 GraphQL client...');
    const client = createDubheGraphqlClient({
      endpoint: GRAPHQL_ENDPOINT,
      dubheConfig: dubheConfig,
    });

    // 2. 创建 ECS world（自动使用 dubhe-config 模式）
    console.log('🌍 创建 ECS world...');
    world = createECSWorld(client);

    // 3. 初始化 ECS world（自动发现组件）
    console.log('🚀 初始化 ECS world...');
    await world.initialize();

    console.log(`✅ ECS world 初始化完成`);
    console.log(
      `📋 使用策略: ${world.isUsingDubheConfig() ? 'dubhe-config' : 'manual'}`
    );
    console.log(`🔧 自动字段解析: ${world.isAutoFieldResolutionEnabled()}\n`);

    // 4. 查看可用组件
    console.log('📦 === 可用组件列表 ===');
    const availableComponents = await world.getAvailableComponents();
    console.log(`发现 ${availableComponents.length} 个组件:`);
    availableComponents.forEach((comp) => console.log(`  - ${comp}`));
    console.log();

    // 5. 查看 position 组件元数据
    console.log('📍 === Position 组件元数据 ===');
    const positionMeta = await world.getComponentMetadata('position');
    if (positionMeta) {
      console.log(`组件名: ${positionMeta.name}`);
      console.log(`表名: ${positionMeta.tableName}`);
      console.log(`主键: [${positionMeta.primaryKeys.join(', ')}]`);
      console.log(`字段:`);
      positionMeta.fields.forEach((field) => {
        console.log(
          `  - ${field.name}: ${field.type} ${field.nullable ? '(可空)' : '(必填)'}`
        );
      });
      console.log(`描述: ${positionMeta.description}\n`);
    } else {
      console.log('❌ 未找到 position 组件元数据\n');
    }

    // 6. 查看 player 组件元数据
    console.log('👤 === Player 组件元数据 ===');
    const playerMeta = await world.getComponentMetadata('player');
    if (playerMeta) {
      console.log(`组件名: ${playerMeta.name}`);
      console.log(`表名: ${playerMeta.tableName}`);
      console.log(`主键: [${playerMeta.primaryKeys.join(', ')}]`);
      console.log(`字段:`);
      playerMeta.fields.forEach((field) => {
        console.log(
          `  - ${field.name}: ${field.type} ${field.nullable ? '(可空)' : '(必填)'}`
        );
      });
      console.log(`描述: ${playerMeta.description}\n`);
    } else {
      console.log('❌ 未找到 player 组件元数据\n');
    }

    // 7. 使用标准 ECS 接口查询组件数据
    console.log('🔍 === 标准 ECS 接口查询 ===');

    // 查询所有拥有 player 组件的实体
    console.log('👥 查询所有玩家实体...');
    const playerEntities = await world.getEntitiesByComponent('player');
    console.log(`找到 ${playerEntities.length} 个玩家实体`);
    if (playerEntities.length > 0) {
      console.log(`前3个玩家ID: [${playerEntities.slice(0, 3).join(', ')}]`);
    }

    // 查询所有拥有 position 组件的实体
    console.log('\n📍 查询所有有位置的实体...');
    const positionEntities = await world.getEntitiesByComponent('position');
    console.log(`找到 ${positionEntities.length} 个有位置的实体`);
    if (positionEntities.length > 0) {
      console.log(`前3个实体ID: [${positionEntities.slice(0, 3).join(', ')}]`);
    }

    // 查询同时拥有 player 和 position 组件的实体
    console.log('\n🎯 查询同时拥有 player 和 position 的实体...');
    const playerWithPosition = await world.queryWithAll(['player', 'position']);
    console.log(`找到 ${playerWithPosition.length} 个有位置的玩家`);

    // 8. 详细查看前几个玩家的数据
    if (playerWithPosition.length > 0) {
      console.log('\n📊 === 玩家详细数据 ===');

      const sampleSize = Math.min(3, playerWithPosition.length);
      for (let i = 0; i < sampleSize; i++) {
        const entityId = playerWithPosition[i];
        console.log(`\n🎮 玩家 ${i + 1} (ID: ${entityId}):`);

        // 使用 getEntity 获取完整实体数据
        const entityData = await world.getEntity(entityId);
        if (entityData) {
          console.log(`  完整数据:`, JSON.stringify(entityData, null, 2));
        }

        // 使用单独的组件查询
        const hasPlayer = await world.hasComponent(entityId, 'player');
        const hasPosition = await world.hasComponent(entityId, 'position');

        console.log(`  拥有 player 组件: ${hasPlayer}`);
        console.log(`  拥有 position 组件: ${hasPosition}`);

        if (hasPlayer) {
          const playerData = await world.getComponent(entityId, 'player');
          console.log(`  player 数据:`, playerData);
        }

        if (hasPosition) {
          const positionData = await world.getComponent(entityId, 'position');
          console.log(`  position 数据:`, positionData);
        }

        // 获取实体的所有组件
        const allComponents = await world.getComponents(entityId);
        console.log(`  所有组件: [${allComponents.join(', ')}]`);
      }
    }

    // 9. 测试其他游戏相关组件
    console.log('\n🗺️ === 其他游戏组件统计 ===');
    const componentStats = await world.getComponentStats();

    const gameComponents = [
      'moveable',
      'obstruction',
      'encounterable',
      'encounter',
      'monster',
    ];
    for (const component of gameComponents) {
      const count = componentStats[component] || 0;
      console.log(`${component}: ${count} 个实体`);
    }

    // 10. 测试地图配置（使用新的全局配置接口）
    console.log('\n🗺️ === 地图配置 ===');
    console.log('🔍 全局配置表列表:', world.getGlobalConfigTables());

    const mapConfigData = await world.getGlobalConfig('map_config');
    if (mapConfigData) {
      console.log('✅ 地图配置数据:', mapConfigData);
    } else {
      console.log('⚠️ 未找到地图配置数据');
    }

    // 11. 测试怪物数据
    console.log('\n👹 === 怪物数据 ===');
    const monsterEntities = await world.getEntitiesByComponent('monster');
    if (monsterEntities.length > 0) {
      console.log(`找到 ${monsterEntities.length} 个怪物`);

      const sampleMonster = Math.min(2, monsterEntities.length);
      for (let i = 0; i < sampleMonster; i++) {
        const monsterId = monsterEntities[i];
        const monsterData = await world.getComponent(monsterId, 'monster');
        console.log(`怪物 ${i + 1} (ID: ${monsterId}):`, monsterData);
      }
    } else {
      console.log('未找到怪物数据');
    }

    console.log('\n✅ === 测试完成 ===');
  } catch (error) {
    console.error('❌ 测试失败:', error);

    // 如果是连接错误，提供帮助信息
    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 连接提示:');
      console.log('请确保 GraphQL 服务器正在运行在:', GRAPHQL_ENDPOINT);
      console.log(
        '你可以通过环境变量设置端点: GRAPHQL_ENDPOINT=http://your-server:port/graphql'
      );
    }
  } finally {
    // 清理资源
    if (world) {
      console.log('\n🧹 清理资源...');
      world.dispose();
    }
  }
}

/**
 * 运行测试
 */
if (require.main === module) {
  testMonsterHunterECS().catch(console.error);
}

export { testMonsterHunterECS };
