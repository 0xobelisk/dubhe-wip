const WebSocket = require('ws');
const { Client } = require('graphql-ws');

// 正确的 subscription 查询
const STORE_ENCOUNTER_SUBSCRIPTION = `
  subscription StoreEncounterChanges {
    allStoresChanged {
      event
      table
      timestamp
      data
      id
    }
  }
`;

// 更具体的表订阅
const TABLE_SPECIFIC_SUBSCRIPTION = `
  subscription TableEncounterChanges($tableName: String!) {
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

async function testRealSubscription() {
  const wsUrl = 'ws://localhost:4000/graphql';
  
  console.log('🚀 测试修复版 Subscription 监听...');
  console.log(`连接到: ${wsUrl}`);
  console.log(`使用 Client 版本: ${require('graphql-ws/package.json').version}`);
  
  try {
    // 验证 Client 是否正确导入
    if (typeof Client === 'undefined') {
      throw new Error('Client 导入失败');
    }
    
    console.log('✅ Client 导入成功');
    
    const client = Client.create({
      url: wsUrl,
      webSocketImpl: WebSocket,
      connectionParams: {},
      keepAlive: 10000,
    });

    console.log('📡 订阅 store 表变更（包括 store_encounter）...');
    
    // 订阅所有 store 变更
    const dispose1 = client.subscribe(
      {
        query: STORE_ENCOUNTER_SUBSCRIPTION,
      },
      {
        next: (data) => {
          console.log('✅ 收到 store 变更数据:');
          console.log(JSON.stringify(data, null, 2));
          
          // 检查是否是 store_encounter 表的变更
          if (data.data?.allStoresChanged?.table === 'store_encounter') {
            console.log('🎯 这是 store_encounter 表的变更！');
            console.log('   Player:', data.data.allStoresChanged.data?.player);
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

    console.log('📡 订阅 store_encounter 特定表变更...');
    
    // 订阅特定的 store_encounter 表
    const dispose2 = client.subscribe(
      {
        query: TABLE_SPECIFIC_SUBSCRIPTION,
        variables: { tableName: 'store_encounter' },
      },
      {
        next: (data) => {
          console.log('✅ 收到 store_encounter 特定变更:');
          console.log(JSON.stringify(data, null, 2));
        },
        error: (error) => {
          console.error('❌ 特定表订阅错误:', error);
        },
        complete: () => {
          console.log('✅ 特定表订阅完成');
        },
      }
    );

    console.log('');
    console.log('🎯 正确的 subscription 已启动！');
    console.log('💡 这些订阅会监听到：');
    console.log('   - store_encounter 表的 INSERT/UPDATE/DELETE');
    console.log('   - 其他 store_* 表的变更');
    console.log('');
    console.log('⚡ 现在运行 sui-rust-indexer 或 Python 测试脚本');
    console.log('   应该能看到实时数据变更！');
    console.log('');
    console.log('按 Ctrl+C 停止');

    // 保持连接
    process.on('SIGINT', () => {
      console.log('\n📴 正在关闭订阅...');
      dispose1();
      dispose2();
      client.dispose();
      process.exit(0);
    });

    // 设置超时检测
    setTimeout(() => {
      console.log('⏰ 已等待 30 秒，如果没有收到数据，请检查：');
      console.log('   1. GraphQL 服务器是否正常运行');
      console.log('   2. 是否有数据变更发生');
      console.log('   3. PostgreSQL NOTIFY 是否正确发送');
    }, 30000);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// 检查依赖和版本
console.log('🔍 检查依赖...');
try {
  const graphqlWs = require('graphql-ws');
  const ws = require('ws');
  console.log('✅ graphql-ws 版本:', require('graphql-ws/package.json').version);
  console.log('✅ ws 版本:', require('ws/package.json').version);
  console.log('✅ Client 类型:', typeof graphqlWs.Client);
} catch (error) {
  console.error('❌ 缺少依赖，请运行: npm install graphql-ws ws');
  console.error('错误详情:', error.message);
  process.exit(1);
}

testRealSubscription(); 