// ECS + Dubhe Config 集成示例

import { createDubheGraphqlClient } from '@0xobelisk/graphql-client';
import { createECSWorld } from '../src/world';
import { DubheConfig } from '@0xobelisk/sui-common';

/**
 * 示例dubhe配置
 */
const exampleDubheConfig: DubheConfig = {
  name: 'example-game',
  description: 'Example game configuration for ECS demo',
  components: {
    // 玩家组件
    player: {
      keys: ['id'], // 单主键
      fields: {
        name: 'string',
        level: 'u32',
        experience: 'u64',
        is_active: 'bool',
        player_type: 'PlayerType', // 引用枚举类型
      },
    },
    // 位置组件
    position: {
      keys: ['entity_id'], // 外键
      fields: {
        entity_id: 'string',
        x: 'u32',
        y: 'u32',
        map_id: 'string',
      },
    },
    // 物品组件
    item: {
      keys: ['id'],
      fields: {
        name: 'string',
        item_type: 'ItemType', // 引用枚举类型
        quantity: 'u32',
        owner_id: 'string',
      },
    },
    // 复合主键示例
    inventory: {
      keys: ['player_id', 'item_id'], // 复合主键
      fields: {
        player_id: 'string',
        item_id: 'string',
        quantity: 'u32',
        slot_index: 'u32',
      },
    },
  },
  enums: {
    PlayerType: ['warrior', 'mage', 'archer'],
    ItemType: ['weapon', 'armor', 'consumable', 'material'],
  },
};

/**
 * 基础示例：使用dubhe config自动配置ECS
 */
export async function basicDubheConfigExample() {
  console.log('\n🎯 === 基础Dubhe Config示例 ===');

  // 创建GraphQL client并传入dubhe config
  const client = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    dubheConfig: exampleDubheConfig, // 🆕 自动配置
  });

  // 创建ECS世界，会自动检测dubhe config
  const world = createECSWorld(client);

  try {
    // 获取发现的组件
    const components = await world.getAvailableComponents();
    console.log('📦 自动发现的组件:', components);

    // 查询示例
    console.log('\n🔍 查询示例:');

    // 查询所有玩家（自动使用正确的字段）
    const players = await world.queryWith('player');
    console.log('👥 玩家实体:', players.slice(0, 3));

    // 查询特定玩家的数据（包含完整字段信息）
    if (players.length > 0) {
      const playerData = await world.getComponent('player', players[0]);
      console.log('🎮 玩家数据:', playerData);
    }

    // 复杂查询：同时拥有位置和玩家组件的实体
    const playersWithPosition = await world.queryWithAll([
      'player',
      'position',
    ]);
    console.log('📍 有位置的玩家:', playersWithPosition.slice(0, 3));
  } catch (error) {
    console.error('❌ 示例执行失败:', error);
  } finally {
    world.dispose();
  }
}

/**
 * 高级示例：手动指定dubhe config
 */
export async function advancedDubheConfigExample() {
  console.log('\n🚀 === 高级Dubhe Config示例 ===');

  // 创建GraphQL client
  const client = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
  });

  // 手动配置ECS世界使用dubhe config
  const world = createECSWorld(client, {
    dubheConfig: exampleDubheConfig,
    queryConfig: {
      enableBatchOptimization: true,
    },
  });

  try {
    console.log('🎯 使用dubhe配置: true');
    console.log('🔧 自动字段解析: true');

    // 获取组件元数据
    const playerMeta = await world.getComponentMetadata('player');
    if (playerMeta) {
      console.log('\n📋 玩家组件元数据:');
      console.log('  - 主键:', playerMeta.primaryKeys);
      console.log('  - 有默认ID:', playerMeta.hasDefaultId);
      console.log('  - 枚举字段:', playerMeta.enumFields);
      console.log(
        '  - 字段列表:',
        playerMeta.fields.map((f) => f.name)
      );
    }

    // 批量查询不同组件
    const batchResults = await Promise.all([
      world.queryWith('player'),
      world.queryWith('item'),
      world.queryWith('inventory'),
    ]);

    console.log('\n📊 批量查询结果:');
    console.log('  - 玩家数量:', batchResults[0].length);
    console.log('  - 物品数量:', batchResults[1].length);
    console.log('  - 库存数量:', batchResults[2].length);
  } catch (error) {
    console.error('❌ 高级示例执行失败:', error);
  } finally {
    world.dispose();
  }
}

/**
 * 订阅示例：使用dubhe config的实时更新
 */
export async function subscriptionDubheConfigExample() {
  console.log('\n📡 === 订阅示例 ===');

  const client = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    dubheConfig: exampleDubheConfig,
  });

  const world = createECSWorld(client);

  try {
    // 监听玩家组件变化
    const unsubscribePlayer = world.onComponentChanged(
      'player',
      (entityId, component) => {
        console.log(`🎮 玩家 ${entityId} 数据更新:`, component);
      }
    );

    // 监听位置组件变化
    const unsubscribePosition = world.onComponentChanged(
      'position',
      (entityId, component) => {
        console.log(`📍 实体 ${entityId} 位置更新:`, component);
      }
    );

    // 监听查询结果变化（同时拥有玩家和位置的实体）
    const queryWatcher = world.watchQuery(['player', 'position'], (changes) => {
      console.log('👥 玩家位置查询变化:', {
        新增: changes.added.length,
        移除: changes.removed.length,
        当前总数: changes.current.length,
      });
    });

    console.log('📡 订阅已设置，监听组件变化...');
    console.log('💡 在其他地方修改数据以查看实时更新效果');

    // 设置定时器模拟一些更新（实际应用中数据会来自其他源）
    setTimeout(() => {
      console.log('🔧 清理订阅...');
      unsubscribePlayer();
      unsubscribePosition();
      queryWatcher.unsubscribe();
    }, 30000); // 30秒后清理
  } catch (error) {
    console.error('❌ 订阅示例执行失败:', error);
  }
  // 注意：这里不dispose，让订阅继续运行
}

/**
 * 零配置示例：最简单的使用方式
 */
export async function zeroConfigExample() {
  console.log('\n⚡ === 零配置示例 ===');

  // 最简单的方式：只需要传入dubhe config
  const client = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    dubheConfig: exampleDubheConfig,
  });

  const world = createECSWorld(client);

  try {
    // 立即可用的查询
    const allPlayers = await world.queryWith('player');
    const allItems = await world.queryWith('item');

    console.log(`🎮 找到 ${allPlayers.length} 个玩家`);
    console.log(`📦 找到 ${allItems.length} 个物品`);

    // 如果有数据，显示第一个玩家的详细信息
    if (allPlayers.length > 0) {
      const firstPlayerData = await world.getComponent('player', allPlayers[0]);
      console.log('🎯 第一个玩家:', firstPlayerData);
    }
  } catch (error) {
    console.error('❌ 零配置示例执行失败:', error);
  } finally {
    world.dispose();
  }
}

/**
 * 运行所有示例
 */
export async function runAllDubheConfigExamples() {
  console.log('🎯 运行所有Dubhe Config + ECS示例...\n');

  try {
    await basicDubheConfigExample();
    await advancedDubheConfigExample();
    await zeroConfigExample();

    // 订阅示例最后运行，因为它会持续运行
    await subscriptionDubheConfigExample();

    console.log('\n✅ 所有示例完成！');
  } catch (error) {
    console.error('❌ 运行示例时出错:', error);
  }
}

// 导出便利函数
export { exampleDubheConfig };

// 如果直接运行此文件
if (require.main === module) {
  runAllDubheConfigExamples();
}
