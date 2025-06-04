const WebSocket = require('ws');
const { createClient } = require('graphql-ws');

// 使用PostGraphile标准的subscription查询
const STORE_ENCOUNTERS_SUBSCRIPTION = `
  subscription StoreEncountersSubscription @live {
    allStoreEncounters(orderBy: PLAYER_DESC, first: 10) {
      nodes {
        player
        id
        createdAt
      }
      totalCount
    }
  }
`;

async function testStandardSubscription() {
  const wsUrl = 'ws://localhost:4000/graphql';
  
  console.log('🚀 测试 PostGraphile 标准 Subscription 监听...');
  console.log(`连接到: ${wsUrl}`);
  
  try {
    const client = createClient({
      url: wsUrl,
      webSocketImpl: WebSocket,
      connectionParams: {},
      keepAlive: 10000,
    });

    console.log('📡 订阅 allStoreEncounters（使用 @live 指令）...');
    
    // 订阅 store_encounter 表的实时查询
    const dispose1 = client.subscribe(
      {
        query: STORE_ENCOUNTERS_SUBSCRIPTION,
      },
      {
        next: (data) => {
          console.log('✅ 收到 store_encounters 实时数据:');
          console.log(JSON.stringify(data, null, 2));
          
          if (data.data?.allStoreEncounters?.nodes) {
            console.log('🎯 当前 store_encounter 记录数量:', data.data.allStoreEncounters.totalCount);
            console.log('   最新的几条记录:');
            data.data.allStoreEncounters.nodes.forEach((node, index) => {
              console.log(`   ${index + 1}. Player: ${node.player}, ID: ${node.id}`);
            });
          }
        },
        error: (error) => {
          console.error('❌ 订阅错误:', error);
          console.error('   这可能是因为：');
          console.error('   1. Live queries 功能未启用');
          console.error('   2. @live 指令不被支持');
          console.error('   3. 表结构问题');
        },
        complete: () => {
          console.log('✅ 订阅完成');
        },
      }
    );

    console.log('');
    console.log('🎯 PostGraphile 标准订阅已启动！');
    console.log('💡 这个订阅使用 @live 指令来实现实时更新');
    console.log('💡 当 store_encounter 表有变更时，你应该能看到数据更新');
    console.log('');
    console.log('⚡ 现在运行 sui-rust-indexer 或向数据库插入数据');
    console.log('   应该能看到实时数据变更！');
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
      console.log('⏰ 已等待 30 秒，如果没有收到数据，请：');
      console.log('   1. 确认 GraphQL 服务器支持 live queries');
      console.log('   2. 运行 python test_notify.py 或数据库操作');
      console.log('   3. 检查服务器控制台日志');
    }, 30000);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

console.log('🔍 使用 PostGraphile 标准 subscription...');
testStandardSubscription(); 