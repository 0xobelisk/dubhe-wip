# Dubhe GraphQL Client

基于Apollo Client的TypeScript GraphQL客户端，用于查询Sui Rust Indexer数据。

## 重要更新 ⚠️

**API 变更通知：**从版本 2.0 开始，服务器端已去掉所有 "store" 前缀，客户端API相应更新：

- `storeAccounts` → `accounts`
- `storeEncounters` → `encounters` 
- `storePositions` → `positions`
- `storeMapConfigs` → `mapConfigs`

旧方法仍然可用但已标记为废弃，建议尽快迁移到新API。

## 特性

- ✅ **类型安全**：完整的TypeScript支持
- ✅ **智能缓存**：Apollo Client强大的缓存系统
- ✅ **实时订阅**：支持WebSocket实时数据订阅
- ✅ **自动重试**：网络错误自动重试机制
- ✅ **分页支持**：完整的GraphQL Connection分页
- ✅ **过滤查询**：强大的数据过滤和排序
- ✅ **批量操作**：支持批量查询多个表
- ✅ **实时数据流**：结合查询和订阅的实时数据流
- ✅ **向后兼容**：支持旧版API并提供迁移路径

## 安装

确保您已安装必要的依赖：

```bash
npm install @apollo/client graphql graphql-ws
```

## 快速开始

### 1. 创建客户端

```typescript
import { createDubheGraphqlClient } from './libs/dubheGraphqlClient';

const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  subscriptionEndpoint: 'ws://localhost:4000/graphql',
  headers: {
    'Authorization': 'Bearer your-token',
  },
});
```

### 2. 基础查询（新API）

```typescript
// 查询encounters表数据（之前是StoreEncounter）
const encounters = await client.getAllTables('encounters', {
  first: 10,
  filter: {
    exists: { equalTo: true },
  },
  orderBy: [
    { field: 'createdAt', direction: 'DESC' },
  ],
});

console.log('Encounters:', encounters.edges);

// 查询accounts表数据（之前是StoreAccount）
const accounts = await client.getAllTables('accounts', {
  first: 5,
  filter: {
    balance: { greaterThan: '0' },
  },
});

// 根据条件查询单个记录
const account = await client.getTableByCondition('accounts', {
  assetId: '0x123...',
  account: '0xabc...'
});
```

### 3. 实时订阅（新API）

```typescript
// 订阅encounters表数据变更
const subscription = client.subscribeToTableChanges('encounters', {
  onData: (data) => {
    console.log('数据更新:', data);
  },
  onError: (error) => {
    console.error('订阅错误:', error);
  },
});
```

### 4. 自定义GraphQL查询（新表名）

```typescript
import { gql } from '@apollo/client';

const CUSTOM_QUERY = gql`
  query GetPlayerData($player: String!) {
    encounters(filter: { player: { equalTo: $player } }) {
      edges {
        node {
          id
          player
          monster
          catchAttempts
          exists
        }
      }
      totalCount
    }
  }
`;

const result = await client.query(CUSTOM_QUERY, {
  player: '0x123...',
});
```

## API 参考

### DubheGraphqlClient

主要的GraphQL客户端类。

#### 新方法（推荐使用）

##### `getAllTables<T>(tableName, params?)`
查询表的所有数据。

```typescript
const data = await client.getAllTables('encounters', {
  first: 20,
  after: 'cursor',
  filter: { /* 过滤条件 */ },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }],
});
```

##### `getTableByCondition<T>(tableName, condition)`
根据条件查询单个记录。

```typescript
const item = await client.getTableByCondition('accounts', {
  assetId: '0x123...',
  account: '0xabc...'
});
```

##### `subscribeToTableChanges<T>(tableName, options?)`
订阅表数据变更。

```typescript
const subscription = client.subscribeToTableChanges('encounters', {
  onData: (data) => console.log(data),
  onError: (error) => console.error(error),
});
```

#### 废弃方法（向后兼容）

以下方法仍然可用但已废弃，请迁移到新API：

- `getAllStoreTables()` → 使用 `getAllTables()`
- `getStoreTableById()` → 使用 `getTableByCondition()`
- `subscribeToStoreTableChanges()` → 使用 `subscribeToTableChanges()`

### 表名映射

| 旧名称 (v1.x) | 新名称 (v2.x) |
|--------------|--------------|
| `StoreAccount` / `storeAccounts` | `accounts` |
| `StoreEncounter` / `storeEncounters` | `encounters` |
| `StorePosition` / `storePositions` | `positions` |
| `StoreMapConfig` / `storeMapConfigs` | `mapConfigs` |

## 迁移指南

### 从 v1.x 迁移到 v2.x

```typescript
// ❌ 旧写法（v1.x）
const encounters = await client.getAllStoreTables('StoreEncounter', { first: 10 });
const account = await client.getStoreTableById('StoreAccount', 'some-id');
const sub = client.subscribeToStoreTableChanges('StoreEncounter');

// ✅ 新写法（v2.x）
const encounters = await client.getAllTables('encounters', { first: 10 });
const account = await client.getTableByCondition('accounts', { id: 'some-id' });
const sub = client.subscribeToTableChanges('encounters');
```

### GraphQL 查询迁移

```graphql
# ❌ 旧查询
query OldQuery {
  allStoreEncounters {
    nodes {
      id
      player
    }
  }
}

# ✅ 新查询
query NewQuery {
  encounters {
    nodes {
      id
      player
    }
  }
}
```

## 最佳实践

### 1. 使用新API

```typescript
// 推荐：使用新的去掉前缀的API
const data = await client.getAllTables('encounters');

// 不推荐：使用废弃的API（虽然仍然可用）
const data = await client.getAllStoreTables('StoreEncounter');
```

### 2. 错误处理

```typescript
try {
  const result = await client.getAllTables('encounters');
  // 处理结果
} catch (error) {
  if (error.message.includes('Network')) {
    console.log('网络错误，正在重试...');
  } else {
    console.error('查询错误:', error.message);
  }
}
```

### 3. 批量查询

```typescript
const results = await client.batchQuery([
  { key: 'encounters', tableName: 'encounters', params: { first: 5 } },
  { key: 'accounts', tableName: 'accounts', params: { first: 5 } },
  { key: 'positions', tableName: 'positions', params: { first: 5 } },
]);
```

## 注意事项

1. **API变更**：从v2.0开始，所有表名都去掉了"Store"前缀
2. **向后兼容**：旧API仍可用但会打印废弃警告
3. **只支持查询和订阅**：服务器已禁用mutation功能
4. **连接管理**：记得在使用完毕后调用`client.close()`
5. **订阅限制**：确保WebSocket端点可用且正确配置
6. **类型安全**：尽量使用TypeScript获得更好的开发体验

## 示例

查看 `examples.ts` 文件获取更多使用示例，包括新API的完整用法。 