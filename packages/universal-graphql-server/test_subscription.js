const WebSocket = require('ws');
const { Client } = require('graphql-ws');

// GraphQL subscription 查询
const SUBSCRIPTION_QUERY = `
  subscription TestAllStoresChanged {
    allStoresChanged {
      event
      table
      timestamp
      data
      id
    }
  }
`;

const SPECIFIC_TABLE_SUBSCRIPTION = `
  subscription TestTableChanged($tableName: String!) {
    tableChanged(tableName: $tableName) {
      event
      table
      schema
      timestamp
      data
      id
    }
  }
`;

async function testSubscription() {
  const wsUrl = 'ws://localhost:4000/graphql';
  
  console.log('🚀 开始测试 GraphQL Subscription...');
  console.log(`连接到: ${wsUrl}`);
  
  try {
    // 创建 WebSocket 客户端
    const client = Client.create({
      url: wsUrl,
      webSocketImpl: WebSocket,
      connectionParams: {
        // 可以在这里添加认证信息
      },
    });

    console.log('📡 订阅 allStoresChanged...');
    
    // 订阅所有 store 变更
    const dispose1 = client.subscribe(
      {
        query: SUBSCRIPTION_QUERY,
      },
      {
        next: (data) => {
          console.log('✅ 收到 allStoresChanged 数据:', JSON.stringify(data, null, 2));
        },
        error: (error) => {
          console.error('❌ allStoresChanged 错误:', error);
        },
        complete: () => {
          console.log('✅ allStoresChanged 订阅完成');
        },
      }
    );

    console.log('📡 订阅特定表变更 (store_encounter)...');
    
    // 订阅特定表变更
    const dispose2 = client.subscribe(
      {
        query: SPECIFIC_TABLE_SUBSCRIPTION,
        variables: { tableName: 'store_encounter' },
      },
      {
        next: (data) => {
          console.log('✅ 收到 tableChanged 数据:', JSON.stringify(data, null, 2));
        },
        error: (error) => {
          console.error('❌ tableChanged 错误:', error);
        },
        complete: () => {
          console.log('✅ tableChanged 订阅完成');
        },
      }
    );

    console.log('');
    console.log('🎯 订阅已启动，等待数据...');
    console.log('💡 现在你可以:');
    console.log('   1. 运行 sui-rust-indexer 来产生数据变更');
    console.log('   2. 使用 Python 脚本来发送测试通知');
    console.log('   3. 观察这里是否收到数据');
    console.log('');
    console.log('按 Ctrl+C 停止测试');

    // 保持连接
    process.on('SIGINT', () => {
      console.log('\n📴 正在关闭订阅...');
      dispose1();
      dispose2();
      client.dispose();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 检查 graphql-ws 是否已安装
try {
  require('graphql-ws');
} catch (error) {
  console.error('❌ 缺少依赖，请运行: npm install graphql-ws ws');
  process.exit(1);
}

testSubscription(); 