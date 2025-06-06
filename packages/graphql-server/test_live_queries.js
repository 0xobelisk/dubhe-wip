const WebSocket = require('ws');
const { createClient } = require('graphql-ws');

// 测试 Live Queries 的正确查询（PostGraphile方式）
const LIVE_ENCOUNTERS_QUERY = `
  subscription MyLiveSubscription {
    encounters {
      nodes {
        player
        nodeId
        monster
        exists
        catchAttempts
      }
      totalCount
    }
  }
`;

// 测试基本的 subscription（作为对比）
const BASIC_SUBSCRIPTION = `
  subscription BasicSubscription {
    allStoresChanged {
      event
      table
      data
      timestamp
    }
  }
`;

async function testLiveQueries() {
  const wsUrl = 'ws://localhost:4000/graphql';
  
  console.log('🧪 测试 PostGraphile Live Queries (@live 指令)');
  console.log(`连接到: ${wsUrl}`);
  console.log('');
  
  try {
    const client = createClient({
      url: wsUrl,
      webSocketImpl: WebSocket,
      connectionParams: {},
      keepAlive: 10000,
    });

    console.log('🔴 测试 1: Live Queries with @live 指令');
    console.log('查询:', LIVE_ENCOUNTERS_QUERY);
    console.log('');
    
    // 测试 @live 指令
    const disposeLive = client.subscribe(
      {
        query: LIVE_ENCOUNTERS_QUERY,
      },
      {
        next: (data) => {
          console.log('✅ Live Query 数据接收成功:');
          console.log(JSON.stringify(data, null, 2));
          console.log('');
        },
        error: (error) => {
          console.error('❌ Live Query 错误:', error);
          if (error.message && error.message.includes('Cannot query field')) {
            console.error('   🔍 这表明 encounters 字段在 Subscription 类型中不存在');
            console.error('   💡 检查服务器配置和数据库表是否正确');
          }
          console.log('');
        },
        complete: () => {
          console.log('✅ Live Query 订阅完成');
        },
      }
    );

    console.log('🔵 测试 2: 传统 Subscription（作为对比）');
    console.log('');
    
    // 测试传统 subscription 作为对比
    const disposeBasic = client.subscribe(
      {
        query: BASIC_SUBSCRIPTION,
      },
      {
        next: (data) => {
          console.log('✅ 传统 Subscription 数据接收:');
          console.log(JSON.stringify(data, null, 2));
          console.log('');
        },
        error: (error) => {
          console.error('❌ 传统 Subscription 错误:', error);
          console.log('');
        },
        complete: () => {
          console.log('✅ 传统 Subscription 完成');
        },
      }
    );

    console.log('⏰ 正在监听...');
    console.log('💡 Tips:');
    console.log('   1. 如果 @live 指令工作正常，您会立即收到当前数据');
    console.log('   2. 当数据库中的 store_encounter 表发生变更时，会收到实时更新');
    console.log('   3. 运行 Python 测试脚本或直接在数据库中插入数据来测试实时更新');
    console.log('');
    console.log('按 Ctrl+C 停止测试');
    console.log('');

    // 保持连接
    process.on('SIGINT', () => {
      console.log('\n📴 正在关闭连接...');
      disposeLive();
      disposeBasic();
      client.dispose();
      process.exit(0);
    });

    // 10秒后显示状态
    setTimeout(() => {
      console.log('⏰ 已运行 10 秒，如果 @live 指令正常，应该已经收到初始数据');
      console.log('   如果还没有收到数据，请检查：');
      console.log('   1. GraphQL 服务器是否正常运行');
      console.log('   2. 数据库中是否有 store_encounter 数据');
      console.log('   3. Live Queries 配置是否正确');
      console.log('');
    }, 10000);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// 检查依赖
console.log('🔍 检查依赖...');
try {
  const graphqlWs = require('graphql-ws');
  const ws = require('ws');
  console.log('✅ graphql-ws 版本:', require('graphql-ws/package.json').version);
  console.log('✅ ws 版本:', require('ws/package.json').version);
  console.log('');
} catch (error) {
  console.error('❌ 缺少依赖，请运行: pnpm install graphql-ws ws');
  console.error('错误详情:', error.message);
  process.exit(1);
}

testLiveQueries(); 