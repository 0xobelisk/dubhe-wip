const { Pool } = require('pg');

const pgPool = new Pool({
  connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/postgres'
});

async function testDirectNotifications() {
  console.log('🔍 测试PostgreSQL通知机制');
  
  try {
    const client = await pgPool.connect();
    
    // 监听各种可能的通知频道
    const channels = [
      'postgraphile:store_encounter',
      'postgraphile:ddl', 
      'table_change_store_encounter',
      'table:store_encounter:change',
      'store:all'
    ];
    
    for (const channel of channels) {
      await client.query(`LISTEN "${channel}"`);
      console.log(`📡 监听频道: ${channel}`);
    }
    
    // 设置通知监听器
    client.on('notification', (msg) => {
      console.log(`\n✅ 收到通知:`);
      console.log(`   频道: ${msg.channel}`);
      console.log(`   载荷: ${msg.payload}`);
      try {
        const data = JSON.parse(msg.payload);
        console.log(`   解析数据:`, data);
      } catch (e) {
        console.log(`   (载荷不是JSON格式)`);
      }
    });
    
    console.log('\n⏰ 正在监听通知...');
    console.log('💡 在另一个终端中插入数据到store_encounter表来测试');
    console.log('💡 或运行: psql postgres://postgres:postgres@127.0.0.1:5432/postgres');
    console.log('💡 然后执行: INSERT INTO store_encounter (player, monster, exists, catch_attempts) VALUES (\'test\', \'test\', true, 0);');
    console.log('\n按 Ctrl+C 停止监听');
    
    // 保持连接
    process.on('SIGINT', () => {
      console.log('\n📴 停止监听通知');
      client.release();
      pgPool.end();
      process.exit(0);
    });
    
    // 防止程序退出
    await new Promise(() => {});
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

testDirectNotifications(); 