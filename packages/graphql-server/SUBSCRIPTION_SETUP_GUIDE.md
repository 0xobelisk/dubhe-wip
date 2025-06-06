# 📡 Dubhe 订阅系统配置指南

本项目基于sui-rust-indexer提供的强大通知机制，实现了**三种不同的实时订阅方案**，您可以根据需求选择最适合的方案。

## 🎯 订阅方案对比

| 特性 | Live Queries | PostgreSQL 订阅 | 原生 WebSocket |
|------|-------------|----------------|---------------|
| **用户体验** | ⭐⭐⭐⭐⭐ 最佳 | ⭐⭐⭐⭐ 优秀 | ⭐⭐⭐ 良好 |
| **性能** | ⭐⭐⭐⭐⭐ 增量更新 | ⭐⭐⭐⭐ 事件驱动 | ⭐⭐⭐ 完整数据 |
| **兼容性** | ⭐⭐⭐ 需要特殊配置 | ⭐⭐⭐⭐⭐ 广泛兼容 | ⭐⭐⭐⭐ 原生支持 |
| **配置复杂度** | ⭐⭐ 需要数据库配置 | ⭐⭐⭐⭐⭐ 开箱即用 | ⭐⭐⭐ 中等 |

## 🚀 快速开始

### 基础配置（必需）

```bash
# 基础数据库配置
DATABASE_URL=postgres://username:password@localhost:5432/database
PORT=4000
GRAPHQL_ENDPOINT=/graphql
ENABLE_SUBSCRIPTIONS=true
```

### 方案一：Live Queries（推荐，最佳体验）

```bash
# 环境变量
ENABLE_SUBSCRIPTIONS=true
ENABLE_LIVE_QUERIES=true
```

**PostgreSQL配置**：
```sql
-- 修改postgresql.conf
wal_level = logical
max_replication_slots = 10
max_wal_senders = 10

-- 重启PostgreSQL服务
sudo systemctl restart postgresql
```

**使用示例**：
```graphql
subscription {
  encounters @live {
    nodes {
      player
      monster
      exists
      catchAttempts
    }
    totalCount
  }
}
```

### 方案二：PostgreSQL订阅（兼容性最佳）

```bash
# 环境变量
ENABLE_SUBSCRIPTIONS=true
ENABLE_PG_SUBSCRIPTIONS=true
```

**使用示例**：
```graphql
subscription {
  listen(topic: "store_encounter") {
    relatedNodeId
    relatedNode {
      nodeId
    }
  }
}
```

### 方案三：原生WebSocket（灵活性最高）

```bash
# 环境变量
ENABLE_SUBSCRIPTIONS=true
ENABLE_NATIVE_WEBSOCKET=true
REALTIME_PORT=4001
```

**使用示例**：
```javascript
const ws = new WebSocket('ws://localhost:4001');
ws.send(JSON.stringify({
  action: 'subscribe',
  table: 'encounter'
}));
```

## 📊 运行时状态检查

```bash
# 服务器健康状态
curl http://localhost:4000/health

# 客户端配置信息
curl http://localhost:4000/subscription-config

# 完整配置文档
curl http://localhost:4000/subscription-docs
```

## 💡 推荐配置

### 开发环境
```bash
ENABLE_SUBSCRIPTIONS=true
ENABLE_PG_SUBSCRIPTIONS=true
DEBUG_NOTIFICATIONS=true
```

### 生产环境
```bash
ENABLE_SUBSCRIPTIONS=true
ENABLE_LIVE_QUERIES=true
ENABLE_SUBSCRIPTION_METRICS=true
MAX_SUBSCRIPTION_CONNECTIONS=5000
``` 