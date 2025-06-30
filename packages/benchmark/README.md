# Dubhe GraphQL 智能压测工具

这是一个智能化的 GraphQL 性能压测工具，能够自动解析 Dubhe config 文件，基于表结构生成针对性的压测用例。

## ✨ 特性

- 🧠 **智能解析**: 自动解析 Dubhe config JSON，识别表结构和字段信息
- 🎯 **自动生成**: 根据表结构自动生成针对性的查询和订阅压测用例
- 🔄 **DubheGraphqlClient**: 使用标准的 DubheGraphqlClient 进行测试，确保与实际使用一致
- 📊 **全面覆盖**: 支持基础查询、过滤查询、批量查询和订阅压测
- 📈 **详细报告**: 自动生成 Markdown 和 JSON 格式的性能报告
- 🚀 **高性能**: 支持并发测试，可配置连接数和持续时间
- 🔧 **灵活配置**: 分离的配置文件，可复用现有的 Dubhe config

## 📁 配置文件

### 1. Dubhe Config (`dubhe.config_1.json`)

这是标准的 Dubhe 配置文件，包含组件、资源和枚举定义：

```json
{
  "components": [
    {
      "counter0": {
        "fields": [
          { "entity_id": "address" }
        ],
        "keys": ["entity_id"]
      }
    },
    {
      "counter1": {
        "fields": [
          { "entity_id": "address" },
          { "value": "u32" }
        ],
        "keys": ["entity_id"]
      }
    }
  ],
  "resources": [
    {
      "counter2": {
        "fields": [
          { "value": "u32" }
        ],
        "keys": []
      }
    }
  ],
  "enums": []
}
```

### 2. Benchmark Config (`dubhe-bench-config.json`)

压测工具的配置文件：

```json
{
  "endpoint": "http://localhost:4000/graphql",
  "subscriptionEndpoint": "ws://localhost:4000/graphql",
  "dubheConfigPath": "../graphql-client/dubhe.config_1.json",
  "headers": {
    "Content-Type": "application/json",
    "User-Agent": "dubhe-benchmark"
  },
  "scenarios": {
    "quick": {
      "name": "快速压测",
      "duration": 10,
      "connections": 5,
      "description": "基础性能测试"
    }
  },
  "queryTypes": {
    "basic": {
      "name": "基础查询",
      "tests": [
        {
          "type": "getAllTables",
          "params": { "first": 10 }
        }
      ]
    }
  },
  "subscriptionTypes": {
    "basic": {
      "name": "基础订阅",
      "duration": 30,
      "tests": [
        {
          "type": "subscribeToTableChanges",
          "params": {
            "initialEvent": true,
            "first": 5
          }
        }
      ]
    }
  }
}
```

## 🚀 使用方法

### 安装依赖

```bash
pnpm install
```

### 启动 GraphQL 服务

```bash
# 在另一个终端窗口中
cd packages/graphql-server
pnpm dev
```

### 运行压测

```bash
# 快速压测 (10秒, 5连接)
pnpm start:quick

# 标准压测 (30秒, 10连接)
pnpm start:standard

# 压力测试 (60秒, 20连接)
pnpm start:stress

# 订阅压测 (30秒)
pnpm start:subscription

# 运行所有压测
pnpm start:all

# 使用自定义配置文件
pnpm tsx src/index.ts quick my-config.json
```

### 命令选项

- `quick` - 快速压测，适合开发时的基础性能验证
- `standard` - 标准压测，包含基础查询和过滤查询
- `stress` - 压力测试，包含批量查询和高并发场景
- `subscription` - 订阅压测，测试实时数据推送性能
- `all` - 运行所有压测配置
- `help` - 显示帮助信息

## 🧠 智能化特性

### 自动表解析

工具会自动解析 Dubhe config 中的：
- **Components**: 组件表及其字段
- **Resources**: 资源表及其字段  
- **Keys**: 主键信息
- **Enums**: 枚举类型（未来支持）

### 智能测试生成

基于解析的表结构，自动生成：
- 针对每个表的基础查询测试
- 使用主键的条件查询测试
- 批量查询测试
- 表订阅测试
- 过滤订阅测试

### DubheGraphqlClient 集成

- 使用实际的 `DubheGraphqlClient` 进行测试
- 支持所有客户端方法：`getAllTables`, `getTableByCondition`, `batchQuery`, `subscribeToTableChanges` 等
- 确保压测结果与实际应用性能一致

## 📊 测试类型

### 查询测试

1. **getAllTables**: 获取表的所有记录
2. **getTableByCondition**: 根据条件查询记录
3. **batchQuery**: 批量查询多个表

### 订阅测试

1. **subscribeToTableChanges**: 监听表变化（支持过滤）

## 📈 报告输出

运行完成后会生成两种格式的报告：

### Markdown 报告 (`dubhe-benchmark-report-{timestamp}.md`)

包含：
- 查询压测结果表格
- 订阅压测结果表格
- 性能汇总统计

### JSON 报告 (`dubhe-benchmark-results-{timestamp}.json`)

包含：
- 详细的原始测试数据
- 所有错误信息
- 可用于进一步分析的结构化数据

## 🔧 高级配置

### 自定义 Dubhe Config 路径

在 benchmark 配置文件中修改 `dubheConfigPath`：

```json
{
  "dubheConfigPath": "./path/to/your/dubhe.config.json"
}
```

### 自定义测试参数

可以为每种测试类型配置不同的参数：

```json
{
  "queryTypes": {
    "custom": {
      "name": "自定义查询",
      "tests": [
        {
          "type": "getAllTables",
          "params": {
            "first": 50,
            "filter": {
              "createdAt": {
                "greaterThan": "2023-01-01T00:00:00Z"
              }
            }
          }
        }
      ]
    }
  }
}
```

### 自定义压测场景

```json
{
  "scenarios": {
    "custom": {
      "name": "自定义场景",
      "duration": 120,
      "connections": 50,
      "description": "高负载长时间测试"
    }
  }
}
```

## 🤔 故障排除

### GraphQL 服务未运行

```
❌ GraphQL 服务未运行!
请先启动 GraphQL 服务:
  cd packages/graphql-server
  pnpm dev
```

### Dubhe Config 加载失败

```
❌ Dubhe 配置文件加载失败
请检查配置文件路径: ../graphql-client/dubhe.config_1.json
```

确保：
1. 文件路径正确
2. JSON 格式有效
3. 文件权限正确

### 未解析到表信息

```
⚠️  未解析到表信息，请检查 dubhe config
```

检查 Dubhe config 文件中是否包含有效的 `components` 或 `resources` 定义。

## 📝 示例输出

```
============================================================
Dubhe GraphQL 智能压测工具
============================================================
✅ 配置文件加载成功: /path/to/dubhe-bench-config.json
✅ Dubhe 配置文件加载成功: /path/to/dubhe.config_1.json
🔍 检查 GraphQL 服务状态...
✅ GraphQL 服务运行正常
✅ DubheGraphqlClient 创建成功
📋 自动解析到 3 个表:
   - counter0: 3 个字段
   - counter1: 4 个字段
   - counter2: 3 个字段

============================================================
快速压测 - 基础查询
============================================================
📋 基础性能测试
📊 发现 3 个表: counter0, counter1, counter2
🚀 运行查询压测: getAllTables on counter0
   持续时间: 10s
   并发连接: 5
✅ getAllTables (counter0): 150.25 RPS, 45.67ms 平均延迟

📋 压测报告已保存到: dubhe-benchmark-report-1234567890.md
📋 详细结果已保存到: dubhe-benchmark-results-1234567890.json
🔒 客户端连接已关闭
```

## 🔄 与现有工具集成

这个工具与 Dubhe 生态系统完全集成：

- **DubheGraphqlClient**: 使用相同的客户端库
- **GraphQL Server**: 测试实际的 PostGraphile 服务
- **Dubhe Config**: 复用现有的配置文件
- **索引器**: 可以测试索引器生成的 GraphQL API

通过这种方式，压测结果能够准确反映实际应用的性能表现。 