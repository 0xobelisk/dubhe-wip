# 🚀 Universal GraphQL Server

一个智能的 GraphQL 服务器适配器，能够自动连接到 `sui-rust-indexer` 创建的数据库，并动态生成完整的 GraphQL API。

## ✨ 核心特性

### 🎯 智能数据库适配
- **动态扫描**: 自动扫描 `sui-rust-indexer` 创建的所有表结构
- **PostGraphile 驱动**: 基于强大的 PostGraphile 自动生成 GraphQL API
- **零配置**: 无需手动定义 schema，基于现有数据库自动推断

### 📡 实时功能
- **WebSocket 支持**: 完整的 GraphQL 订阅功能
- **实时查询**: PostGraphile Live Queries 支持
- **数据监听**: 可选的数据库变更监听

### 🛠️ 开发体验
- **GraphiQL**: 内置的 GraphQL 查询界面
- **自动文档**: 基于数据库结构自动生成的 API 文档
- **类型安全**: 完整的 TypeScript 支持
- **美观界面**: 现代化的欢迎页面和信息展示

## 📦 安装

```bash
# 进入项目目录
cd packages/universal-graphql-server

# 安装依赖
pnpm install

# 或使用 npm
npm install
```

## 🔧 配置

### 环境变量

创建 `.env` 文件：

```env
# 数据库配置（连接到 sui-rust-indexer 的数据库）
DATABASE_URL=postgres://username:password@localhost:5432/sui_indexer_db

# 服务器配置
PORT=4000
NODE_ENV=development

# GraphQL 配置
GRAPHQL_ENDPOINT=/graphql
PG_SCHEMA=public

# 功能开关
ENABLE_CORS=true
ENABLE_SUBSCRIPTIONS=true
```

### 前置条件

确保 `sui-rust-indexer` 已经运行并创建了数据库表：

1. **系统表**: `__dubheStoreTransactions`, `__dubheStoreSchemas`, `__dubheStoreEvents`
2. **元数据表**: `table_fields` （存储动态表结构信息）
3. **动态表**: `store_*` 表（根据配置文件动态创建）

## 🚀 运行

### 开发模式

```bash
# 启动开发服务器（支持热重载）
pnpm dev

# 或使用 npm
npm run dev
```

### 生产模式

```bash
# 构建项目
pnpm build

# 启动生产服务器
pnpm start
```

## 📊 访问端点

启动服务器后，你可以访问：

- **欢迎页面**: `http://localhost:4000` - 查看扫描到的表和系统信息
- **GraphQL API**: `http://localhost:4000/graphql` - API 端点
- **GraphiQL**: `http://localhost:4000/graphiql` - 交互式查询界面
- **WebSocket**: `ws://localhost:4000/graphql` - 订阅功能

## 🎮 使用示例

### 查询系统表

```graphql
# 查询 Schemas 表
query GetSchemas {
  allDubheStoreSchemas(first: 10) {
    nodes {
      id
      name
      key1
      key2
      value
      lastUpdateCheckpoint
      isRemoved
      createdAt
    }
  }
}

# 查询 Transactions 表
query GetTransactions {
  allDubheStoreTransactions(first: 10) {
    nodes {
      id
      sender
      checkpoint
      digest
      package
      module
      function
      arguments
      createdAt
    }
  }
}

# 查询 Events 表
query GetEvents {
  allDubheStoreEvents(first: 10) {
    nodes {
      id
      sender
      name
      value
      checkpoint
      digest
      createdAt
    }
  }
}
```

### 查询动态表

如果 `sui-rust-indexer` 创建了动态表（例如从 `config.json` 配置），你可以查询它们：

```graphql
# 查询 store_accounts 表（如果存在）
query GetAccounts {
  allStoreAccounts {
    nodes {
      assetId
      account
      balance
    }
  }
}

# 查询 store_position 表（如果存在）
query GetPositions {
  allStorePositions {
    nodes {
      player
      x
      y
    }
  }
}
```

### 实时订阅

```graphql
# 订阅 Schemas 变更
subscription OnSchemaChanges {
  allDubheStoreSchemas(first: 1, orderBy: [CREATED_AT_DESC]) {
    nodes {
      id
      name
      value
      createdAt
    }
  }
}

# 订阅 Events
subscription OnNewEvents {
  allDubheStoreEvents(first: 1, orderBy: [CREATED_AT_DESC]) {
    nodes {
      id
      name
      value
      checkpoint
    }
  }
}
```

### 高级查询

```graphql
# 分页查询
query GetSchemasPaginated($after: Cursor) {
  allDubheStoreSchemas(first: 10, after: $after) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      name
      value
    }
  }
}

# 条件过滤
query GetSchemasByName($name: String!) {
  allDubheStoreSchemas(condition: { name: $name }) {
    nodes {
      id
      name
      key1
      key2
      value
    }
  }
}

# 排序查询
query GetRecentTransactions {
  allDubheStoreTransactions(
    first: 20, 
    orderBy: [CREATED_AT_DESC]
  ) {
    nodes {
      id
      sender
      function
      checkpoint
      createdAt
    }
  }
}
```

## 🏗️ 架构说明

### 工作原理

```
sui-rust-indexer 数据库
         ↓
  [数据库内省器]
         ↓
   [PostGraphile]
         ↓
  [GraphQL API]
         ↓
   [WebSocket]
```

1. **数据库扫描**: 启动时自动扫描数据库中的所有表
2. **结构解析**: 从 `table_fields` 元数据表读取动态表结构
3. **Schema 生成**: PostGraphile 基于表结构自动生成 GraphQL schema
4. **API 服务**: 提供完整的 GraphQL CRUD 操作和订阅功能

### 支持的表类型

1. **系统表**: 
   - `__dubheStoreTransactions` - 交易记录
   - `__dubheStoreSchemas` - Schema 数据
   - `__dubheStoreEvents` - 事件记录
   - `table_fields` - 表结构元数据

2. **动态表**: 
   - `store_*` - 根据 `sui-rust-indexer` 配置动态创建的表

## 🚀 部署

### Docker 部署

```bash
# 使用提供的 docker-compose
docker-compose up -d
```

### 手动部署

```bash
# 构建项目
pnpm build

# 设置环境变量
export DATABASE_URL="postgres://..."
export PORT=4000

# 启动服务器
pnpm start
```

## 🔧 配置选项

### PostGraphile 特性

- ✅ **自动 CRUD**: 所有表自动支持增删改查
- ✅ **关系查询**: 自动处理表之间的关系
- ✅ **分页**: Relay 风格的连接分页
- ✅ **订阅**: GraphQL 订阅和 Live Queries
- ✅ **过滤排序**: 强大的查询条件和排序
- ✅ **权限控制**: 基于 PostgreSQL 的行级安全

### 自定义配置

在 `src/index.ts` 中可以修改 PostGraphile 配置：

```typescript
const createPostGraphileConfig = (availableTables: string[]) => {
  return {
    // 添加插件
    appendPlugins: [
      require('@graphile-contrib/pg-simplify-inflector'),
      require('postgraphile-plugin-connection-filter')
    ],
    
    // 自定义命名
    inflection: {
      // 自定义表名映射
    },
    
    // 添加自定义字段
    makeAddInflectorsPlugin: (inflectors) => {
      // 自定义逻辑
    }
  };
};
```

## 🛡️ 安全配置

### 数据库权限

```sql
-- 创建只读用户
CREATE USER graphql_readonly WITH PASSWORD 'secure_password';

-- 授予查询权限
GRANT CONNECT ON DATABASE sui_indexer TO graphql_readonly;
GRANT USAGE ON SCHEMA public TO graphql_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO graphql_readonly;

-- 如需写入权限
GRANT INSERT, UPDATE, DELETE ON specific_tables TO graphql_readonly;
```

### 生产环境配置

```env
NODE_ENV=production
ENABLE_CORS=false
# 或设置特定来源
CORS_ORIGIN=https://yourdomain.com
```

## 📋 故障排除

### 常见问题

1. **数据库连接失败**
   ```
   解决方案：检查 DATABASE_URL 和数据库服务状态
   ```

2. **表扫描为空**
   ```
   解决方案：确保 sui-rust-indexer 已运行并创建了表
   ```

3. **schema 生成失败**
   ```
   解决方案：检查 table_fields 表是否存在且有数据
   ```

4. **WebSocket 连接失败**
   ```
   解决方案：检查防火墙设置和 ENABLE_SUBSCRIPTIONS 配置
   ```

### 调试模式

```bash
# 启用详细日志
DEBUG=postgraphile:* pnpm dev

# 查看生成的 schema
ls -la *.graphql
```

## 🤝 集成指南

### 与 sui-rust-indexer 集成

1. **启动顺序**: 先启动 `sui-rust-indexer`，再启动 GraphQL 服务器
2. **数据库共享**: 两个服务共享同一个 PostgreSQL 数据库
3. **配置同步**: 确保数据库连接配置一致

### 与前端集成

```typescript
// Apollo Client 配置
import { ApolloClient, InMemoryCache, split, HttpLink } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';

const httpLink = new HttpLink({
  uri: 'http://localhost:4000/graphql',
});

const wsLink = new GraphQLWsLink(createClient({
  url: 'ws://localhost:4000/graphql',
}));

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink,
);

const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
```

## �� 许可证

MIT License

## WebSocket Subscription 支持

本服务器现已支持通过 WebSocket 进行实时数据订阅，使用 PostgreSQL 的 LISTEN/NOTIFY 机制。

### 环境变量配置

创建 `.env` 文件并配置以下变量：

```bash
# 数据库连接 URL
# 注意：对于 WebSocket 订阅，请使用直接连接而不是连接池
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres

# 服务器端口
PORT=4000

# 环境模式
NODE_ENV=development

# GraphQL 端点路径
GRAPHQL_ENDPOINT=/graphql

# PostgreSQL Schema
PG_SCHEMA=public

# 启用 CORS
ENABLE_CORS=true

# 启用 WebSocket 订阅
# 设置为 true 以启用实时订阅功能
ENABLE_SUBSCRIPTIONS=true
```

### 订阅类型

1. **特定 Store 表订阅** - 自动为每个 `store_*` 表生成订阅
2. **所有 Store 表订阅** - 订阅所有 store 表的变更
3. **任意表订阅** - 订阅任意表的变更
4. **系统事件订阅** - 订阅系统级事件

### 测试订阅

```bash
# 安装依赖
npm install

# 启动服务器
npm run dev

# 在另一个终端测试订阅
npm run test:subscription
```

### 使用示例

在 GraphiQL 中运行：

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

详细使用指南请参考 [SUBSCRIPTION_USAGE.md](./SUBSCRIPTION_USAGE.md)。

### 注意事项

1. WebSocket 订阅不兼容 Neon 连接池，请使用直接数据库连接
2. 确保 PostgreSQL 支持 LISTEN/NOTIFY
3. sui-rust-indexer 会自动创建必要的触发器
4. 大量订阅可能影响性能，请合理使用

## 📄 许可证

MIT License

---

💡 **提示**: 这个服务器设计为 `sui-rust-indexer` 的完美伴侣，提供强大的 GraphQL 接口来访问索引的数据。无需手动配置 schema，一切都是自动的！ 