import { gql } from '@apollo/client';
import {
  createDubheGraphqlClient,
  DubheGraphqlClient,
} from '../src/libs/dubheGraphqlClient';

// 类型定义
interface EncounterNode {
  catchAttempts?: number;
  exists?: boolean;
  monster?: string;
  nodeId: string;
  player?: string;
}

interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

interface EncountersConnection {
  nodes: EncounterNode[];
  totalCount: number;
  pageInfo: PageInfo;
}

interface QueryResult {
  encounters: EncountersConnection;
}

interface SubscriptionResult {
  encountersChanged: EncounterNode;
}

// 检查ws模块是否可用
function checkWebSocketSupport(): boolean {
  try {
    if (typeof window !== 'undefined') {
      // 浏览器环境，有原生WebSocket
      return true;
    } else {
      // Node.js环境，需要检查ws模块
      require('ws');
      return true;
    }
  } catch (error) {
    return false;
  }
}

// 配置
const hasWebSocketSupport = checkWebSocketSupport();

const CONFIG = {
  endpoint: 'http://localhost:4000/graphql',
  // 只有在支持WebSocket时才设置订阅端点
  ...(hasWebSocketSupport && {
    subscriptionEndpoint: 'ws://localhost:4000/graphql',
  }),
  headers: {
    'Content-Type': 'application/json',
  },
};

// 测试查询
const TEST_QUERY = gql`
  query MyQuery {
    encounters {
      nodes {
        catchAttempts
        exists
        monster
        nodeId
        player
      }
      totalCount
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

// 测试订阅（仅在支持WebSocket时使用）
const TEST_SUBSCRIPTION = gql`
  subscription MySubscription {
    encounters {
      nodes {
        player
        monster
        catchAttempts
        exists
      }
    }
  }
`;

// 简单查询测试
const SIMPLE_QUERY = gql`
  query SimpleQuery($first: Int) {
    encounters(first: $first) {
      nodes {
        player
      }
      totalCount
    }
  }
`;

class GraphQLTester {
  private client: DubheGraphqlClient;
  private supportsSubscriptions: boolean;

  constructor() {
    console.log('🚀 初始化 GraphQL 客户端...');

    this.supportsSubscriptions = hasWebSocketSupport;

    if (!this.supportsSubscriptions) {
      console.log('⚠️  警告：WebSocket支持不可用，将跳过订阅功能测试');
      console.log('💡 要启用订阅功能，请安装ws模块：npm install ws');
    }

    this.client = createDubheGraphqlClient(CONFIG);
  }

  // 测试基础查询
  async testBasicQuery() {
    console.log('\n📊 === 测试基础查询 ===');

    try {
      console.log('发送查询请求...');
      const result = await this.client.query(TEST_QUERY);

      if (result.error) {
        console.error('❌ 查询错误:', result.error.message);
        return;
      }

      console.log('✅ 查询成功!');

      // 类型断言
      const data = result.data as QueryResult;

      console.log('📈 数据统计:');
      console.log(`  - 总数: ${data?.encounters?.totalCount || 0}`);
      console.log(`  - 当前页数量: ${data?.encounters?.nodes?.length || 0}`);
      console.log(
        `  - 是否有下一页: ${data?.encounters?.pageInfo?.hasNextPage || false}`
      );

      if (data?.encounters?.nodes?.length > 0) {
        console.log('\n📋 前几条数据:');
        data.encounters.nodes
          .slice(0, 3)
          .forEach((node: EncounterNode, index: number) => {
            console.log(`  ${index + 1}. Player: ${node.player || 'N/A'}`);
            console.log(`     Monster: ${node.monster || 'N/A'}`);
            console.log(`     Catch Attempts: ${node.catchAttempts || 0}`);
            console.log(`     Exists: ${node.exists}`);
            console.log('     ---');
          });
      } else {
        console.log('📝 数据为空，可能需要先运行 indexer 来同步数据');
      }
    } catch (error) {
      console.error('❌ 查询异常:', error);
    }
  }

  // 测试带参数的查询
  async testParameterizedQuery() {
    console.log('\n🔍 === 测试带参数查询 ===');

    try {
      console.log('发送带参数的查询请求 (first: 5)...');
      const result = await this.client.query(SIMPLE_QUERY, { first: 5 });

      if (result.error) {
        console.error('❌ 查询错误:', result.error.message);
        return;
      }

      console.log('✅ 带参数查询成功!');

      // 类型断言
      const data = result.data as QueryResult;

      console.log(`📊 返回数据数量: ${data?.encounters?.nodes?.length || 0}`);
      console.log(`📈 总数: ${data?.encounters?.totalCount || 0}`);
    } catch (error) {
      console.error('❌ 带参数查询异常:', error);
    }
  }

  // 测试使用客户端封装的方法
  async testClientMethods() {
    console.log('\n⚡ === 测试客户端封装方法 ===');

    try {
      console.log('使用 getAllTables 方法查询 encounters...');
      const result = await this.client.getAllTables('encounters', {
        first: 3,
        orderBy: [{ field: 'player', direction: 'ASC' }],
        fields: ['nodeId', 'player', 'monster', 'catchAttempts', 'exists'], // 指定需要的字段
      });

      console.log('✅ getAllTables 查询成功!');
      console.log(`📊 返回数据数量: ${result.edges?.length || 0}`);

      if (result.edges?.length > 0) {
        console.log('\n📋 数据详情:');
        result.edges.forEach((edge: any, index: number) => {
          console.log(`  ${index + 1}. Player: ${edge.node.player || 'N/A'}`);
          console.log(`     Monster: ${edge.node.monster || 'N/A'}`);
          console.log(`     NodeId: ${edge.node.nodeId || 'N/A'}`);
        });
      }

      // 测试其他表
      console.log('\n尝试查询其他表...');

      // 测试 accounts 表
      try {
        const accounts = await this.client.getAllTables('accounts', {
          first: 2,
          fields: ['nodeId', 'assetId', 'account', 'balance'], // 指定accounts表的字段
        });
        console.log(
          `✅ accounts 表查询成功，数据量: ${accounts.edges?.length || 0}`
        );
      } catch (error) {
        console.log(
          `ℹ️ accounts 表可能为空或不存在:`,
          (error as Error).message
        );
      }

      // 测试 positions 表
      try {
        const positions = await this.client.getAllTables('positions', {
          first: 2,
          fields: ['nodeId', 'account', 'x', 'y'], // 指定positions表的字段
        });
        console.log(
          `✅ positions 表查询成功，数据量: ${positions.edges?.length || 0}`
        );
      } catch (error) {
        console.log(
          `ℹ️ positions 表可能为空或不存在:`,
          (error as Error).message
        );
      }

      // 测试 mapConfigs 表
      try {
        const mapConfigs = await this.client.getAllTables('mapConfigs', {
          first: 2,
          fields: ['nodeId', 'key', 'value'], // 指定mapConfigs表的字段
        });
        console.log(
          `✅ mapConfigs 表查询成功，数据量: ${mapConfigs.edges?.length || 0}`
        );
      } catch (error) {
        console.log(
          `ℹ️ mapConfigs 表可能为空或不存在:`,
          (error as Error).message
        );
      }
    } catch (error) {
      console.error('❌ 客户端方法测试异常:', error);
    }
  }

  // 测试订阅功能（仅在支持WebSocket时运行）
  async testSubscription() {
    console.log('\n🔔 === 测试订阅功能 ===');

    if (!this.supportsSubscriptions) {
      console.log('⚠️  跳过订阅测试：WebSocket支持不可用');
      console.log('💡 要启用订阅功能，请运行：npm install ws');
      return;
    }

    return new Promise<void>((resolve) => {
      let messageCount = 0;
      const maxMessages = 3; // 最多等待3条消息
      const timeout = 15000; // 15秒超时

      console.log('开始订阅 encounters 数据变更...');
      console.log(`⏱️ 将等待 ${timeout / 1000} 秒或 ${maxMessages} 条消息`);

      try {
        const subscription = this.client.subscribe(TEST_SUBSCRIPTION);

        const timer = setTimeout(() => {
          console.log(`⏰ ${timeout / 1000} 秒超时，结束订阅测试`);
          sub.unsubscribe();
          resolve();
        }, timeout);

        const sub = subscription.subscribe({
          next: (result: any) => {
            messageCount++;
            console.log(`\n📨 收到订阅消息 #${messageCount}:`);

            if (result.error) {
              console.error('❌ 订阅错误:', result.error.message);
            } else if (result.data) {
              const subscriptionData = result.data as SubscriptionResult;
              console.log(
                '✅ 订阅数据:',
                JSON.stringify(subscriptionData, null, 2)
              );
            } else {
              console.log('📭 收到空数据包');
            }

            if (messageCount >= maxMessages) {
              console.log(`✅ 已收到 ${maxMessages} 条消息，结束订阅测试`);
              clearTimeout(timer);
              sub.unsubscribe();
              resolve();
            }
          },
          error: (error: any) => {
            console.error('❌ 订阅连接错误:', error);
            clearTimeout(timer);
            resolve();
          },
          complete: () => {
            console.log('✅ 订阅连接已完成');
            clearTimeout(timer);
            resolve();
          },
        });

        console.log('🟢 订阅已启动，等待数据变更...');
        console.log('💡 提示：您可以通过 indexer 触发数据变更来测试订阅功能');
      } catch (error) {
        console.error('❌ 订阅启动失败:', error);
        resolve();
      }
    });
  }

  // 测试使用客户端订阅方法（仅在支持WebSocket时运行）
  async testClientSubscription() {
    console.log('\n🔔 === 测试客户端订阅方法 ===');

    if (!this.supportsSubscriptions) {
      console.log('⚠️  跳过客户端订阅测试：WebSocket支持不可用');
      return;
    }

    return new Promise<void>((resolve) => {
      const timeout = 10000; // 10秒超时

      console.log('使用 subscribeToTableChanges 方法订阅...');

      try {
        const subscription = this.client.subscribeToTableChanges('encounters', {
          onData: (data: any) => {
            console.log('✅ 收到订阅数据:', data);
          },
          onError: (error: any) => {
            console.error('❌ 订阅错误:', error);
          },
          onComplete: () => {
            console.log('✅ 订阅完成');
          },
          fields: ['nodeId', 'player', 'monster', 'catchAttempts', 'exists'], // 指定需要订阅的字段
        });

        const timer = setTimeout(() => {
          console.log('⏰ 10秒超时，结束客户端订阅测试');
          sub.unsubscribe();
          resolve();
        }, timeout);

        const sub = subscription.subscribe({
          next: (result: any) => {
            if (result.data) {
              console.log('📨 客户端订阅收到数据:', result.data);
            }
          },
          error: (error: any) => {
            console.error('❌ 客户端订阅错误:', error);
            clearTimeout(timer);
            resolve();
          },
        });

        console.log('🟢 客户端订阅已启动');
      } catch (error) {
        console.error('❌ 客户端订阅启动失败:', error);
        resolve();
      }
    });
  }

  // 测试查询单个数据
  async testSingleDataQuery() {
    console.log('\n🔍 === 测试单个数据查询 ===');

    try {
      // 方法1: 使用 getTableByCondition（推荐）
      console.log(
        '方法1: 使用 getTableByCondition 根据 player 查询单个 encounter...'
      );

      try {
        const singleEncounter = await this.client.getTableByCondition(
          'encounters',
          {
            player:
              '0x0000000000000000000000000000000000000000000000000000000000000001',
          },
          ['nodeId', 'player', 'monster', 'catchAttempts', 'exists']
        );

        if (singleEncounter) {
          console.log('✅ 找到单个记录:');
          console.log(`  Player: ${singleEncounter.player}`);
          console.log(`  Monster: ${singleEncounter.monster}`);
          console.log(`  Catch Attempts: ${singleEncounter.catchAttempts}`);
          console.log(`  NodeId: ${singleEncounter.nodeId}`);
        } else {
          console.log('❌ 未找到匹配记录');
        }
      } catch (error) {
        console.log(
          'ℹ️ getTableByCondition 可能不支持，错误:',
          (error as Error).message
        );
      }

      // 方法2: 使用 getAllTables 限制数量为 1
      console.log('\n方法2: 使用 getAllTables first: 1 查询单个记录...');

      const result = await this.client.getAllTables('encounters', {
        first: 1,
        filter: {
          player: {
            equalTo:
              '0x0000000000000000000000000000000000000000000000000000000000000002',
          },
        },
        fields: ['nodeId', 'player', 'monster', 'catchAttempts', 'exists'],
      });

      if (result.edges.length > 0) {
        const encounter = result.edges[0].node;
        console.log('✅ 通过 first: 1 查询到单个记录:');
        console.log(`  Player: ${encounter.player}`);
        console.log(`  Monster: ${encounter.monster}`);
        console.log(`  Catch Attempts: ${encounter.catchAttempts}`);
        console.log(`  NodeId: ${encounter.nodeId}`);
      } else {
        console.log('❌ 未找到匹配记录');
      }

      // 方法3: 测试查询不存在的记录
      console.log('\n方法3: 测试查询不存在的记录...');

      const notFound = await this.client.getAllTables('encounters', {
        first: 1,
        filter: {
          player: { equalTo: '0xnonexistent' },
        },
        fields: ['nodeId', 'player'],
      });

      if (notFound.edges.length === 0) {
        console.log('✅ 正确处理了不存在的记录，返回空结果');
      } else {
        console.log('⚠️ 意外找到了记录');
      }

      // 方法4: 测试精确查询（如果表支持其他字段查询）
      console.log('\n方法4: 测试使用其他条件查询...');

      const catchAttemptsResult = await this.client.getAllTables('encounters', {
        first: 1,
        filter: {
          catchAttempts: { equalTo: '5' },
        },
        fields: ['nodeId', 'player', 'monster', 'catchAttempts'],
      });

      if (catchAttemptsResult.edges.length > 0) {
        const encounter = catchAttemptsResult.edges[0].node;
        console.log('✅ 通过 catchAttempts 查询到记录:');
        console.log(`  Player: ${encounter.player}`);
        console.log(`  Catch Attempts: ${encounter.catchAttempts}`);
      } else {
        console.log('ℹ️ 未找到 catchAttempts = 5 的记录');
      }
    } catch (error) {
      console.error('❌ 单个数据查询测试异常:', error);
    }
  }

  // 执行所有测试
  async runAllTests() {
    console.log('🧪 === Dubhe GraphQL 客户端测试 ===');
    console.log('🌐 服务器地址:', CONFIG.endpoint);

    if (this.supportsSubscriptions && CONFIG.subscriptionEndpoint) {
      console.log('📡 订阅地址:', CONFIG.subscriptionEndpoint);
    } else {
      console.log('📡 订阅功能: 不可用 (缺少WebSocket支持)');
    }

    try {
      // 测试查询功能
      await this.testBasicQuery();
      await this.testParameterizedQuery();
      await this.testClientMethods();

      // 测试单个数据查询
      await this.testSingleDataQuery();

      // 只有在支持WebSocket时才测试订阅功能
      if (this.supportsSubscriptions) {
        await this.testSubscription();
        await this.testClientSubscription();
      } else {
        console.log('\n💡 === 如何启用订阅功能 ===');
        console.log('1. 安装ws模块：npm install ws');
        console.log('2. 确保GraphQL服务器支持WebSocket订阅');
        console.log('3. 重新运行测试脚本');
      }
    } catch (error) {
      console.error('❌ 测试过程中发生异常:', error);
    } finally {
      console.log('\n🔚 === 测试完成，关闭客户端 ===');
      this.client.close();
    }
  }
}

// 主函数
async function main() {
  console.log('🔍 检查运行环境...');
  console.log(`📍 Node.js环境: ${typeof window === 'undefined' ? '是' : '否'}`);
  console.log(`🔌 WebSocket支持: ${hasWebSocketSupport ? '可用' : '不可用'}`);

  const tester = new GraphQLTester();
  await tester.runAllTests();
}

// 错误处理
process.on('unhandledRejection', (error) => {
  console.error('❌ 未处理的Promise拒绝:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n👋 收到中断信号，正在退出...');
  process.exit(0);
});

// 运行测试
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 主函数执行失败:', error);
    process.exit(1);
  });
}

export { GraphQLTester, main };
