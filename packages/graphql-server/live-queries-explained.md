# PostGraphile Live Queries 工作机制详解

## 🌟 **核心概念**

PostGraphile Live Queries **确实是基于WebSocket的subscription**，但它们的工作方式与传统GraphQL subscriptions不同：

### 传统Subscription vs Live Queries

| 特性 | 传统Subscription | Live Queries |
|------|------------------|--------------|
| **连接方式** | WebSocket | WebSocket |
| **数据发送** | 增量变更(delta) | 完整查询结果 |
| **复杂度** | 需要手动定义变更事件 | 自动检测任何数据变更 |
| **查询能力** | 受限于预定义事件 | 支持任意复杂查询 |

## 🔧 **Live Queries的实现机制**

### 1. WebSocket连接建立
```javascript
// 客户端代码
const client = new ApolloClient({
  uri: 'http://localhost:4000/graphql',
  wsUri: 'ws://localhost:4000/graphql', // WebSocket连接
  subscriptions: {
    // 启用Live Queries支持
  }
});
```

### 2. 数据变更检测方式

PostGraphile支持多种检测机制：

#### 方式1: PostgreSQL LISTEN/NOTIFY
```sql
-- PostGraphile自动创建的触发器
CREATE OR REPLACE FUNCTION postgraphile_watch_notify()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'postgraphile_watch',
    json_build_object(
      'type', TG_OP,
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME
    )::text
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 为表创建触发器
CREATE TRIGGER _postgraphile_watch_trigger
  AFTER INSERT OR UPDATE OR DELETE ON store_encounter
  FOR EACH ROW EXECUTE FUNCTION postgraphile_watch_notify();
```

#### 方式2: Logical Replication (生产环境推荐)
```bash
# PostgreSQL配置
wal_level = logical
max_replication_slots = 10
max_wal_senders = 10
```

#### 方式3: Polling (简单但效率较低)
```javascript
// 定期检查数据变更
setInterval(() => {
  // 重新执行查询
}, 1000);
```

## 🚀 **Live Queries工作流程**

### Step 1: 客户端发送Live Query
```graphql
subscription {
  encounters @live {
    nodes {
      id
      playerId
      status
    }
  }
}
```

### Step 2: PostGraphile处理
1. **建立WebSocket连接**
2. **解析@live指令**
3. **执行初始查询**，返回当前数据
4. **设置数据变更监听器**

### Step 3: 数据变更检测
```sql
-- 当有数据变更时
INSERT INTO store_encounter (player_id, enemy_type, status) 
VALUES ('player123', 'dragon', 'active');

-- 触发器自动发送通知
-- pg_notify('postgraphile_watch', '{"type":"INSERT","schema":"public","table":"store_encounter"}')
```

### Step 4: 重新执行查询
PostGraphile检测到变更后：
1. **重新执行原始查询**
2. **计算新的完整结果**
3. **通过WebSocket发送给客户端**

## 💻 **在我们的架构中的配置**

查看我们的PostGraphile配置：

```typescript
// packages/graphql-server/src/plugins/postgraphile-config.ts
export function createPostGraphileConfig(options: PostGraphileConfigOptions) {
  return {
    // 启用订阅功能
    subscriptions: true,
    
    // 关键: 启用Live Queries
    live: true,
    
    // 使用专用连接用于监听变更
    ownerConnectionString: options.databaseUrl,
    
    // 启用简单订阅模式
    simpleSubscriptions: true,
    
    // PostgreSQL设置
    pgSettings: {
      statement_timeout: '30s',
      // 为live queries优化事务隔离级别
      'default_transaction_isolation': 'repeatable read',
    },
  };
}
```

## 🧪 **测试Live Queries**

### 1. 在GraphQL Playground中测试
```graphql
# 开启这个subscription
subscription TestLive {
  encounters @live {
    nodes {
      id
      playerId
      status
      createdAt
    }
    totalCount
  }
}
```

### 2. 在另一个tab中插入数据
```sql
INSERT INTO store_encounter (player_id, enemy_type, status) 
VALUES ('test_player', 'goblin', 'active');
```

### 3. 观察第一个tab的实时更新

## 🔍 **调试Live Queries**

### 启用详细日志
```typescript
// 在开发环境启用详细日志
const postgraphileConfig = {
  // ...其他配置
  
  // 启用查询日志
  disableQueryLog: false,
  
  // 启用WebSocket调试
  websocketMiddlewares: [
    (ws, req) => {
      console.log('WebSocket connected:', req.url);
    }
  ],
  
  // 调试Live Queries
  ...(process.env.NODE_ENV === 'development' && {
    allowExplain: true,
    showErrorStack: true,
  }),
};
```

### 检查WebSocket连接
```javascript
// 在浏览器控制台检查
window.WebSocket = class extends WebSocket {
  constructor(...args) {
    super(...args);
    console.log('WebSocket created:', this.url);
    this.addEventListener('message', (event) => {
      console.log('WebSocket message:', event.data);
    });
  }
};
```

## ⚡ **性能优化**

### 1. 使用过滤条件减少数据量
```graphql
subscription OptimizedLive($playerId: String!) {
  encounters(
    filter: { playerId: { equalTo: $playerId } }
    first: 10
  ) @live {
    nodes {
      id
      status
    }
  }
}
```

### 2. 配置合理的缓存策略
```typescript
// Apollo Client配置
const client = new ApolloClient({
  cache: new InMemoryCache({
    // 配置缓存策略
    typePolicies: {
      Encounter: {
        keyFields: ['id']
      }
    }
  })
});
```

## 📊 **总结**

**PostGraphile Live Queries是基于WebSocket的subscription机制**，但它提供了更强大的功能：

✅ **自动检测** - 无需手动定义变更事件
✅ **完整结果** - 发送完整查询结果，不是增量
✅ **复杂查询** - 支持过滤、排序、分页等
✅ **实时同步** - 数据变更时自动更新客户端

这正是我们需要的通用表单订阅系统！🎉 