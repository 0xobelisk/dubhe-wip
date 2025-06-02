# Dubhe GraphQL Client

基于Apollo Client的TypeScript GraphQL客户端，用于查询Sui Rust Indexer数据。

## 特性

- ✅ **类型安全**：完整的TypeScript支持
- ✅ **智能缓存**：Apollo Client强大的缓存系统
- ✅ **实时订阅**：支持WebSocket实时数据订阅
- ✅ **自动重试**：网络错误自动重试机制
- ✅ **分页支持**：完整的GraphQL Connection分页
- ✅ **过滤查询**：强大的数据过滤和排序
- ✅ **批量操作**：支持批量查询多个表
- ✅ **实时数据流**：结合查询和订阅的实时数据流

## 安装

确保您已安装必要的依赖：

```bash
npm install @apollo/client graphql graphql-ws
```

## 快速开始

### 1. 创建客户端

```typescript
import { createDubheGraphqlClient } from './libs/dubheIndexerClient';

const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  subscriptionEndpoint: 'ws://localhost:4000/graphql',
  headers: {
    'Authorization': 'Bearer your-token',
  },
});
```

### 2. 基础查询

```typescript
// 查询Store表数据
const encounters = await client.getAllStoreTables('StoreEncounter', {
  first: 10,
  filter: {
    isRemoved: { equalTo: false },
  },
  orderBy: [
    { field: 'createdAt', direction: 'DESC' },
  ],
});

console.log('Encounters:', encounters.edges);
```

### 3. 实时订阅

```typescript
// 订阅数据变更
const subscription = client.subscribeToStoreTableChanges('StoreEncounter', {
  onData: (data) => {
    console.log('数据更新:', data);
  },
  onError: (error) => {
    console.error('订阅错误:', error);
  },
});
```

### 4. 自定义GraphQL查询

```typescript
import { gql } from '@apollo/client';

const CUSTOM_QUERY = gql`
  query GetPlayerData($playerAddress: String!) {
    allStoreEncounters(filter: { playerAddress: { equalTo: $playerAddress } }) {
      edges {
        node {
          id
          playerAddress
          eventType
          data
          createdAt
        }
      }
    }
  }
`;

const result = await client.query(CUSTOM_QUERY, {
  playerAddress: '0x123...',
});
```

## API 参考

### DubheGraphqlClient

主要的GraphQL客户端类。

#### 方法

##### `query<TData, TVariables>(query, variables?, options?)`
执行GraphQL查询。

```typescript
const result = await client.query(QUERY, variables, {
  cachePolicy: 'cache-first', // 缓存策略
  pollInterval: 5000,         // 轮询间隔（毫秒）
});
```

##### `getAllStoreTables<T>(tableName, params?)`
查询Store表的所有数据。

```typescript
const data = await client.getAllStoreTables('StoreEncounter', {
  first: 20,
  after: 'cursor',
  filter: { /* 过滤条件 */ },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }],
});
```

##### `getStoreTableById<T>(tableName, id)`
根据ID查询单个记录。

```typescript
const item = await client.getStoreTableById('StoreEncounter', 'some-id');
```

##### `subscribeToStoreTableChanges<T>(tableName, options?)`
订阅表数据变更。

```typescript
const subscription = client.subscribeToStoreTableChanges('StoreEncounter', {
  onData: (data) => console.log(data),
  onError: (error) => console.error(error),
});
```

##### `batchQuery(queries)`
批量查询多个表。

```typescript
const results = await client.batchQuery([
  { key: 'encounters', tableName: 'StoreEncounter', params: { first: 5 } },
  { key: 'accounts', tableName: 'StoreAccount', params: { first: 5 } },
]);
```

##### `createRealTimeDataStream<T>(tableName, initialQuery?)`
创建实时数据流（结合查询和订阅）。

```typescript
const stream = client.createRealTimeDataStream('StoreEncounter', {
  first: 10,
  filter: { isRemoved: { equalTo: false } },
});

stream.subscribe({
  next: (data) => console.log('实时数据:', data),
  error: (error) => console.error(error),
});
```

### 缓存策略

支持以下缓存策略：

- `'cache-first'`：优先使用缓存，缓存不存在时从网络获取
- `'network-only'`：总是从网络获取，不使用缓存
- `'cache-only'`：只使用缓存，网络不可用时返回错误
- `'no-cache'`：从网络获取但不缓存结果
- `'standby'`：类似cache-first，但不会主动更新

### 过滤条件

支持丰富的过滤操作符：

```typescript
const filter = {
  // 基础比较
  fieldName: { equalTo: 'value' },
  fieldName: { notEqualTo: 'value' },
  fieldName: { lessThan: 100 },
  fieldName: { greaterThan: 100 },
  
  // 数组操作
  fieldName: { in: ['value1', 'value2'] },
  fieldName: { notIn: ['value1', 'value2'] },
  
  // 字符串操作
  fieldName: { like: '%pattern%' },
  fieldName: { startsWith: 'prefix' },
  fieldName: { endsWith: 'suffix' },
  fieldName: { includes: 'substring' },
  
  // 空值检查
  fieldName: { isNull: true },
};
```

## 最佳实践

### 1. 错误处理

```typescript
try {
  const result = await client.getAllStoreTables('StoreEncounter');
  // 处理结果
} catch (error) {
  if (error.message.includes('Network')) {
    // 网络错误，可以重试
    console.log('网络错误，正在重试...');
  } else {
    // GraphQL错误，检查查询语法
    console.error('查询错误:', error.message);
  }
}
```

### 2. 内存管理

```typescript
// 使用完毕后关闭客户端
client.close();

// 清除缓存（如果需要）
await client.clearCache();
```

### 3. 性能优化

```typescript
// 使用适当的缓存策略
const result = await client.query(QUERY, variables, {
  cachePolicy: 'cache-first', // 对于不经常变化的数据
});

// 对于实时数据使用订阅而不是轮询
const subscription = client.subscribeToStoreTableChanges('StoreEncounter');
```

### 4. 分页处理

```typescript
async function loadAllData(tableName: string) {
  const allItems = [];
  let hasMore = true;
  let cursor: string | undefined;

  while (hasMore) {
    const page = await client.getAllStoreTables(tableName, {
      first: 100, // 每页100条
      after: cursor,
    });

    allItems.push(...page.edges.map(edge => edge.node));
    hasMore = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  return allItems;
}
```

## 注意事项

1. **只支持查询和订阅**：服务器已禁用mutation功能
2. **表名约定**：所有Store表以`Store`前缀命名
3. **连接管理**：记得在使用完毕后调用`client.close()`
4. **订阅限制**：确保WebSocket端点可用且正确配置
5. **类型安全**：尽量使用TypeScript获得更好的开发体验

## 向后兼容性

为了保持向后兼容性，我们仍然导出以下别名：

```typescript
// 新的推荐用法
import { createDubheGraphqlClient, DubheGraphqlClient } from './libs/dubheIndexerClient';

// 旧的用法（仍然可用）
import { createDubheClient, DubheIndexerClient } from './libs/dubheIndexerClient';
```

## 示例

查看 `examples.ts` 文件获取更多使用示例。 