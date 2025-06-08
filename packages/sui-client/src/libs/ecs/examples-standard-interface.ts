// 标准ECS接口规范使用示例

import { createDubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import { createECSWorld } from './world';
import { exampleDubheConfig } from './examples-dubhe-config';

/**
 * 标准ECS接口规范示例
 * 展示如何使用符合ECS标准的接口方法
 */
export async function standardECSInterfaceExample() {
  console.log('\n📋 === 标准ECS接口规范示例 ===');

  // 创建ECS世界
  const client = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    dubheConfig: exampleDubheConfig,
  });

  const world = createECSWorld(client);

  try {
    // 初始化ECS世界
    await world.initialize();
    console.log('✅ ECS世界初始化完成');

    // ============ 实体查询接口示例 ============
    console.log('\n🎯 实体查询接口示例:');

    // 1. getEntities() - 获取所有实体
    const allEntities = await world.getEntities();
    console.log(`📊 所有实体数量: ${allEntities.length}`);
    console.log(`📝 前3个实体ID: [${allEntities.slice(0, 3).join(', ')}]`);

    // 2. getEntity(id) - 获取单个实体的完整数据
    if (allEntities.length > 0) {
      const firstEntityId = allEntities[0];
      const entityData = await world.getEntity(firstEntityId);

      if (entityData) {
        console.log(`\n🎮 实体 ${firstEntityId} 的完整数据:`);
        console.log(`  - 实体ID: ${entityData.id}`);
        console.log(
          `  - 拥有的组件: [${Object.keys(entityData.components).join(', ')}]`
        );

        // 显示每个组件的数据
        for (const [componentType, componentData] of Object.entries(
          entityData.components
        )) {
          console.log(
            `  - ${componentType} 组件:`,
            JSON.stringify(componentData, null, 2)
          );
        }
      } else {
        console.log(`❌ 实体 ${firstEntityId} 不存在或无数据`);
      }
    }

    // 3. getEntitiesByComponent(componentType) - 获取拥有特定组件的所有实体
    console.log('\n📦 按组件查询实体:');

    const playerEntities = await world.getEntitiesByComponent('player');
    console.log(`👥 拥有 player 组件的实体: ${playerEntities.length} 个`);
    console.log(`📝 player 实体ID: [${playerEntities.slice(0, 3).join(', ')}]`);

    const positionEntities = await world.getEntitiesByComponent('position');
    console.log(`📍 拥有 position 组件的实体: ${positionEntities.length} 个`);
    console.log(
      `📝 position 实体ID: [${positionEntities.slice(0, 3).join(', ')}]`
    );

    // ============ 组件查询接口示例 ============
    console.log('\n🔧 组件查询接口示例:');

    if (playerEntities.length > 0) {
      const testEntityId = playerEntities[0];
      console.log(`\n🎯 测试实体: ${testEntityId}`);

      // 1. hasComponent(entityId, componentType) - 检查实体是否拥有特定组件
      const hasPlayer = await world.hasComponent(testEntityId, 'player');
      const hasPosition = await world.hasComponent(testEntityId, 'position');
      const hasItem = await world.hasComponent(testEntityId, 'item');

      console.log(`✅ 组件存在性检查:`);
      console.log(`  - 拥有 player 组件: ${hasPlayer}`);
      console.log(`  - 拥有 position 组件: ${hasPosition}`);
      console.log(`  - 拥有 item 组件: ${hasItem}`);

      // 2. getComponents(entityId) - 获取实体的所有组件
      const allComponents = await world.getComponents(testEntityId);
      console.log(
        `📋 实体 ${testEntityId} 的所有组件: [${allComponents.join(', ')}]`
      );

      // 3. getComponent(entityId, componentType) - 获取实体的特定组件
      for (const componentType of allComponents) {
        const componentData = await world.getComponent(
          testEntityId,
          componentType
        );
        console.log(`🔍 ${componentType} 组件数据:`, componentData);
      }
    }

    // ============ 与现有API对比示例 ============
    console.log('\n🔄 标准接口与现有API对比:');

    if (allEntities.length > 0) {
      const testId = allEntities[0];

      console.log('标准接口 vs 现有API:');

      // 实体查询对比
      const entities1 = await world.getEntities();
      const entities2 = await world.getAllEntities();
      console.log(
        `✅ getEntities() === getAllEntities(): ${JSON.stringify(entities1) === JSON.stringify(entities2)}`
      );

      // 组件检查对比
      const hasComp1 = await world.hasComponent(testId, 'player');
      const hasComp2 = await world.hasComponent(testId, 'player');
      console.log(
        `✅ hasComponent() === hasComponent(): ${hasComp1 === hasComp2}`
      );

      // 组件数据获取对比
      const comp1 = await world.getComponent(testId, 'player');
      const comp2 = await world.getComponent(testId, 'player');
      console.log(
        `✅ getComponent() === getComponent(): ${JSON.stringify(comp1) === JSON.stringify(comp2)}`
      );
    }

    console.log('\n✅ 标准ECS接口规范示例完成！');
  } catch (error) {
    console.error('❌ 标准接口示例执行失败:', error);
  } finally {
    world.dispose();
  }
}

/**
 * 实际业务场景示例：使用标准ECS接口构建游戏逻辑
 */
export async function gameLogicWithStandardInterface() {
  console.log('\n🎮 === 游戏逻辑标准接口示例 ===');

  const client = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    dubheConfig: exampleDubheConfig,
  });

  const world = createECSWorld(client);

  try {
    await world.initialize();

    // 游戏系统：玩家移动系统
    console.log('\n🚀 玩家移动系统:');

    // 获取所有拥有位置组件的实体
    const entitiesWithPosition = await world.getEntitiesByComponent('position');
    console.log(`📍 找到 ${entitiesWithPosition.length} 个有位置的实体`);

    for (const entityId of entitiesWithPosition.slice(0, 3)) {
      // 检查是否也有玩家组件（可移动的玩家）
      const isPlayer = await world.hasComponent(entityId, 'player');

      if (isPlayer) {
        // 获取玩家数据
        const playerData = await world.getComponent(entityId, 'player');
        const positionData = await world.getComponent(entityId, 'position');

        console.log(`🎮 玩家 ${entityId}:`);
        console.log(`  - 玩家信息:`, playerData);
        console.log(`  - 当前位置:`, positionData);

        // 这里可以添加移动逻辑...
      }
    }

    // 游戏系统：物品查找系统
    console.log('\n📦 物品查找系统:');

    const itemEntities = await world.getEntitiesByComponent('item');
    console.log(`🎒 找到 ${itemEntities.length} 个物品`);

    for (const itemId of itemEntities.slice(0, 3)) {
      const itemData = await world.getComponent(itemId, 'item');
      console.log(`📦 物品 ${itemId}:`, itemData);
    }

    // 游戏系统：实体完整状态查询
    console.log('\n🔍 实体完整状态查询:');

    const allEntities = await world.getEntities();
    if (allEntities.length > 0) {
      const fullEntityData = await world.getEntity(allEntities[0]);
      console.log(
        `🎯 实体 ${allEntities[0]} 完整状态:`,
        JSON.stringify(fullEntityData, null, 2)
      );
    }

    console.log('\n✅ 游戏逻辑标准接口示例完成！');
  } catch (error) {
    console.error('❌ 游戏逻辑示例执行失败:', error);
  } finally {
    world.dispose();
  }
}

/**
 * 性能对比示例：标准接口 vs 现有API
 */
export async function performanceComparisonExample() {
  console.log('\n⚡ === 性能对比示例 ===');

  const client = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    dubheConfig: exampleDubheConfig,
  });

  const world = createECSWorld(client);

  try {
    await world.initialize();

    const allEntities = await world.getEntities();
    if (allEntities.length === 0) {
      console.log('❌ 没有找到实体，跳过性能测试');
      return;
    }

    const testEntityId = allEntities[0];
    const iterations = 10;

    console.log(`🎯 测试实体: ${testEntityId}`);
    console.log(`🔄 测试次数: ${iterations}`);

    // 测试 hasComponent vs hasComponent
    console.log('\n📊 组件存在性检查性能对比:');

    let start = Date.now();
    for (let i = 0; i < iterations; i++) {
      await world.hasComponent(testEntityId, 'player');
    }
    const standardTime = Date.now() - start;

    start = Date.now();
    for (let i = 0; i < iterations; i++) {
      await world.hasComponent(testEntityId, 'player');
    }
    const originalTime = Date.now() - start;

    console.log(`  - 标准接口 hasComponent(): ${standardTime}ms`);
    console.log(`  - 现有接口 hasComponent(): ${originalTime}ms`);
    console.log(`  - 性能差异: ${Math.abs(standardTime - originalTime)}ms`);

    console.log('\n💡 两个接口底层使用相同实现，性能基本一致');
  } catch (error) {
    console.error('❌ 性能对比示例执行失败:', error);
  } finally {
    world.dispose();
  }
}

/**
 * 运行所有标准接口示例
 */
export async function runAllStandardInterfaceExamples() {
  console.log('📋 运行所有标准ECS接口示例...\n');

  try {
    await standardECSInterfaceExample();
    await gameLogicWithStandardInterface();
    await performanceComparisonExample();

    console.log('\n🎉 所有标准接口示例完成！');
  } catch (error) {
    console.error('❌ 运行标准接口示例时出错:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runAllStandardInterfaceExamples();
}
