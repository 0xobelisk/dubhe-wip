# DubheGraphqlClient

强大的GraphQL客户端，专为Dubhe索引器设计，支持完整的CRUD操作和实时订阅功能。

## ✨ 主要特性

- 🔄 **实时订阅**: 支持PostGraphile的`listen`订阅功能
- 📊 **高级过滤**: 强大的过滤和排序功能
- 🚀 **性能优化**: 内置重试机制和缓存策略
- 📱 **跨平台**: 支持浏览器和Node.js环境
- 🛡️ **类型安全**: 完整的TypeScript支持

## 🚀 快速开始

### 安装

```bash
npm install @0xobelisk/sui-client
```

### 基础使用

```typescript
import { createDubheGraphqlClient } from '@0xobelisk/sui-client';

const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  subscriptionEndpoint: 'ws://localhost:4000/graphql',
});

// 查询数据
const accounts = await client.getAllTables('accounts', {
  first: 10,
  filter: { balance: { greaterThan: '1000' } },
  orderBy: [{ field: 'balance', direction: 'DESC' }],
});

console.log(accounts);
```

## 📡 实时订阅功能（重要更新）

### PostGraphile Listen订阅

我们现在支持PostGraphile的高级`listen`订阅功能，这是推荐的实时数据监听方式：

```typescript
// 1. 基础listen订阅
const subscription = client.subscribeToTableChanges('encounters', {
  initialEvent: true, // 立即获取初始数据
  fields: ['player', 'monster', 'catchAttempts'],
  topicPrefix: 'store_xxxxxx', // 自定义topic前缀 (可选)
  onData: (data) => {
    // data.listen.query.encounters 包含实时数据
    console.log('实时数据:', data.listen.query.encounters);
    
    // 检查是否有单个变更记录
    if (data.listen.relatedNode) {
      console.log('变更的具体记录:', data.listen.relatedNode);
    }
  },
});

// 2. 带过滤的高级订阅
const filteredSub = client.subscribeToFilteredTableChanges('accounts', 
  { balance: { greaterThan: '1000' } }, 
  {
    initialEvent: true,
    orderBy: [{ field: 'balance', direction: 'DESC' }],
    first: 5,
    topicPrefix: 'wallet_', // 自定义前缀
  }
);

// 3. 自定义查询订阅
const customSub = client.subscribeWithListen(
  'store_positions',
  `positions(first: 10) { nodes { player x y } }`,
  { initialEvent: false }
);
```

### 订阅特性

- **🔄 实时更新**: 数据库变更时自动通知
- **⚡ 初始事件**: 可选择订阅时立即获取当前数据
- **🎯 精确过滤**: 只监听符合条件的数据变更
- **📊 结构化数据**: 返回完整的GraphQL查询结果

## 🔍 查询功能

### 基础查询

```typescript
// 查询所有账户（支持单数表名）
const accounts = await client.getAllTables('account');

// 带分页和过滤的查询
const filteredAccounts = await client.getAllTables('account', {
  first: 20,
  after: 'cursor_string',
  filter: {
    balance: { greaterThan: '0' },
    assetId: { startsWith: '0x' }
  },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }]
});
```

### 条件查询

```typescript
// 根据特定条件查询单条记录（支持单数表名）
const account = await client.getTableByCondition('account', {
  assetId: '0x123...',
  account: '0xabc...'
});
```

### 批量查询

```typescript
const results = await client.batchQuery([
  { key: 'encounters', tableName: 'encounters', params: { first: 5 } },
  { key: 'accounts', tableName: 'accounts', params: { first: 10 } },
  { key: 'positions', tableName: 'positions', params: { first: 15 } }
]);
```

## ⚙️ 配置选项

### 客户端配置

```typescript
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  subscriptionEndpoint: 'ws://localhost:4000/graphql',
  headers: {
    'Authorization': 'Bearer token',
    'X-Custom-Header': 'value'
  },
  retryOptions: {
    delay: { initial: 500, max: 10000 },
    attempts: { max: 3 }
  }
});
```

### 重试机制

```typescript
const clientWithRetry = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  retryOptions: {
    delay: {
      initial: 500,    // 初始延迟500ms
      max: 10000,      // 最大延迟10秒
      jitter: true     // 启用随机抖动
    },
    attempts: {
      max: 3,          // 最多重试3次
      retryIf: (error) => {
        // 自定义重试条件
        return error.networkError || error.networkError?.statusCode >= 500;
      }
    }
  }
});
```

## 🆕 API变更说明

### 表名处理简化

我们采用简单的复数/单数转换逻辑，与PostGraphile保持一致：

```typescript
// ✅ 简单转换规则 - 只判断最后的's'
'account' → 'accounts'     // 单数加's'变复数
'accounts' → 'account'     // 复数去's'变单数
'encounter' → 'encounters' // 单数加's'变复数
'encounters' → 'encounter' // 复数去's'变单数

// 已经以's'结尾的保持不变
'accounts' → 'accounts'    // 已经是复数
'positions' → 'positions'  // 已经是复数
```

### 订阅API升级

```typescript
// ✅ 推荐：使用新的listen订阅
client.subscribeToTableChanges('encounters', {
  initialEvent: true,
  fields: ['player', 'monster']
});

// ✅ 仍然支持：旧版订阅API（向后兼容）
client.subscribeToStoreTableChanges('encounters', options);
```

## 🔧 最佳实践

### 1. 使用listen订阅进行实时更新

```typescript
// 推荐做法
const subscription = client.subscribeToTableChanges('encounters', {
  initialEvent: true,  // 获取初始数据
  fields: ['player', 'monster', 'catchAttempts'],
  onData: (data) => {
    updateGameState(data.listen.query.encounters.nodes);
  }
});
```

### 2. 合理使用过滤和分页

```typescript
// 只监听相关数据
const filteredSub = client.subscribeToFilteredTableChanges('accounts',
  { account: { equalTo: currentUserAddress } },
  { 
    initialEvent: true,
    first: 50  // 限制数据量
  }
);
```

### 3. 错误处理和重连

```typescript
const subscription = client.subscribeToTableChanges('encounters', {
  onError: (error) => {
    console.error('订阅错误:', error);
    // 可以实现自动重连逻辑
    setTimeout(() => restartSubscription(), 5000);
  }
});
```

## 📚 完整示例

查看 `examples.ts` 文件获取更多完整的使用示例，包括：

- 基础查询和过滤
- 实时订阅和数据流
- 批量操作
- 错误处理
- 重试机制

## 🔄 迁移指南

从旧版本迁移到新版本：

1. **订阅API**: 推荐使用新的`subscribeToTableChanges`，支持`initialEvent`选项
2. **数据结构**: listen订阅返回`data.listen.query.tableName`结构
3. **表名**: 继续使用去掉store前缀的表名（如`accounts`而不是`store_accounts`）

## 🛠️ 开发指南

```bash
# 开发
npm run dev

# 构建
npm run build

# 测试
npm run test
``` 