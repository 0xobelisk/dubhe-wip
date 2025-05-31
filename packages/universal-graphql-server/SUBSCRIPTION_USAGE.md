# GraphQL WebSocket Subscription 使用指南

本文档介绍如何使用 Universal GraphQL Server 的 WebSocket Subscription 功能。

## 功能概述

GraphQL Server 现在支持通过 WebSocket 进行实时数据订阅，使用 PostgreSQL 的 LISTEN/NOTIFY 机制实现。

### 主要特性

1. **动态表订阅** - 自动为所有 `store_*` 表生成订阅
2. **通用表订阅** - 订阅任意表的变更
3. **系统事件订阅** - 订阅系统级事件
4. **自动触发器** - 数据变更时自动发送通知

## 订阅类型

### 1. 特定 Store 表订阅

为每个 `store_*` 表自动生成订阅字段：

```graphql
subscription {
  # 订阅特定表的所有变更
  yourTableNameChanged {
    event      # "create" | "update" | "delete"
    table      # 表名
    timestamp  # 时间戳
    data       # 变更的数据
    id         # 记录ID（如果有）
  }
  
  # 订阅特定记录的变更（通过键值筛选）
  yourTableNameChanged(keys: {fieldName: "value"}) {
    event
    table
    data
  }
}
```

### 2. 所有 Store 表订阅

订阅所有 store 表的变更：

```graphql
subscription {
  allStoresChanged {
    event
    table
    timestamp
    data
    id
  }
}
```

### 3. 任意表订阅

订阅任意表的变更：

```graphql
subscription {
  tableChanged(tableName: "your_table") {
    event
    table
    schema
    timestamp
    data
    id
  }
}
```

### 4. 系统事件订阅

订阅系统级事件：

```graphql
subscription {
  systemEvent(eventType: "schema_change") {
    event
    subject
    timestamp
    data
  }
}
```

## 使用示例

### 1. 在 GraphiQL 中测试

1. 访问 `http://localhost:4000/graphiql`
2. 在一个标签页中运行订阅：

```graphql
subscription WatchUserChanges {
  userChanged {
    event
    data
    timestamp
  }
}
```

3. 在另一个标签页中执行变更：

```graphql
mutation CreateUser {
  createUser(input: {
    user: {
      name: "张三"
      email: "zhangsan@example.com"
    }
  }) {
    user {
      id
      name
    }
  }
}
```

4. 返回订阅标签页查看实时更新

### 2. 在 Node.js 中使用

```javascript
const { createClient } = require('graphql-ws');
const WebSocket = require('ws');

const client = createClient({
  url: 'ws://localhost:4000/graphql',
  webSocketImpl: WebSocket,
});

// 订阅
const unsubscribe = client.subscribe(
  {
    query: `
      subscription {
        allStoresChanged {
          event
          table
          data
        }
      }
    `,
  },
  {
    next: (data) => console.log('收到数据:', data),
    error: (err) => console.error('错误:', err),
    complete: () => console.log('订阅完成'),
  }
);

// 稍后取消订阅
// unsubscribe();
```

### 3. 在 React 中使用（使用 Apollo Client）

```javascript
import { useSubscription, gql } from '@apollo/client';

const STORE_CHANGES_SUBSCRIPTION = gql`
  subscription OnStoreChange($tableName: String!) {
    tableChanged(tableName: $tableName) {
      event
      data
      timestamp
    }
  }
`;

function StoreWatcher({ tableName }) {
  const { data, loading, error } = useSubscription(
    STORE_CHANGES_SUBSCRIPTION,
    { variables: { tableName } }
  );

  if (loading) return <p>连接中...</p>;
  if (error) return <p>错误: {error.message}</p>;

  return (
    <div>
      <h3>最新更新</h3>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
```

## 手动触发通知

### 在 PostgreSQL 中手动发送通知

```sql
-- 发送到特定 store 表频道
SELECT pg_notify('store:user', json_build_object(
  'event', 'manual',
  'table', 'store_user',
  'data', json_build_object('message', '手动触发的通知')
)::text);

-- 发送到所有 store 表频道
SELECT pg_notify('store:all', json_build_object(
  'event', 'broadcast',
  'data', json_build_object('message', '广播消息')
)::text);
```

## 配置选项

### 环境变量

```bash
# 启用/禁用订阅功能
ENABLE_SUBSCRIPTIONS=true

# 数据库连接（确保不使用连接池）
DATABASE_URL=postgres://user:password@localhost:5432/dbname
```

### 注意事项

1. **连接池** - WebSocket 订阅不兼容连接池，确保使用直接连接
2. **权限** - 可以通过中间件添加认证和授权
3. **性能** - 大量订阅可能影响性能，建议合理使用
4. **断线重连** - 客户端应实现断线重连机制

## 故障排除

### 订阅没有收到数据

1. 检查 `ENABLE_SUBSCRIPTIONS` 是否为 `true`
2. 确认触发器已正确创建（查看 sui-rust-indexer 日志）
3. 检查 PostgreSQL 是否支持 LISTEN/NOTIFY
4. 确认使用的是非池化连接

### WebSocket 连接失败

1. 检查服务器是否正确启动
2. 确认 WebSocket 端点 URL 正确
3. 检查防火墙设置
4. 查看浏览器控制台错误信息

## 扩展和自定义

### 添加自定义订阅

在 `subscriptions.ts` 中添加新的订阅类型：

```typescript
export const CustomSubscriptionPlugin = makeExtendSchemaPlugin(({ pgSql: sql }) => ({
  typeDefs: gql`
    type CustomPayload {
      customField: String
    }
    
    extend type Subscription {
      customSubscription: CustomPayload @pgSubscription(topic: "custom:topic")
    }
  `,
  resolvers: {
    CustomPayload: {
      customField: (payload) => payload.customField,
    },
  },
}));
```

### 添加认证

在 `websocketMiddlewares` 中添加认证中间件：

```javascript
websocketMiddlewares: [
  (req, res, next) => {
    // 验证 JWT token
    const token = req.headers.authorization?.split(' ')[1];
    if (validateToken(token)) {
      req.user = decodeToken(token);
      next();
    } else {
      res.statusCode = 401;
      res.end('Unauthorized');
    }
  }
]
``` 