const WebSocket = require('ws');
const { createClient } = require('graphql-ws');
const { Pool } = require('pg');

// 数据库连接
const pgPool = new Pool({
  connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/postgres'
});

// 使用PostGraphile的listen订阅
const LISTEN_SUBSCRIPTION = `
  subscription TestListenSubscription {
    listen(topic: "store_encounter") {
      relatedNodeId
      relatedNode {
        nodeId
      }
    }
  }
`;

async function testListenSubscription() {
  console.log('🧪 测试 PostGraphile Listen 订阅功能');
  console.log('');
  
  try {
    // 1. 建立WebSocket连接
    const client = createClient({
      url: 'ws://localhost:4000/graphql',
      webSocketImpl: WebSocket,
    });

    let updateCount = 0;
    let firstDataReceived = false;

    console.log('📡 开始监听 Listen 订阅...');
    
    // 2. 订阅listen
    const dispose = client.subscribe(
      { query: LISTEN_SUBSCRIPTION },
      {
        next: (data) => {
          updateCount++;
          console.log(`\n✅ 收到 Listen 更新 #${updateCount}:`);
          console.log(JSON.stringify(data, null, 2));
          
          if (!firstDataReceived) {
            firstDataReceived = true;
            console.log('   开始监听通知...');
            
            // 等待2秒后进行数据库更新测试
            setTimeout(testDatabaseUpdate, 2000);
          } else {
            console.log('   🎉 收到实时通知！Listen订阅工作正常！');
          }
        },
        error: (error) => {
          console.error('❌ Listen 订阅错误:', error);
          if (error.find && error.find(e => e.message.includes('Cannot query field "listen"'))) {
            console.error('   🔍 PostGraphile没有启用simpleSubscriptions功能');
            console.error('   💡 需要在配置中添加 simpleSubscriptions: true');
          }
        }
      }
    );

    // 3. 测试数据库更新和通知
    async function testDatabaseUpdate() {
      console.log('\n🔧 现在测试手动通知...');
      
      try {
        const client = await pgPool.connect();
        
        // 发送PostGraphile格式的通知
        console.log('   发送 postgraphile:store_encounter 通知...');
        await client.query(`SELECT pg_notify('postgraphile:store_encounter', '{}')`);
        
        console.log('   等待订阅响应...');
        
        // 10秒后检查结果
        setTimeout(() => {
          if (updateCount <= 1) {
            console.log('\n❌ 10秒内没有收到实时更新');
            console.log('   这说明PostGraphile的Listen订阅没有正确配置');
          }
          
          console.log('\n📊 测试总结:');
          console.log(`   收到更新次数: ${updateCount}`);
          console.log(`   Listen订阅: ${updateCount > 1 ? '✅ 工作正常' : '❌ 未工作'}`);
          
          client.release();
          dispose();
          clientWs.dispose();
          pgPool.end();
          process.exit(0);
        }, 10000);
        
      } catch (error) {
        console.error('❌ 通知发送失败:', error);
      }
    }

    const clientWs = client;

    // 手动退出处理
    process.on('SIGINT', () => {
      console.log('\n用户取消测试');
      dispose();
      clientWs.dispose();
      pgPool.end();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

console.log('🔍 测试PostGraphile Listen订阅...');
testListenSubscription(); 