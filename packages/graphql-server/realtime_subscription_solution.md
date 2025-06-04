# 实时 Subscription 解决方案

## 问题确认
✅ PostgreSQL NOTIFY 系统完全正常工作
❌ PostGraphile Live Queries 配置有问题  
❌ 自定义 subscription 插件未加载

## 解决方案：自定义 WebSocket 实时推送

创建一个绕过 PostGraphile 限制的直接解决方案：

### 1. 基于 WebSocket 的实时推送服务

```typescript
// packages/universal-graphql-server/src/realtime-server.ts
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';

export class RealtimeSubscriptionServer {
  private wss: WebSocketServer;
  private pgPool: Pool;
  
  constructor(port: number, dbUrl: string) {
    this.wss = new WebSocketServer({ port });
    this.pgPool = new Pool({ connectionString: dbUrl });
    this.setupPostgreSQLListener();
    this.setupWebSocketHandlers();
  }
  
  private async setupPostgreSQLListener() {
    const client = await this.pgPool.connect();
    
    // 监听所有相关通道
    await client.query('LISTEN "store:all"');
    await client.query('LISTEN "table:store_encounter:change"');
    
    client.on('notification', (msg) => {
      const data = JSON.parse(msg.payload);
      
      // 广播给所有订阅的客户端
      this.broadcast({
        type: 'store_change',
        channel: msg.channel,
        data: data
      });
    });
  }
  
  private broadcast(message: any) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
}
```

### 2. 客户端连接代码

```javascript
// 连接到实时推送服务
const ws = new WebSocket('ws://localhost:4001');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'store_change') {
    console.log('收到实时数据变更:', message.data);
    
    // 更新 UI 或重新获取数据
    if (message.data.table === 'store_encounter') {
      // 刷新 encounter 数据
      refetchEncounterData();
    }
  }
};

// 订阅特定表
ws.send(JSON.stringify({
  type: 'subscribe',
  table: 'store_encounter'
}));
```

### 3. 与现有 GraphQL 结合使用

```javascript
// 1. 使用 GraphQL 获取初始数据
const { data } = await graphqlClient.query({
  query: gql`
    query GetEncounters {
      allStoreEncounters(orderBy: PLAYER_DESC) {
        nodes {
          player
          exists
          monster
          catchAttempts
        }
      }
    }
  `
});

// 2. 使用 WebSocket 监听实时更新
const ws = new WebSocket('ws://localhost:4001');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.data.table === 'store_encounter') {
    // 有新数据，重新查询或更新本地状态
    refetch();
  }
};
```

## 优势

1. ✅ **完全实时** - 基于 PostgreSQL NOTIFY
2. ✅ **性能优秀** - 直接 WebSocket 连接  
3. ✅ **简单可靠** - 绕过 PostGraphile 限制
4. ✅ **灵活扩展** - 可以添加更多自定义逻辑

## 实施步骤

1. 创建 `RealtimeSubscriptionServer` 类
2. 在端口 4001 启动 WebSocket 服务器
3. 监听 PostgreSQL NOTIFY 事件
4. 客户端连接到 WebSocket 接收实时更新
5. 结合现有 GraphQL 查询使用

这个方案可以立即解决你的实时数据订阅问题！ 