const WebSocket = require('ws');
const { createClient } = require('graphql-ws');
const { Pool } = require('pg');

// 数据库连接
const pgPool = new Pool({
  connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/postgres'
});

// Live Queries 测试
const LIVE_ENCOUNTERS_QUERY = `
  subscription TestLiveUpdate {
    encounters {
      nodes {
        player
        monster
        exists
        catchAttempts
      }
      totalCount
    }
  }
`;

async function testRealTimeLiveQueries() {
  console.log('🧪 测试 PostGraphile Live Queries 实时功能');
  console.log('');
  
  try {
    // 1. 建立WebSocket连接
    const client = createClient({
      url: 'ws://localhost:4000/graphql',
      webSocketImpl: WebSocket,
    });

    let updateCount = 0;
    let firstDataReceived = false;

    console.log('📡 开始监听Live Query...');
    
    // 2. 订阅Live Query
    const dispose = client.subscribe(
      { query: LIVE_ENCOUNTERS_QUERY },
      {
        next: (data) => {
          updateCount++;
          console.log(`\n✅ 收到更新 #${updateCount}:`);
          console.log(`   总数量: ${data.data?.encounters?.totalCount || 0}`);
          
          if (!firstDataReceived) {
            firstDataReceived = true;
            console.log('   这是初始数据');
            
            // 等待2秒后进行数据库更新测试
            setTimeout(testDatabaseUpdate, 2000);
          } else {
            console.log('   🎉 这是实时更新！Live Queries工作正常！');
          }
        },
        error: (error) => {
          console.error('❌ Live Query 错误:', error);
        }
      }
    );

    // 3. 测试数据库更新
    async function testDatabaseUpdate() {
      console.log('\n🔧 现在测试数据库更新...');
      
      try {
        // 插入新数据
        const testPlayer = `0x${Date.now().toString(16).padStart(64, '0')}`;
        
        console.log(`   插入新的 encounter: ${testPlayer.substring(0, 20)}...`);
        
        const result = await pgPool.query(`
          INSERT INTO store_encounter (player, monster, exists, catch_attempts)
          VALUES ($1, $2, $3, $4)
          RETURNING player, catch_attempts
        `, [
          testPlayer,
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          true,
          999
        ]);
        
        console.log(`   ✅ 数据插入成功: ${result.rows[0]?.player?.substring(0, 20)}...`);
        console.log('   等待Live Query推送更新...');
        
        // 10秒后检查结果
        setTimeout(() => {
          if (updateCount <= 1) {
            console.log('\n❌ 10秒内没有收到实时更新');
            console.log('   这说明Live Queries没有正确配置实时监听');
            console.log('   只收到了初始查询结果，不是真正的Live Query');
          }
          
          console.log('\n📊 测试总结:');
          console.log(`   收到更新次数: ${updateCount}`);
          console.log(`   实时功能: ${updateCount > 1 ? '✅ 工作正常' : '❌ 未工作'}`);
          
          // 清理测试数据
          cleanupAndExit(testPlayer);
        }, 10000);
        
      } catch (error) {
        console.error('❌ 数据库更新失败:', error);
      }
    }

    // 4. 清理和退出
    async function cleanupAndExit(testPlayer) {
      try {
        console.log('\n🧹 清理测试数据...');
        await pgPool.query('DELETE FROM store_encounter WHERE player = $1', [testPlayer]);
        console.log('   测试数据已清理');
      } catch (error) {
        console.warn('清理测试数据时出错:', error.message);
      }
      
      dispose();
      client.dispose();
      await pgPool.end();
      process.exit(0);
    }

    // 手动退出处理
    process.on('SIGINT', () => {
      console.log('\n用户取消测试');
      dispose();
      client.dispose();
      pgPool.end();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

console.log('🔍 检查依赖...');
testRealTimeLiveQueries(); 