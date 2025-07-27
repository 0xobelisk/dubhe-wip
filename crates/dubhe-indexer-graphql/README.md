# Dubhe Indexer GraphQL

一个基于 Rust 的 GraphQL 服务器，为 Dubhe Indexer 提供 GraphQL API 支持。

## 功能特性

- 🚀 基于 `async-graphql` 和 `warp` 的高性能 GraphQL 服务器
- 📊 数据库查询和实时订阅支持
- 🎮 内置 GraphQL Playground 界面
- 🔌 可扩展的插件系统
- 🏥 健康检查端点
- 📝 完整的日志记录

## 快速开始

### 作为独立服务器运行

```bash
# 设置环境变量
export GRAPHQL_PORT=4000
export DATABASE_URL="sqlite://data.db"
export GRAPHQL_ENDPOINT="/graphql"

# 运行服务器
cargo run --bin dubhe-indexer-graphql
```

### 作为 dubhe-indexer 的一部分运行

```bash
# 在 dubhe-indexer 中启动（会自动启动 GraphQL 服务器）
cargo run --bin dubhe-indexer
```

## 配置

GraphQL 服务器配置在 `config.example.toml` 中：

```toml
[graphql]
port = 4000
cors = true
subscriptions = true
debug = false
query_timeout = 30000
max_connections = 1000
heartbeat_interval = 30000
enable_metrics = true
enable_live_queries = true
enable_pg_subscriptions = true
enable_native_websocket = true
```

## API 端点

- **GraphQL API**: `http://localhost:4000/graphql`
- **GraphQL Playground**: `http://localhost:4000/playground`
- **GraphiQL**: `http://localhost:4000/graphiql`
- **健康检查**: `http://localhost:4000/health`
- **主页**: `http://localhost:4000/`

## 插件系统

GraphQL Playground 支持插件系统，可以轻松添加新功能。

### 使用内置插件

```rust
use dubhe_indexer_graphql::playground::{PlaygroundService, GraphiQLPlugin};

// 创建服务
let service = PlaygroundService::new(config);

// 获取不带插件的 Playground
let html = service.get_playground_html();

// 获取带 explorer 插件的 Playground
let html_with_explorer = service.get_playground_html_with_explorer();

// 获取带多个插件的 Playground
let html_with_plugins = service.get_playground_html_with_plugins(&[
    GraphiQLPlugin::explorer("4"),
    // 可以添加更多插件
]);
```

### 创建自定义插件

```rust
use dubhe_indexer_graphql::playground::GraphiQLPlugin;

let custom_plugin = GraphiQLPlugin {
    name: "MyCustomPlugin".to_string(),
    constructor: "MyCustomPlugin.create".to_string(),
    head_assets: Some("<link rel=\"stylesheet\" href=\"path/to/style.css\" />".to_string()),
    body_assets: Some("<script src=\"path/to/script.js\"></script>".to_string()),
    pre_configs: Some("// 插件配置代码".to_string()),
    props: Some("{}".to_string()),
};
```

## GraphQL 查询示例

### 获取服务器信息

```graphql
query {
  serverInfo {
    name
    version
    status
  }
}
```

### 获取数据库表列表

```graphql
query {
  tables {
    name
    schema
    columns {
      name
      dataType
      isNullable
    }
  }
}
```

### 查询表数据

```graphql
query {
  tableData(tableName: "events", limit: 10) {
    tableName
    totalCount
    data
  }
}
```

### 订阅实时更新

```graphql
subscription {
  tableChanges(tableName: "events") {
    id
    tableName
    operation
    timestamp
    data
  }
}
```

## 数据库支持

- **SQLite**: 完全支持，包括查询和订阅
- **PostgreSQL**: 基础支持，查询功能已实现

## 开发

### 运行测试

```bash
cargo test
```

### 代码检查

```bash
cargo check
cargo clippy
```

### 构建

```bash
cargo build --release
```

## 架构

```
dubhe-indexer-graphql/
├── src/
│   ├── lib.rs              # 库入口点
│   ├── main.rs             # 二进制入口点
│   ├── config.rs           # 配置管理
│   ├── server.rs           # HTTP 服务器
│   ├── schema.rs           # GraphQL Schema
│   ├── database.rs         # 数据库抽象
│   ├── subscriptions.rs    # 实时订阅
│   ├── health.rs           # 健康检查
│   └── playground.rs       # GraphQL Playground
├── templates/
│   └── playground.hbs      # Playground HTML 模板
└── Cargo.toml
```

## 依赖

- `async-graphql`: GraphQL 框架
- `async-graphql-warp`: Warp 集成
- `warp`: HTTP 服务器
- `dubhe-common`: 数据库抽象
- `handlebars`: 模板引擎
- `serde`: 序列化
- `tokio`: 异步运行时

## 许可证

MIT License 