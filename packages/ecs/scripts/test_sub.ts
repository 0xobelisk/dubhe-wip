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

  try {
    // 1. 创建 GraphQL client（使用 dubhe 配置）
    console.log('🔌 创建 GraphQL client...');
    const client = createDubheGraphqlClient({
      endpoint: GRAPHQL_ENDPOINT,
      dubheMetadata,
    });

    // 2. 创建 ECS world（自动使用 dubhe-config 模式）
    console.log('🌍 创建 ECS world...');
    world = createECSWorld(client);

    // 3. 使用新的Observable订阅模式
    console.log('📡 开始订阅组件变化...');

    const subscription = world
      .onComponentChanged<any>('counter1', {
        initialEvent: true,
        // debounceMs: 500, // 500ms 防抖
      })
      .subscribe({
        next: (result: any) => {
          // 更严格地检查result对象的结构
          console.log(
            `📢 [${new Date().toLocaleTimeString()}] 实体 ${result.entityId} 的 counter1 组件发生变化:`
          );
          console.log(`  - 变化类型: ${result.changeType}`);
          console.log(`  - 组件数据:`, result.data);
          console.log(`  - 时间戳: ${result.timestamp}`);
          console.log('---');
        },
        error: (error: any) => {
          console.error('❌ 订阅失败:', error);
        },
        complete: () => {
          console.log('✅ 订阅完成');
        },
      });

    // // 4. 查询一个实体作为测试
    // console.log('🔍 查询实体数据...');
    // try {
    //   const entity = await world.getEntity(
    //     '0xd7b69493da10a0e733b13d3213b20beb1630a50b949876b352b002f4818a9388'
    //   );
    //   console.log('📊 实体数据:', entity);
    // } catch (error) {
    //   console.log('⚠️ 实体查询失败，可能实体不存在');
    // }

    // 5. 查询所有实体
    console.log('🔍 查询所有实体...');
    try {
      const entities = await world.getAllEntities();
      console.log(`📊 找到 ${entities.length} 个实体`);
      if (entities.length > 0) {
        console.log('前几个实体ID:', entities.slice(0, 3));
      }
    } catch (error) {
      console.log('⚠️ 实体列表查询失败');
    }

    // 6. 运行一段时间后清理
    console.log('⏰ 订阅将在30秒后自动停止...');
    setTimeout(() => {
      console.log('🛑 停止订阅...');
      subscription.unsubscribe();
      console.log('✅ 测试完成');
      process.exit(0);
    }, 3000000);
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 处理程序退出
process.on('SIGINT', () => {
  console.log('\n🛑 收到退出信号，清理资源...');
  process.exit(0);
});

console.log('🚀 启动 ECS 订阅测试...');
testMonsterHunterECS();
