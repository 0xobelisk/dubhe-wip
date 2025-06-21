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
npm install @0xobelisk/graphql-client
```

### 基础使用

```typescript
import { createDubheGraphqlClient } from '@0xobelisk/graphql-client';

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

## 📡 实时订阅功能

### PostGraphile Listen订阅

```typescript
// 基础listen订阅
const subscription = client.subscribeToTableChanges('encounters', {
  initialEvent: true, // 立即获取初始数据
  fields: ['player', 'monster', 'catchAttempts'],
  onData: (data) => {
    console.log('实时数据:', data.listen.query.encounters);
  },
});

// 带过滤的高级订阅
const filteredSub = client.subscribeToFilteredTableChanges('accounts', 
  { balance: { greaterThan: '1000' } }, 
  {
    initialEvent: true,
    orderBy: [{ field: 'balance', direction: 'DESC' }],
    first: 5,
  }
);
```

## 🔍 查询功能

### 基础查询

```typescript
// 查询所有账户
const accounts = await client.getAllTables('accounts');

// 带分页和过滤的查询
const filteredAccounts = await client.getAllTables('accounts', {
  first: 20,
  after: 'cursor_string',
  filter: {
    balance: { greaterThan: '0' },
    assetId: { startsWith: '0x' }
  },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }]
});

// 条件查询单个记录
const account = await client.getTableByCondition('accounts', {
  assetId: '0x123...',
  account: '0xabc...'
});
```

### 批量查询

```typescript
const results = await client.batchQuery([
  { key: 'encounters', tableName: 'encounters', params: { first: 5 } },
  { key: 'accounts', tableName: 'accounts', params: { first: 10 } },
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
  },
  retryOptions: {
    delay: { initial: 500, max: 10000 },
    attempts: { max: 3 }
  }
});
```

### 缓存配置

```typescript
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  cacheConfig: {
    paginatedTables: ['accounts', 'encounters'],
    customMergeStrategies: {
      accounts: {
        keyArgs: ['filter'],
        merge: (existing, incoming) => {
          return {
            ...incoming,
            edges: [...(existing?.edges || []), ...incoming.edges],
          };
        },
      },
    },
  },
});
```

## 📚 多表订阅

```typescript
const multiTableSub = client.subscribeToMultipleTables([
  {
    tableName: 'encounters',
    options: {
      initialEvent: true,
      fields: ['player', 'monster'],
      first: 5,
    }
  },
  {
    tableName: 'accounts',
    options: {
      initialEvent: true,
      fields: ['account', 'balance'],
      filter: { balance: { greaterThan: '0' } },
    }
  }
], {
  onData: (allData) => {
    console.log('多表数据:', allData);
  }
});
```

## 🛠️ 开发指南

```bash
# 开发
npm run dev

# 构建
npm run build

# 测试
npm run test
```

## 🔧 最佳实践

1. **使用listen订阅进行实时更新**
2. **合理使用过滤和分页**
3. **错误处理和重连**
4. **只订阅需要的字段**

查看 `examples.ts` 文件获取更多完整的使用示例。