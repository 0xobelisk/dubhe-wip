/**
 * DubheGraphqlClient 使用示例 - 支持自动解析 dubhe config
 *
 * 这个示例展示了如何使用新的 dubhe config 自动解析功能，
 * 让客户端自动识别表的字段信息，无需手动指定。
 */

import { DubheGraphqlClient, createDubheGraphqlClient } from './client';
import { DubheConfig } from '@0xobelisk/sui-common';

// 示例 dubhe config
const exampleDubheConfig: DubheConfig = {
  name: 'pokemon_game',
  description: 'A simple Pokemon-style game',
  enums: {
    MonsterType: ['Fire', 'Water', 'Grass', 'Electric'],
    Direction: ['North', 'South', 'East', 'West'],
  },
  resources: {},
  components: {
    // 有默认 entityId 字段的表
    Player: {
      fields: {
        name: 'string',
        level: 'u32',
        experience: 'u64',
      },
      // keys 未定义，表示有默认的 entityId 字段
    },

    // 有自定义主键的表
    Position: {
      fields: {
        x: 'u32',
        y: 'u32',
        player_id: 'string',
      },
      keys: ['player_id'], // 使用 player_id 作为主键
    },

    // 有复合主键的表
    Monster: {
      fields: {
        monster_type: 'MonsterType', // 枚举类型
        level: 'u32',
        hp: 'u32',
        attack: 'u32',
        defense: 'u32',
        owner_id: 'string',
      },
      keys: ['owner_id', 'monster_type'], // 复合主键
    },

    // 没有主键的表
    GameEvent: {
      fields: {
        event_type: 'string',
        description: 'string',
        timestamp: 'u64',
      },
      keys: [], // 空数组表示没有主键
    },
  },
};

// 创建客户端实例，传入 dubhe config
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  subscriptionEndpoint: 'ws://localhost:4000/graphql',
  dubheConfig: exampleDubheConfig, // 传入 dubhe 配置
});

// 使用示例
async function exampleUsage() {
  console.log('=== DubheGraphqlClient 自动字段解析示例 ===\n');

  // 1. 查看解析的表信息
  console.log('1. 查看所有解析的表信息:');
  const allTableInfo = client.getAllTableInfo();
  allTableInfo.forEach((info, tableName) => {
    console.log(`表 ${tableName}:`);
    console.log(`  - 字段: ${info.fields.join(', ')}`);
    console.log(`  - 主键: ${info.primaryKeys.join(', ')}`);
    console.log(`  - 有默认ID: ${info.hasDefaultId}`);
    console.log(`  - 枚举字段: ${JSON.stringify(info.enumFields)}`);
    console.log('');
  });

  // 2. 查询时自动使用解析的字段（不需要手动指定 fields）
  console.log('2. 自动字段查询示例:');
  try {
    // 查询 Player 表 - 自动包含 entityId, name, level, experience, createdAt, updatedAt
    const players = await client.getAllTables('player');
    console.log(
      'Players 查询成功，自动使用的字段:',
      client.getTableFields('player')
    );

    // 查询 Monster 表 - 自动包含所有定义的字段
    const monsters = await client.getAllTables('monster', {
      filter: { level: { greaterThan: 10 } },
    });
    console.log(
      'Monsters 查询成功，自动使用的字段:',
      client.getTableFields('monster')
    );
  } catch (error: any) {
    console.log('查询示例（需要实际的GraphQL服务器）:', error.message);
  }

  // 3. 仍然可以手动指定字段（覆盖自动解析）
  console.log('\n3. 手动指定字段示例:');
  try {
    const playersWithCustomFields = await client.getAllTables('player', {
      fields: ['entityId', 'name'], // 手动指定只查询这两个字段
    });
    console.log('手动指定字段查询成功');
  } catch (error: any) {
    console.log('手动字段查询示例（需要实际的GraphQL服务器）:', error.message);
  }

  // 4. 获取特定表的信息
  console.log('\n4. 获取特定表信息:');
  console.log('Player 表字段:', client.getTableFields('player'));
  console.log('Monster 表主键:', client.getTablePrimaryKeys('monster'));
  console.log('Monster 表枚举字段:', client.getTableEnumFields('monster'));

  // 5. 订阅时也会自动使用解析的字段
  console.log('\n5. 订阅示例:');
  try {
    const subscription = client.subscribeToTableChanges('player', {
      initialEvent: true,
      // 不指定 fields，会自动使用解析的字段
    });

    console.log(
      '订阅创建成功，将自动使用字段:',
      client.getTableFields('player')
    );

    // 取消订阅（示例）
    // subscription.subscribe().unsubscribe();
  } catch (error: any) {
    console.log('订阅示例（需要实际的GraphQL服务器）:', error.message);
  }
}

// 导出示例函数
export { exampleUsage, exampleDubheConfig };

// 如果直接运行此文件，执行示例
if (require.main === module) {
  exampleUsage().catch(console.error);
}
