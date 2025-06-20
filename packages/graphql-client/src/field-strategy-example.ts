/**
 * 字段策略示例 - 展示如何处理不同类型的表结构
 */

import { createDubheGraphqlClient } from './client';
import { DubheMetadata } from './types';

// 示例dubhe metadata，包含不同类型的表（JSON格式）
const dubheMetadata: DubheMetadata = {
  components: [
    {
      // 1. 有默认id字段的表
      Player: {
        fields: [
          { entity_id: 'address' },
          { name: 'string' },
          { level: 'u32' },
        ],
        keys: ['entity_id'], // 空keys表示使用默认entityId
      },
    },
    {
      // 2. 自定义主键（没有id字段）
      Position: {
        fields: [{ x: 'u32' }, { y: 'u32' }],
        keys: ['x', 'y'], // 复合主键，没有id字段
      },
    },
    {
      // 3. 单一自定义主键
      UserProfile: {
        fields: [
          { user_id: 'string' },
          { bio: 'string' },
          { avatar: 'string' },
        ],
        keys: ['user_id'], // 使用user_id作为主键
      },
    },
    {
      // 4. 无主键表
      GameLog: {
        fields: [
          { entity_id: 'address' },
          { action: 'string' },
          { timestamp: 'u64' },
          { data: 'string' },
        ],
        keys: ['entity_id'], // 无主键
      },
    },
  ],
  resources: [
    // {
    //   // 4. 无主键表
    //   GameLog: {
    //     fields: [
    //       { action: 'string' },
    //       { timestamp: 'u64' },
    //       { data: 'string' },
    //     ],
    //     keys: [], // 无主键
    //   },
    // },
  ],
  enums: [],
};

const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  dubheMetadata: dubheMetadata,
});

// 字段策略演示
function demonstrateFieldStrategies() {
  console.log('=== 字段策略演示 ===\n');

  // 1. 检查各表的字段配置
  console.log('1. 各表字段分析:');

  const tables = ['player', 'position', 'userProfile', 'gameLog'];

  tables.forEach((tableName) => {
    console.log(`\n表: ${tableName}`);
    console.log(`  字段: ${client.getTableFields(tableName).join(', ')}`);
    console.log(
      `  主键: ${client.getTablePrimaryKeys(tableName).join(', ') || '无主键'}`
    );
  });

  // 2. 安全查询策略演示
  console.log('\n\n2. 安全查询策略:');
  console.log('对于未知表，只查询系统字段，避免GraphQL错误');

  // 假设这是一个没有在dubhe config中定义的表
  const unknownTableFields = client.getTableFields('unknown_table');
  console.log(`未知表字段: ${unknownTableFields.join(', ')}`);
  console.log('✅ 安全：只包含createdAt和updatedAt，不包含可能不存在的id字段');

  // 3. 精确查询策略
  console.log('\n\n3. 基于配置的精确查询:');

  // Player表 - 有默认id字段
  console.log(
    `Player表（有默认id）: ${client.getTableFields('player').join(', ')}`
  );

  // Position表 - 没有id字段，有复合主键
  console.log(
    `Position表（复合主键）: ${client.getTableFields('position').join(', ')}`
  );

  // GameLog表 - 无主键
  console.log(
    `GameLog表（无主键）: ${client.getTableFields('gameLog').join(', ')}`
  );

  // 4. 实际查询演示（伪代码）
  console.log('\n\n4. 查询演示:');
  demonstrateQueries();
}

async function demonstrateQueries() {
  try {
    // ✅ 安全：自动使用正确的字段
    console.log('查询Player表（自动包含id字段）...');
    // const players = await client.getAllTables('player');

    console.log('查询Position表（自动不包含id字段）...');
    // const positions = await client.getAllTables('position');

    console.log('查询GameLog表（无主键表）...');
    // const gameLogs = await client.getAllTables('gameLog');

    console.log('✅ 所有查询都会使用正确的字段集，避免GraphQL错误');
  } catch (error: any) {
    console.log('查询示例（需要实际GraphQL服务器）:', error.message);
  }
}

// 最佳实践建议
function bestPractices() {
  console.log('\n\n=== 最佳实践建议 ===');
}

// 导出演示函数
export {
  demonstrateFieldStrategies,
  bestPractices,
  dubheMetadata as fieldStrategyDubheMetadata,
};

// 如果直接运行此文件
if (require.main === module) {
  demonstrateFieldStrategies();
  bestPractices();
}
