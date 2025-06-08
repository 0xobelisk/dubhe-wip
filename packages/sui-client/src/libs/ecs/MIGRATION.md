# ECS 系统迁移指南

## 📅 更新日期
当前版本更新了 DubheGraphqlClient 的缓存机制，需要相应更新 ECS 系统的示例代码。

## 🔄 主要变更

### 1. DubheGraphqlClient 配置更新

**之前（过时的配置）:**
```typescript
const graphqlClient = createDubheGraphqlClient({
  endpoint: 'http://localhost:5000/graphql',
  cacheConfig: {
    debug: true,
    enableAutoMerge: true,
    defaultKeyArgs: ['filter', 'orderBy'],
    tableNames: ['accounts', 'encounters'],
  },
});
```

**现在（正确的配置）:**
```typescript
const graphqlClient = createDubheGraphqlClient({
  endpoint: 'http://localhost:5000/graphql',
  cacheConfig: {
    paginatedTables: ['account', 'encounter', 'position'],
    strategy: 'filter-orderby',
    customMergeStrategies: {
      accounts: {
        keyArgs: ['filter'],
        merge: (existing: any, incoming: any) => {
          if (!incoming || !Array.isArray(incoming.edges)) {
            return existing;
          }
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

### 2. 默认行为变更

**新的默认行为:**
- 不配置 `cacheConfig` 时，使用简单的 `InMemoryCache()`
- 只有配置了 `paginatedTables` 才启用分页缓存合并
- 缓存策略在客户端创建时静态配置，不再支持动态添加

### 3. 移除的 API

以下 API 已被移除：
```typescript
// ❌ 已移除
graphqlClient.addMultipleTableCachePolicies(tableNames);
graphqlClient.getConfiguredTableCachePolicies();
graphqlClient.getCacheManager();
graphqlClient.getAutoDiscovery();
graphqlClient.autoInitialize();

// ❌ 已移除的配置选项
cacheConfig: {
  debug: true,
  enableAutoMerge: true,
  defaultKeyArgs: ['filter', 'orderBy'],
  tableNames: ['accounts'],
  customFieldPolicies: {},
}
```

### 4. 新的配置选项

```typescript
interface DubheClientConfig {
  endpoint: string;
  subscriptionEndpoint?: string;
  headers?: Record<string, string>;
  fetchOptions?: RequestInit;
  retryOptions?: RetryOptions;
  cacheConfig?: {
    // 需要分页缓存的表名列表（使用单数形式）
    paginatedTables?: string[];
    // 缓存策略
    strategy?: 'none' | 'filter-only' | 'filter-orderby' | 'table-level';
    // 自定义合并策略
    customMergeStrategies?: Record<string, {
      keyArgs?: string[];
      merge?: (existing: any, incoming: any) => any;
    }>;
  };
}
```

## 📝 更新的文件

### 示例文件更新
- `examples-complete.ts` - 更新了所有客户端配置
- `examples-new.ts` - 更新了分页缓存示例
- `discovery.ts` - 移除了过时的动态缓存配置调用

### 主要变更
1. 移除了所有过时的配置选项
2. 更新了缓存配置格式
3. 简化了自动schema发现（暂时不可用）
4. 添加了正确的类型注解

## 🚀 迁移步骤

### 1. 更新客户端创建
```typescript
// 最简配置（推荐）
const client = createDubheGraphqlClient({
  endpoint: 'your-endpoint',
});

// 需要分页缓存时
const client = createDubheGraphqlClient({
  endpoint: 'your-endpoint',
  cacheConfig: {
    paginatedTables: ['account', 'position'], // 根据实际需要配置
  },
});
```

### 2. 移除过时的API调用
删除所有对以下方法的调用：
- `addMultipleTableCachePolicies`
- `getConfiguredTableCachePolicies`
- `getCacheManager`
- `autoInitialize`

### 3. 更新配置格式
将所有 `tableNames` 改为 `paginatedTables`，并移除其他过时配置。

## ✅ 验证迁移

运行示例验证迁移是否成功：
```typescript
import { runAllExamples } from './examples-new';
import { runCompleteExamples } from './examples-complete';

// 测试基础示例
await runAllExamples();

// 测试完整示例
await runCompleteExamples();
```

## 💡 最佳实践

1. **简单优先**: 大多数情况下不需要配置缓存，使用默认配置即可
2. **按需配置**: 只为真正需要分页缓存的表配置 `paginatedTables`
3. **性能考虑**: 避免为所有表启用缓存，可能导致内存占用过大
4. **测试验证**: 迁移后测试查询和订阅功能是否正常 