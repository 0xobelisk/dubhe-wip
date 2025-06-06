# 🚀 统一实时引擎使用指南

## 🎯 **概述**

我已经为你的通用引擎实现了**统一实时架构**，同时支持：

✅ **PostGraphile Live Queries** - 适合复杂查询和中低频更新  
✅ **原生WebSocket** - 适合高频简单数据和低延迟需求

## 🏗️ **架构特点**

- **双引擎支持**：自动处理两种不同的实时数据需求
- **智能路由**：根据数据类型和更新频率选择最佳传输方式
- **自动检测**：数据库变更自动触发通知，无需手动配置
- **类型安全**：完整的TypeScript支持
- **容错处理**：自动重连和错误恢复

## 📊 **使用决策表**

| 场景 | 数据类型 | 更新频率 | 推荐方案 | 延迟 | 带宽 |
|------|---------|---------|---------|------|------|
| 玩家位置 | 简单坐标 | >1次/秒 | Native WS | <20ms | 0.1KB |
| 背包物品 | 复杂对象 | 几次/分钟 | Live Queries | <100ms | 5KB |
| 任务进度 | 关联数据 | 偶尔 | Live Queries | <200ms | 10KB |
| 聊天消息 | 简单文本 | 实时 | Native WS | <10ms | 0.5KB |
| 排行榜 | 大数据集 | 定期 | Live Queries | <500ms | 50KB |

## 🛠️ **服务器端配置**

### 1. GraphQL服务器 (端口4000)

```typescript
// packages/graphql-server/src/index.ts
const realtimeEngine = new UnifiedRealtimeEngine({
  port: 4001,                    // Native WebSocket端口
  dbUrl: DATABASE_URL,
  enableLiveQueries: true,       // 启用Live Queries
  enableNativeWebSocket: true,   // 启用原生WebSocket
  tableNames: ['store_encounter', 'store_player', 'store_item'],
  maxConnections: 1000,
  heartbeatInterval: 30000,
});
```

### 2. Rust Indexer

```rust
// 自动为每个store表创建触发器
create_realtime_trigger(&mut conn, "store_encounter").await?;
create_realtime_trigger(&mut conn, "store_player").await?;
create_realtime_trigger(&mut conn, "store_item").await?;
```

## 💻 **客户端使用**

### 方式1: Live Queries (推荐用于复杂数据)

```graphql
# 实时查询玩家背包
subscription PlayerInventoryLive($playerId: String!) {
  items(filter: { playerId: { equalTo: $playerId } }) @live {
    nodes {
      id
      type
      quantity
      rarity
      attributes
    }
    totalCount
  }
}

# 实时查询游戏遭遇
subscription EncountersLive {
  encounters(filter: { status: { equalTo: "active" } }) @live {
    nodes {
      id
      playerId
      enemyType
      status
      loot
    }
  }
}
```

### 方式2: 原生WebSocket (推荐用于高频数据)

```javascript
// 连接原生WebSocket
const ws = new WebSocket('ws://localhost:4001');

ws.onopen = () => {
  // 订阅玩家位置更新
  ws.send(JSON.stringify({
    action: 'subscribe',
    subscriptionType: 'native',
    table: 'store_player_positions',
    filter: { playerId: 'player123' }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'update':
    case 'insert':
      updatePlayerPosition(message.data);
      break;
      
    case 'delete':
      removePlayer(message.id);
      break;
  }
};
```

## 🎮 **游戏场景示例**

### 实时战斗系统

```javascript
// 高频数据 - 原生WebSocket
const battleWS = new WebSocket('ws://localhost:4001');

// 订阅实时战斗数据
battleWS.send(JSON.stringify({
  action: 'subscribe',
  subscriptionType: 'native',
  table: 'store_battle_actions',
  filter: { battleId: currentBattleId }
}));

battleWS.onmessage = (event) => {
  const action = JSON.parse(event.data);
  // 立即更新战斗UI
  updateBattleAnimation(action.data);
};
```

### 游戏状态管理

```graphql
# 中频数据 - Live Queries
subscription GameStateLive($playerId: String!) {
  # 玩家基本信息
  players(filter: { id: { equalTo: $playerId } }) @live {
    nodes {
      id
      level
      experience
      gold
      health
      mana
    }
  }
  
  # 当前任务
  quests(filter: { 
    playerId: { equalTo: $playerId }
    status: { notEqualTo: "completed" }
  }) @live {
    nodes {
      id
      title
      progress
      requirements
    }
  }
}
```

## 📈 **性能优化技巧**

### 1. 数据过滤

```graphql
# ✅ 好的做法：精确过滤
subscription OptimizedInventory($playerId: String!) {
  items(
    filter: { 
      playerId: { equalTo: $playerId }
      equipped: { equalTo: true }  # 只要装备的物品
    }
    first: 20  # 限制数量
  ) @live {
    nodes {
      id
      type  # 只选择必要字段
    }
  }
}
```

### 2. 原生WebSocket批处理

```javascript
// 批量发送多个订阅
const subscriptions = [
  { table: 'store_player_positions', filter: { areaId: 'area1' } },
  { table: 'store_chat_messages', filter: { channelId: 'global' } },
  { table: 'store_battle_actions', filter: { battleId: 'battle123' } }
];

subscriptions.forEach(sub => {
  ws.send(JSON.stringify({
    action: 'subscribe',
    subscriptionType: 'native',
    ...sub
  }));
});
```

## 🐛 **调试和监控**

### 查看引擎状态

```javascript
// 检查统一引擎状态
fetch('http://localhost:4000/engine-status')
  .then(res => res.json())
  .then(status => {
    console.log('实时引擎状态:', status);
    // {
    //   clientCount: 15,
    //   subscriptions: { live: 8, native: 23 },
    //   capabilities: { liveQueries: true, nativeWebSocket: true }
    // }
  });
```

### 数据库触发器验证

```sql
-- 检查触发器是否正确创建
SELECT 
  t.tgname AS trigger_name,
  c.relname AS table_name,
  p.proname AS function_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname LIKE 'store_%'
ORDER BY c.relname;

-- 手动测试通知
SELECT pg_notify('table_change_store_test', '{"operation":"INSERT","table":"store_test","id":"test123","new_data":{"test":true}}');
```

## 🔧 **环境变量配置**

```bash
# .env
DATABASE_URL=postgres://user:pass@localhost:5432/gamedb
PORT=4000
REALTIME_PORT=4001
ENABLE_SUBSCRIPTIONS=true
ENABLE_CORS=true
NODE_ENV=development
```

## 🚀 **部署建议**

### 开发环境
- GraphQL + Live Queries: `http://localhost:4000/graphql`
- 原生WebSocket: `ws://localhost:4001`

### 生产环境
- 使用负载均衡器
- 配置WebSocket粘性会话
- 启用SSL: `wss://` 和 `https://`
- 监控连接数和内存使用

## 📚 **API参考**

### Live Queries指令
```graphql
# @live - 启用实时查询
# 支持所有PostGraphile查询功能：过滤、排序、分页等
subscription {
  tableName @live {
    nodes { ... }
    totalCount
  }
}
```

### 原生WebSocket消息格式
```javascript
// 订阅消息
{
  action: 'subscribe',
  subscriptionType: 'native',
  table: 'store_tablename',
  filter: { key: 'value' },
  queryId: 'unique_id'
}

// 数据更新消息
{
  type: 'update' | 'insert' | 'delete',
  table: 'store_tablename',
  id: 'record_id',
  data: { ... },
  timestamp: '2024-01-01T00:00:00Z'
}
```

## 🎉 **总结**

这个统一实时引擎为你的通用游戏引擎提供了：

1. **灵活性** - 根据需求选择最适合的技术
2. **性能** - 高频数据用WebSocket，复杂查询用Live Queries  
3. **易用性** - 自动表映射，无需额外配置
4. **可扩展性** - 支持任意数量的store表
5. **类型安全** - 完整的TypeScript支持

现在你可以轻松构建高性能的实时游戏应用了！🎮⚡ 