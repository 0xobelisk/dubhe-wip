# DubheGraphqlClient 测试脚本

这个目录包含了用于测试 DubheGraphqlClient 功能的脚本。

## 文件说明

### `test-queries.ts`

全面的查询测试脚本，演示了 DubheGraphqlClient 的所有主要功能，包括：

1. **配置信息检查** - 验证 dubhe config 是否正确加载并解析
2. **基础查询测试** - 测试 `getAllTables` 方法
3. **条件查询测试** - 测试 `getTableByCondition` 方法
4. **批量查询测试** - 测试 `batchQuery` 方法
5. **高级过滤查询** - 测试复杂的过滤条件
6. **订阅测试** - 测试实时数据订阅功能
7. **多表订阅测试** - 测试同时订阅多个表
8. **性能测试** - 测试并发查询的性能
9. **清理和总结** - 清理缓存和关闭连接

## 使用方法

### 1. 直接运行脚本

```bash
# 在 packages/graphql-client 目录下
cd packages/graphql-client

# 使用 ts-node 运行
npx ts-node scripts/test-queries.ts

# 或使用 tsx 运行
npx tsx scripts/test-queries.ts
```

### 2. 配置环境变量

可以通过环境变量自定义 GraphQL 端点：

```bash
# 设置自定义端点
export GRAPHQL_ENDPOINT="http://your-server:4000/graphql"
export GRAPHQL_WS_ENDPOINT="ws://your-server:4000/graphql"

# 然后运行脚本
npx ts-node scripts/test-queries.ts
```

### 3. 在代码中使用

```typescript
import { testQueries } from './scripts/test-queries';

// 在你的代码中调用测试函数
await testQueries();
```

## 前置条件

1. **GraphQL 服务器**: 确保有一个运行的 GraphQL 服务器
2. **数据库数据**: 建议在数据库中有一些测试数据
3. **网络连接**: 确保可以访问配置的端点

## 脚本功能详解

### 配置解析

脚本会自动从 `../dubhe.config.ts` 加载配置，并展示解析的表信息：

- 表名和字段列表
- 主键配置
- 是否有默认 ID 字段
- 枚举字段映射

### 查询测试

脚本会测试以下表（基于 monster_hunter 配置）：

- `player` - 玩家表
- `position` - 位置表  
- `monster` - 怪物表
- `map_config` - 地图配置表
- `encounter` - 遭遇表

### 实时功能

包含对以下实时功能的测试：

- 单表数据变更订阅
- 多表数据变更订阅
- 订阅的启动和停止

## 错误处理

脚本包含完善的错误处理：

- 网络连接错误
- GraphQL 查询错误
- 订阅错误
- 未处理的 Promise 拒绝

## 输出说明

脚本使用彩色输出来增强可读性：

- 🚀 开始标记
- ✅ 成功操作
- ❌ 错误信息
- ℹ️ 信息提示
- 📊 数据结果
- 📋 配置信息

## 自定义测试

你可以根据自己的需求修改脚本：

1. **修改表名**: 更新 `batchQuery` 中的表名列表
2. **调整过滤条件**: 修改查询参数中的 `filter` 条件
3. **自定义字段**: 在查询中指定 `fields` 参数
4. **调整超时**: 修改订阅测试的超时时间

## 故障排除

### 常见问题

1. **连接被拒绝**: 检查 GraphQL 服务器是否运行
2. **查询失败**: 检查表名和字段名是否正确
3. **订阅超时**: 检查 WebSocket 连接是否可用
4. **无数据返回**: 检查数据库中是否有测试数据

### 调试技巧

1. 启用详细日志输出
2. 检查网络连接
3. 验证 GraphQL schema
4. 使用 GraphQL Playground 测试查询

## 贡献

如果你发现脚本中的问题或有改进建议，请：

1. 提交 Issue 描述问题
2. 提供 Pull Request 修复
3. 更新相关文档

---

**注意**: 这个脚本主要用于开发和测试目的，不建议在生产环境中直接运行。 