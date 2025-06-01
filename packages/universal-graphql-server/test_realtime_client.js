const WebSocket = require('ws');

class RealtimeClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.isConnected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log(`🔗 连接到实时推送服务: ${this.url}`);
      
      this.ws = new WebSocket(this.url);
      
      this.ws.on('open', () => {
        console.log('✅ WebSocket 连接成功');
        this.isConnected = true;
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('❌ 解析消息失败:', error);
        }
      });
      
      this.ws.on('close', () => {
        console.log('🔌 WebSocket 连接关闭');
        this.isConnected = false;
      });
      
      this.ws.on('error', (error) => {
        console.error('❌ WebSocket 错误:', error);
        this.isConnected = false;
        reject(error);
      });
    });
  }
  
  handleMessage(message) {
    console.log('\n📨 收到实时消息:');
    console.log(`  类型: ${message.type}`);
    
    switch (message.type) {
      case 'connection':
        console.log(`  消息: ${message.message}`);
        break;
        
      case 'store_change':
        console.log(`  通道: ${message.channel}`);
        if (message.data) {
          console.log(`  事件: ${message.data.event}`);
          console.log(`  表名: ${message.data.table}`);
          console.log(`  时间: ${message.data.timestamp}`);
          if (message.data.data) {
            console.log('  数据:', JSON.stringify(message.data.data, null, 4));
          }
        }
        break;
        
      case 'error':
        console.log(`  错误: ${message.message}`);
        break;
        
      case 'pong':
        console.log('  收到pong响应');
        break;
        
      default:
        console.log('  未知消息类型');
        console.log('  内容:', JSON.stringify(message, null, 2));
    }
    console.log('─'.repeat(50));
  }
  
  subscribe(table) {
    if (!this.isConnected) {
      console.error('❌ 未连接到服务器');
      return;
    }
    
    const message = {
      type: 'subscribe',
      table: table
    };
    
    this.ws.send(JSON.stringify(message));
    console.log(`📝 订阅表: ${table}`);
  }
  
  subscribeChannel(channel) {
    if (!this.isConnected) {
      console.error('❌ 未连接到服务器');
      return;
    }
    
    const message = {
      type: 'subscribe',
      channel: channel
    };
    
    this.ws.send(JSON.stringify(message));
    console.log(`📝 订阅通道: ${channel}`);
  }
  
  ping() {
    if (!this.isConnected) {
      console.error('❌ 未连接到服务器');
      return;
    }
    
    this.ws.send(JSON.stringify({ type: 'ping' }));
    console.log('🏓 发送ping');
  }
  
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function testRealtimeSubscription() {
  const client = new RealtimeClient('ws://localhost:4001');
  
  try {
    await client.connect();
    
    console.log('\n🎯 开始测试实时订阅功能...');
    
    // 订阅 store_encounter 表
    client.subscribe('encounter');
    client.subscribe('store_encounter');
    
    // 订阅通道
    client.subscribeChannel('store:all');
    client.subscribeChannel('table:store_encounter:change');
    
    console.log('\n💡 测试指南:');
    console.log('1. 保持此脚本运行');
    console.log('2. 在另一个终端中运行sui-rust-indexer');
    console.log('3. 或者直接向数据库插入数据:');
    console.log('   psql "postgres://postgres:postgres@127.0.0.1:5432/postgres" -c');
    console.log('   "INSERT INTO store_encounter (player, exists, monster, catch_attempts)');
    console.log('    VALUES (\'0x' + Math.random().toString(16).substr(2, 40) + '\', true, \'0x0000000000000000000000000000000000000000000000000000000000000000\', \'888\')');
    console.log('    ON CONFLICT (player) DO UPDATE SET catch_attempts = \'888\';"');
    console.log('\n⏰ 等待实时数据变更...');
    console.log('按 Ctrl+C 退出');
    
    // 每30秒发送一次ping
    const pingInterval = setInterval(() => {
      client.ping();
    }, 30000);
    
    // 处理程序退出
    process.on('SIGINT', () => {
      console.log('\n📴 正在关闭客户端...');
      clearInterval(pingInterval);
      client.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 检查WebSocket依赖
try {
  require('ws');
} catch (error) {
  console.error('❌ 缺少依赖，请运行: npm install ws');
  process.exit(1);
}

console.log('🚀 实时订阅客户端测试');
console.log('确保GraphQL服务器已启动 (npm run dev)');
console.log('');

testRealtimeSubscription(); 