const WebSocket = require('ws');
const { createClient } = require('graphql-ws');

// 使用正确字段的subscription查询
const STORE_ENCOUNTERS_SUBSCRIPTION = `
  subscription StoreEncountersSubscription {
    allStoreEncounters(orderBy: PLAYER_DESC, first: 10) {
      nodes {
        nodeId
        player
        exists
        monster
        catchAttempts
      }
      totalCount
    }
  }
`;

async function testWorkingSubscription() {
  const wsUrl = 'ws://localhost:4000/graphql';
  
  console.log('🚀 测试工作版 Subscription 监听...');
  console.log(`连接到: ${wsUrl}`);
  
  try {
    const client = createClient({
      url: wsUrl,
      webSocketImpl: WebSocket,
      connectionParams: {},
      keepAlive: 10000,
    });

    console.log('📡 订阅 allStoreEncounters（使用正确字段）...');
    
    // 订阅 store_encounter 表
    const dispose1 = client.subscribe(
      {
        query: STORE_ENCOUNTERS_SUBSCRIPTION,
      },
      {
        next: (data) => {
          console.log('✅ 收到 store_encounters 数据:');
          console.log(JSON.stringify(data, null, 2));
          
          if (data.data?.allStoreEncounters?.nodes) {
            console.log('🎯 当前 store_encounter 记录数量:', data.data.allStoreEncounters.totalCount);
            console.log('   最新的记录:');
            data.data.allStoreEncounters.nodes.forEach((node, index) => {
              console.log(`   ${index + 1}. Player: ${node.player}`);
              console.log(`      Monster: ${node.monster}`);
              console.log(`      Exists: ${node.exists}`);
              console.log(`      Catch Attempts: ${node.catchAttempts}`);
            });
          }
        },
        error: (error) => {
          console.error('❌ 订阅错误:', error);
        },
        complete: () => {
          console.log('✅ 订阅完成');
        },
      }
    );

    console.log('');
    console.log('🎯 PostGraphile subscription 已启动！');
    console.log('💡 这个是标准的 GraphQL subscription');
    console.log('💡 当 store_encounter 表有变更时，应该能看到数据更新');
    console.log('');
    console.log('⚡ 现在你可以：');
    console.log('   1. 运行 sui-rust-indexer 来产生数据变更');
    console.log('   2. 运行 python test_notify.py 来测试通知');
    console.log('   3. 直接向数据库插入数据测试');
    console.log('');
    console.log('按 Ctrl+C 停止');

    // 保持连接
    process.on('SIGINT', () => {
      console.log('\n📴 正在关闭订阅...');
      dispose1();
      client.dispose();
      process.exit(0);
    });

    // 设置超时检测
    setTimeout(() => {
      console.log('');
      console.log('⏰ 已等待 30 秒');
      console.log('💡 如果你想测试实时更新，可以在另一个终端运行：');
      console.log('   python test_notify.py');
      console.log('   或者直接操作数据库');
    }, 30000);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

console.log('🔍 使用正确字段的 PostGraphile subscription...');
testWorkingSubscription(); 