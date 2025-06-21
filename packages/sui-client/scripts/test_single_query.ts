import { gql } from '@apollo/client';
import {
  createDubheGraphqlClient,
  DubheGraphqlClient,
} from '../src/libs/dubheGraphqlClient';

// 工具函数：将数字转换为64位字符串格式（不转换进制，直接补0）
function toHex64String(num: number): string {
  // 将数字转换为字符串，然后补齐到64位（前面补0）
  const numStr = num.toString();
  const padded = numStr.padStart(64, '0');
  return `0x${padded}`;
}

// 类型定义
interface EncounterNode {
  nodeId: string;
  player?: string;
  monster?: string;
  catchAttempts?: string;
  exists?: boolean;
}

interface EncountersQueryResult {
  encounters: {
    nodes: EncounterNode[];
  };
}

const CONFIG = {
  endpoint: 'http://localhost:4000/graphql',
  headers: {
    'Content-Type': 'application/json',
  },
};

async function testSingleQueries() {
  console.log('🚀 === 单个数据查询测试 ===\n');

  const client = createDubheGraphqlClient(CONFIG);

  try {
    // 方法1: 使用 getTableByCondition（如果支持）
    console.log('📋 方法1: 使用 getTableByCondition');
    try {
      const singleRecord = await client.getTableByCondition(
        'encounters',
        { player: toHex64String(1) },
        ['nodeId', 'player', 'monster', 'catchAttempts', 'exists']
      );

      if (singleRecord) {
        console.log('✅ 成功查询到单个记录:');
        console.log(`   Player: ${singleRecord.player}`);
        console.log(`   Monster: ${singleRecord.monster}`);
        console.log(`   Catch Attempts: ${singleRecord.catchAttempts}`);
        console.log(`   Exists: ${singleRecord.exists}`);
      } else {
        console.log('❌ 未找到匹配的记录');
      }
    } catch (error) {
      console.log(
        'ℹ️ getTableByCondition 方法不支持，错误:',
        (error as Error).message
      );
    }

    console.log('\n' + '─'.repeat(50) + '\n');

    // 方法2: 使用 getAllTables 限制为 1 条记录
    console.log('📋 方法2: 使用 getAllTables + first: 1');

    const result = await client.getAllTables('encounters', {
      first: 1,
      filter: {
        player: { equalTo: toHex64String(5) },
      },
      fields: ['nodeId', 'player', 'monster', 'catchAttempts', 'exists'],
    });

    if (result.edges && result.edges.length > 0) {
      const record = result.edges[0].node;
      console.log('✅ 成功查询到单个记录:');
      console.log(`   Player: ${record.player}`);
      console.log(`   Monster: ${record.monster}`);
      console.log(`   Catch Attempts: ${record.catchAttempts}`);
      console.log(`   Exists: ${record.exists}`);
      console.log(`   NodeId: ${record.nodeId}`);
    } else {
      console.log('❌ 未找到匹配的记录');
    }

    console.log('\n' + '─'.repeat(50) + '\n');

    // 方法3: 查询特定条件的第一条记录
    console.log('📋 方法3: 查询特定条件的记录');

    const catchResult = await client.getAllTables('encounters', {
      first: 1,
      filter: {
        catchAttempts: { equalTo: '10' },
      },
      fields: ['nodeId', 'player', 'catchAttempts'],
    });

    if (catchResult.edges && catchResult.edges.length > 0) {
      const record = catchResult.edges[0].node;
      console.log('✅ 找到 catchAttempts = 10 的记录:');
      console.log(`   Player: ${record.player}`);
      console.log(`   Catch Attempts: ${record.catchAttempts}`);
    } else {
      console.log('ℹ️ 未找到 catchAttempts = 10 的记录');
    }

    console.log('\n' + '─'.repeat(50) + '\n');

    // 方法4: 使用原生 GraphQL 查询单个记录
    console.log('📋 方法4: 使用原生 GraphQL 查询');

    const SINGLE_QUERY = gql`
      query GetSingleEncounter($playerValue: String!) {
        encounters(first: 1, filter: { player: { equalTo: $playerValue } }) {
          nodes {
            nodeId
            player
            monster
            catchAttempts
            exists
          }
        }
      }
    `;

    const queryResult = await client.query<EncountersQueryResult>(
      SINGLE_QUERY,
      { playerValue: toHex64String(3) }
    );

    if (queryResult.data && queryResult.data.encounters.nodes.length > 0) {
      const record = queryResult.data.encounters.nodes[0];
      console.log('✅ 原生 GraphQL 查询成功:');
      console.log(`   Player: ${record.player}`);
      console.log(`   Monster: ${record.monster}`);
      console.log(`   Catch Attempts: ${record.catchAttempts}`);
      console.log(`   Exists: ${record.exists}`);
    } else {
      console.log('❌ 原生查询未找到记录');
    }

    console.log('\n' + '─'.repeat(50) + '\n');

    // 方法5: 查询不存在的记录（测试错误处理）
    console.log('📋 方法5: 查询不存在的记录');

    const notFoundResult = await client.getAllTables('encounters', {
      first: 1,
      filter: {
        player: { equalTo: toHex64String(99999) },
      },
      fields: ['nodeId', 'player'],
    });

    if (notFoundResult.edges && notFoundResult.edges.length === 0) {
      console.log('✅ 正确处理了不存在的记录查询');
    } else {
      console.log('⚠️ 意外找到了记录');
    }

    console.log('\n' + '─'.repeat(50) + '\n');

    // 额外演示：批量查询不同的player
    console.log('📋 额外演示: 查询多个不同的player');
    for (let i = 0; i < 3; i++) {
      const playerAddress = toHex64String(i);
      console.log(`\n查询 player ${i}: ${playerAddress}`);

      const playerResult = await client.getAllTables('encounters', {
        first: 1,
        filter: { player: { equalTo: playerAddress } },
        fields: ['player', 'catchAttempts', 'exists'],
      });

      if (playerResult.edges && playerResult.edges.length > 0) {
        const record = playerResult.edges[0].node;
        console.log(
          `   ✅ 找到记录: catchAttempts=${record.catchAttempts}, exists=${record.exists}`
        );
      } else {
        console.log(`   ❌ 未找到记录`);
      }
    }
  } catch (error) {
    console.error('❌ 查询过程中发生错误:', error);
  } finally {
    client.close();
    console.log('\n🔚 测试完成，客户端已关闭');
  }
}

// 运行测试
if (require.main === module) {
  testSingleQueries().catch(console.error);
}

export { testSingleQueries };
