# 🚀 Universal GraphQL Server

一个智能的 GraphQL 服务器适配器，能够自动连接到 `sui-rust-indexer` 创建的数据库，并动态生成完整的 GraphQL API。

## ✨ 核心特性

### 🎯 智能数据库适配
- **动态扫描**: 自动扫描 `sui-rust-indexer` 创建的所有表结构
- **PostGraphile 驱动**: 基于强大的 PostGraphile 自动生成 GraphQL API
- **零配置**: 无需手动定义 schema，基于现有数据库自动推断

### 🔍 高级过滤功能
- **丰富的操作符**: 支持等于、大于、小于、包含、模糊匹配等20+种过滤操作符
- **逻辑组合**: 支持AND、OR、NOT逻辑操作符进行复杂条件组合
- **全字段过滤**: 自动为所有字段生成相应的过滤器
- **类型智能**: 根据字段类型自动提供合适的过滤操作符
- **关系过滤**: 支持基于关联表字段进行过滤

### 📈 增强的排序和分页
- **全字段排序**: 支持对任意字段进行升序/降序排序
- **多字段排序**: 支持同时按多个字段排序
- **高效分页**: Relay风格的cursor分页和offset分页
- **性能优化**: 智能查询优化和索引建议

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

### 高级过滤查询

现在支持强大的过滤功能，包括多种操作符和逻辑组合：

```graphql
# 基础过滤 - 使用大于操作符
query GetHighValueAccounts {
  storeAccounts(filter: {
    balance: { gt: "1000" }
  }) {
    nodes {
      assetId
      account
      balance
    }
  }
}

# 多条件过滤 - 隐式AND组合
query GetSpecificAccounts {
  storeAccounts(filter: {
    balance: { gte: "100", lte: "10000" },
    assetId: { startsWith: "0x2" }
  }) {
    nodes {
      assetId
      account
      balance
    }
  }
}

# 逻辑操作符 - OR组合
query GetAccountsWithConditions {
  storeAccounts(filter: {
    or: [
      { balance: { gt: "50000" } },
      { assetId: { in: ["0x123", "0x456", "0x789"] } }
    ]
  }) {
    nodes {
      assetId
      account
      balance
    }
  }
}

# 复杂逻辑组合 - AND, OR, NOT
query GetComplexFilteredAccounts {
  storeAccounts(filter: {
    and: [
      {
        or: [
          { balance: { gt: "1000" } },
          { assetId: { like: "%special%" } }
        ]
      },
      {
        not: {
          account: { includesInsensitive: "test" }
        }
      }
    ]
  }) {
    nodes {
      assetId
      account
      balance
    }
  }
}

# 字符串模糊搜索
query SearchPlayers {
  storeEncounters(filter: {
    player: { includesInsensitive: "alice" },
    monster: { isNull: false }
  }) {
    nodes {
      player
      monster
      catchAttempts
    }
  }
}

# 数组和范围查询
query GetPositionsInRange {
  storePositions(filter: {
    player: { in: ["player1", "player2", "player3"] },
    x: { gte: "10", lte: "100" },
    y: { isNull: false }
  }) {
    nodes {
      player
      x
      y
    }
  }
}
```

### 增强的排序功能

支持所有字段的多种排序组合：

```graphql
# 单字段排序
query GetAccountsByBalance {
  storeAccounts(
    orderBy: [BALANCE_DESC]
  ) {
    nodes {
      assetId
      account
      balance
    }
  }
}

# 多字段排序
query GetAccountsMultiSort {
  storeAccounts(
    orderBy: [ASSET_ID_ASC, BALANCE_DESC]
  ) {
    nodes {
      assetId
      account
      balance
    }
  }
}

# 过滤 + 排序 + 分页
query GetFilteredSortedPaginated($after: Cursor) {
  storeAccounts(
    filter: {
      balance: { gt: "1000" }
    },
    orderBy: [BALANCE_DESC, ASSET_ID_ASC],
    first: 10,
    after: $after
  ) {
    edges {
      node {
        assetId
        account
        balance
      }
      cursor
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    totalCount
  }
}
```

> 📖 **详细过滤功能文档**: 查看 [高级过滤和查询功能使用指南](./ADVANCED_FILTERING_GUIDE.md) 了解所有支持的操作符、使用示例和最佳实践。

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

## 📄 许可证

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

# 🔧 主要特性

- 🚀 **自动扫描数据库表结构**：无需手动配置，自动适配 sui-rust-indexer 的动态表
- 📊 **完整的 GraphQL API**：为所有表自动生成 CRUD 操作
- 📡 **实时订阅支持**：WebSocket 订阅数据变更
- 🎮 **增强版 GraphQL Playground**：现代化的查询界面，支持 Schema Explorer 和代码导出
- 🔍 **智能过滤和分页**：支持复杂查询条件
- 🎯 **开发友好**：提供详细的欢迎页面和使用指南
- 📝 **结构化日志系统**：使用 Winston 提供专业的日志记录和监控

## 📋 环境要求

- Node.js 18.0.0+
- PostgreSQL 数据库（由 sui-rust-indexer 管理）
- TypeScript 5.0+

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制并编辑环境变量文件：

```bash
cp .env.example .env
```

主要配置项：

```bash
# 数据库连接
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres

# 服务器配置
PORT=4000
GRAPHQL_ENDPOINT=/graphql
PG_SCHEMA=public

# 功能开关
ENABLE_CORS=true
ENABLE_SUBSCRIPTIONS=true
REALTIME_PORT=4001

# 日志配置
LOG_LEVEL=info  # error, warn, info, debug, verbose
```

### 3. 启动服务器

```bash
# 开发模式（支持热重载）
npm run dev

# 生产模式
npm run build
npm start
```

### 4. 访问服务

- 🏠 **主页**：http://localhost:4000 - 服务器信息和使用指南
- 🎮 **GraphQL Playground**：http://localhost:4000/playground - 现代化查询界面
- 📊 **GraphQL API**：http://localhost:4000/graphql - API 端点
- 📡 **WebSocket 订阅**：ws://localhost:4000/graphql - 实时订阅

## 📊 日志系统

本项目使用专业的 Winston 日志系统，提供结构化的日志记录：

### 主要特性

- 🎨 **彩色输出**：不同级别使用不同颜色
- 📁 **文件记录**：自动保存到 `logs/` 目录
- 🏷️ **组件标识**：明确标识日志来源
- 📊 **结构化数据**：支持附加元数据
- ⚡ **性能监控**：内置性能指标记录
- 🔒 **敏感信息保护**：自动隐藏密码等敏感信息

### 日志级别

```bash
export LOG_LEVEL=debug  # 显示所有级别的日志
export LOG_LEVEL=info   # 默认级别，生产环境推荐
export LOG_LEVEL=warn   # 只显示警告和错误
```

### 日志文件

- `logs/combined.log`：所有日志（JSON格式）
- `logs/error.log`：错误日志
- `logs/exceptions.log`：未捕获异常
- `logs/rejections.log`：Promise拒绝

详细使用说明请参考：[LOGGING.md](./LOGGING.md)

## 🎮 使用 GraphQL Playground

访问 http://localhost:4000/playground 体验增强版 GraphQL Playground：

### 主要功能

- 📊 **Schema Explorer**：可视化浏览 GraphQL Schema
- 🔍 **智能补全**：自动补全查询语句
- 📝 **查询历史**：保存和管理查询历史
- 📋 **代码导出**：支持多种语言的代码生成
- 🎨 **现代化界面**：美观的用户界面

### 示例查询

```graphql
# 查询所有动态表
{
  __schema {
    queryType {
      fields {
        name
        description
      }
    }
  }
}

# 如果有 store_accounts 表
{
  allStoreAccounts(first: 10) {
    edges {
      node {
        id
        # 其他字段根据表结构动态生成
      }
    }
  }
}
```

### 实时订阅

如果启用了订阅功能，可以使用实时订阅：

```graphql
subscription {
  allStoresChanged {
    event
    table
    data
    timestamp
  }
}
```

## 🔧 配置选项

### 数据库配置

```bash
DATABASE_URL=postgres://username:password@host:port/database
PG_SCHEMA=public  # 要扫描的数据库模式
```

### 服务器配置

```bash
PORT=4000                    # HTTP 服务器端口
GRAPHQL_ENDPOINT=/graphql    # GraphQL API 路径
ENABLE_CORS=true            # 是否启用 CORS
```

### 订阅配置

```bash
ENABLE_SUBSCRIPTIONS=true    # 是否启用订阅功能
REALTIME_PORT=4001          # WebSocket 服务器端口
```

### 日志配置

```bash
LOG_LEVEL=info              # 日志级别
LOG_TO_FILE=true           # 是否保存到文件
LOG_DIR=./logs             # 日志文件目录

# PostGraphile SQL查询日志控制
DISABLE_QUERY_LOG=false     # 设置为true禁用SQL查询日志
ENABLE_QUERY_LOG=false      # 生产环境中设置为true启用查询日志
QUERY_TIMEOUT=30000         # GraphQL查询超时时间（毫秒）
```

# Dubhe GraphQL Server

A powerful GraphQL server for blockchain indexing with real-time subscription support.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start server with default settings
pnpm start

# Or use CLI with custom options
npx dubhe-graphql-server start --help
```

## 📋 CLI Configuration

All configuration can be managed through CLI arguments or environment variables:

### Basic Server Configuration

```bash
npx dubhe-graphql-server start \
  --port 4000 \
  --database-url "postgres://user:pass@localhost:5432/db" \
  --schema "public" \
  --endpoint "/graphql" \
  --cors \
  --subscriptions \
  --env "development"
```

### Debug Configuration

```bash
# Enable debug mode (verbose logging + query logs + notifications)
npx dubhe-graphql-server start \
  --debug

# Production mode (no debug logs or query logs by default)
npx dubhe-graphql-server start \
  --env production

# Enable performance metrics separately
npx dubhe-graphql-server start \
  --enable-metrics
```

### Performance Configuration

```bash
# Tune performance settings
npx dubhe-graphql-server start \
  --query-timeout 30000 \
  --max-connections 1000 \
  --heartbeat-interval 30000
```

### Subscription Capabilities

```bash
# Configure subscription features
npx dubhe-graphql-server start \
  --enable-live-queries \
  --enable-pg-subscriptions \
  --enable-native-websocket \
  --realtime-port 4001
```

### Debug Configuration

```bash
# Enable debugging features
npx dubhe-graphql-server start \
  --debug-notifications \
  --enable-metrics
```

## 🔧 All CLI Options

| Option | Environment Variable | Default | Description |
|--------|---------------------|---------|-------------|
| `--port, -p` | `PORT` | `4000` | Server port |
| `--database-url, -d` | `DATABASE_URL` | `postgres://postgres:postgres@127.0.0.1:5432/postgres` | Database connection URL |
| `--schema, -s` | `PG_SCHEMA` | `public` | PostgreSQL schema name |
| `--endpoint, -e` | `GRAPHQL_ENDPOINT` | `/graphql` | GraphQL endpoint path |
| `--cors` | `ENABLE_CORS` | `true` | Enable CORS |
| `--subscriptions` | `ENABLE_SUBSCRIPTIONS` | `true` | Enable GraphQL subscriptions |
| `--env` | `NODE_ENV` | `development` | Environment mode |
| `--debug` | `DEBUG` | `false` | Enable debug mode (verbose logging + query logs + notifications) |
| `--query-timeout` | `QUERY_TIMEOUT` | `30000` | GraphQL query timeout (ms) |
| `--max-connections` | `MAX_CONNECTIONS` | `1000` | Maximum database connections |
| `--heartbeat-interval` | `HEARTBEAT_INTERVAL` | `30000` | WebSocket heartbeat interval (ms) |
| `--enable-metrics` | `ENABLE_METRICS` | `false` | Enable performance metrics |
| `--enable-live-queries` | `ENABLE_LIVE_QUERIES` | `true` | Enable GraphQL live queries |
| `--enable-pg-subscriptions` | `ENABLE_PG_SUBSCRIPTIONS` | `true` | Enable PostgreSQL subscriptions |
| `--enable-native-websocket` | `ENABLE_NATIVE_WEBSOCKET` | `true` | Enable native WebSocket support |
| `--realtime-port` | `REALTIME_PORT` | `undefined` | Realtime WebSocket port |

## 📚 Examples

### Development Setup
```bash
npx dubhe-graphql-server start \
  --env development \
  --debug \
  --enable-metrics
```

### Production Setup
```bash
npx dubhe-graphql-server start \
  --env production \
  --max-connections 500
```

### Custom Subscription Setup
```bash
npx dubhe-graphql-server start \
  --enable-pg-subscriptions \
  --no-enable-live-queries \
  --realtime-port 4001
```

## 🌟 Features

- ✅ **Unified Configuration**: All settings managed through CLI
- ✅ **Environment Variable Support**: Backward compatible with .env files
- ✅ **Real-time Subscriptions**: PostgreSQL LISTEN/NOTIFY support
- ✅ **Flexible Debug Mode**: `--debug` for logging, `--enable-metrics` for performance monitoring
- ✅ **Performance Tuning**: Connection pools and timeout controls
- ✅ **Development Tools**: Built-in playground and debugging features