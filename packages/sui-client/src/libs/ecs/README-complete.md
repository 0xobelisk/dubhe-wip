# 完整动态ECS系统

这是一个完全通用的ECS（Entity-Component-System）系统，支持动态组件发现和缓存策略配置。

## 🎯 核心特性

### 1. 动态组件发现
- **自动发现**: 从GraphQL schema或Apollo缓存中自动发现可用组件
- **多种策略**: 支持缓存分析、手动配置、schema内省等多种发现策略
- **智能过滤**: 支持包含/排除模式，自动过滤系统表和内部表
- **实时更新**: 支持组件缓存的动态刷新和更新

### 2. 动态缓存策略
- **通用配置**: 不再硬编码表名，支持任意GraphQL schema
- **智能合并**: 自动处理分页查询的缓存合并策略
- **运行时管理**: 支持运行时动态添加/移除缓存策略
- **调试支持**: 提供详细的缓存操作日志

### 3. 完整的ECS功能
- **实体查询**: 支持单组件、多组件、条件查询
- **实时订阅**: 支持组件变化的实时监听
- **批量操作**: 支持批量查询和优化
- **性能优化**: 内置防抖、缓存、并发控制

## 🚀 快速开始

### 最简配置

```typescript
import { createDubheGraphqlClient, createECSWorld } from '@dubhe/sui-client';

// 1. 创建GraphQL客户端
const graphqlClient = createDubheGraphqlClient({
  endpoint: 'http://localhost:5000/graphql',
});

// 2. 创建ECS世界
const world = createECSWorld(graphqlClient);

// 3. 初始化（自动发现组件）
await world.initialize();

// 4. 查询组件
const components = await world.getAvailableComponents();
console.log('发现的组件:', components);

// 5. 查询实体
if (components.length > 0) {
  const entities = await world.queryWith(components[0]);
  console.log('实体数量:', entities.length);
}
```

### 完整配置

```typescript
import { createDubheGraphqlClient, createECSWorld } from '@dubhe/sui-client';

// 1. 创建带完整缓存配置的GraphQL客户端
const graphqlClient = createDubheGraphqlClient({
  endpoint: 'http://localhost:5000/graphql',
  subscriptionEndpoint: 'ws://localhost:5000/graphql',
  headers: {
    'Authorization': 'Bearer your-token',
  },
  // 动态缓存配置
  cacheConfig: {
    debug: true, // 启用调试日志
    enableAutoMerge: true,
    defaultKeyArgs: ['filter', 'orderBy'],
    // 可以预先配置已知的表
    tableNames: ['accounts', 'encounters'], 
    // 自定义字段策略
    customFieldPolicies: {
      specialField: {
        keyArgs: ['customFilter'],
        merge: (existing, incoming) => incoming
      }
    }
  }
});

// 2. 创建带完整配置的ECS世界
const world = createECSWorld(graphqlClient, {
  componentDiscovery: {
    strategy: 'cache-analysis', // 使用缓存分析策略
    includePatterns: ['*'],
    excludePatterns: ['_*', '__*', 'internal_*'],
    cacheTTL: 300,
  },
  queryConfig: {
    enableBatchOptimization: true,
    maxConcurrentQueries: 10,
  },
  subscriptionConfig: {
    defaultDebounceMs: 100,
    maxSubscriptions: 50,
  }
});

// 3. 初始化
await world.initialize();

// 4. 动态扩展
const newTables = ['players', 'items', 'maps'];
graphqlClient.addMultipleTableCachePolicies(newTables);
await world.refreshComponentCache();
```

## 📋 组件发现策略

### 1. 缓存分析策略 (cache-analysis)
从Apollo客户端的缓存配置中分析已配置的表名：

```typescript
const world = createECSWorld(graphqlClient, {
  componentDiscovery: {
    strategy: 'cache-analysis',
    includePatterns: ['*'],
    excludePatterns: ['_*', '__*', 'internal_*'],
  }
});
```

### 2. 手动配置策略 (manual)
手动指定组件类型：

```typescript
const world = createECSWorld(graphqlClient, {
  componentDiscovery: {
    strategy: 'manual',
    componentTypes: ['account', 'encounter', 'position', 'mapConfig'],
  }
});
```

### 3. Schema内省策略 (introspection)
通过GraphQL schema内省自动发现：

```typescript
const world = createECSWorld(graphqlClient, {
  componentDiscovery: {
    strategy: 'introspection',
    includePatterns: ['*Connection'],
    excludePatterns: ['__*'],
  }
});
```

### 4. 配置文件策略 (configuration)
从外部配置文件加载（预留接口）：

```typescript
const world = createECSWorld(graphqlClient, {
  componentDiscovery: {
    strategy: 'configuration',
    configPath: './ecs-config.json',
  }
});
```

## 🔧 缓存策略管理

### 动态添加缓存策略

```typescript
// 单个表
graphqlClient.addTableCachePolicy('newTable');

// 批量添加
graphqlClient.addMultipleTableCachePolicies(['table1', 'table2', 'table3']);

// 查看已配置的策略
const policies = graphqlClient.getConfiguredTableCachePolicies();
console.log('已配置的缓存策略:', policies);
```

### 缓存管理器

```typescript
const cacheManager = graphqlClient.getCacheManager();
if (cacheManager) {
  // 添加策略
  cacheManager.addTablePolicy('newTable');
  
  // 移除策略
  cacheManager.removeTablePolicy('oldTable');
  
  // 获取配置的表名
  const tableNames = cacheManager.getConfiguredTableNames();
  
  // 清空所有策略
  cacheManager.clear();
}
```

## 🔍 查询功能

### 基本查询

```typescript
// 单组件查询
const entities = await world.queryWith('account');

// 多组件查询（交集）
const entities = await world.queryWithAll(['account', 'position']);

// 多组件查询（并集）
const entities = await world.queryWithAny(['account', 'position']);
```

### 条件查询

```typescript
// 使用查询构建器
const builder = world.query()
  .with('account', 'position')
  .where('position', { x: { gte: 0 } })
  .orderBy('position', 'x', 'ASC')
  .limit(10);
  
const results = await builder.execute();
```

### 分页查询

```typescript
const pagedResult = await world.queryWithPagination('account', {
  first: 20,
  after: 'cursor123'
});

console.log('实体:', pagedResult.entities);
console.log('分页信息:', pagedResult.pageInfo);
```

## 📡 订阅功能

### 组件变化订阅

```typescript
// 监听组件变化
const unsubscribe = world.onComponentChanged('position', (entityId, data) => {
  console.log(`位置组件变化: 实体 ${entityId}`, data);
}, {
  debounceMs: 100
});

// 停止订阅
unsubscribe();
```

### 条件订阅

```typescript
// 监听满足条件的组件变化
const unsubscribe = world.onComponentCondition(
  'position',
  { x: { gt: 100 } },
  (entityId, data) => {
    console.log('高级订阅触发:', entityId, data);
  },
  { debounceMs: 50 }
);
```

### 实时数据流

```typescript
// 创建实时数据流
const stream = world.createRealTimeStream('account');
const subscription = stream.subscribe({
  next: (data) => {
    console.log('实时数据:', data.length, '条记录');
  },
  error: (error) => {
    console.error('实时数据错误:', error);
  }
});

// 停止订阅
subscription.unsubscribe();
```

## 📊 性能和统计

### 组件统计

```typescript
// 获取组件统计信息
const stats = await world.getComponentStats();
console.log('组件统计:', stats);

// 获取总实体数量
const entityCount = await world.getEntityCount();
console.log('总实体数量:', entityCount);
```

### 组件元数据

```typescript
// 获取组件元数据
const metadata = await world.getComponentMetadata('account');
if (metadata) {
  console.log('组件字段:', 
    metadata.fields.map(f => `${f.name}(${f.type})`).join(', ')
  );
}
```

## 🛠️ 高级功能

### 批量查询

```typescript
// 批量查询多个组件
const batchResult = await world.batchQuery([
  { component: 'account', params: { first: 10 } },
  { component: 'position', params: { first: 20 } },
]);

console.log('批量查询结果:', batchResult);
```

### 查询监听器

```typescript
// 监听查询结果变化
const watcher = world.watchQuery(['account', 'position'], (changes) => {
  console.log('查询结果变化:', changes);
});

// 停止监听
watcher.stop();
```

### 实体关系

```typescript
// 查找实体交集
const intersection = await world.findEntityIntersection(['account', 'position']);

// 查找实体并集
const union = await world.findEntityUnion(['account', 'position']);
```

## 🔧 配置选项

### ECS世界配置

```typescript
interface ECSWorldConfig {
  componentDiscovery?: ComponentDiscoveryConfig;
  queryConfig?: {
    defaultCacheTimeout?: number;
    maxConcurrentQueries?: number;
    enableBatchOptimization?: boolean;
  };
  subscriptionConfig?: {
    defaultDebounceMs?: number;
    maxSubscriptions?: number;
    reconnectOnError?: boolean;
  };
}
```

### 组件发现配置

```typescript
interface ComponentDiscoveryConfig {
  strategy: 'cache-analysis' | 'manual' | 'introspection' | 'configuration';
  componentTypes?: string[];
  includePatterns?: string[];
  excludePatterns?: string[];
  cacheTTL?: number;
  configPath?: string;
}
```

### 缓存配置

```typescript
interface CacheConfigOptions {
  tableNames?: string[];
  enableAutoMerge?: boolean;
  customFieldPolicies?: Record<string, FieldPolicy>;
  defaultKeyArgs?: string[];
  debug?: boolean;
}
```

## 🎯 示例代码

查看完整的示例代码：

- `examples-complete.ts` - 完整系统示例
- `examples-new.ts` - 动态发现示例  
- `examples.ts` - 基础功能示例

运行示例：

```typescript
import { runCompleteExamples } from '@dubhe/sui-client';

// 运行所有完整示例
await runCompleteExamples();
```

## 🚨 错误处理

系统提供完善的错误处理机制：

```typescript
try {
  await world.initialize();
} catch (error) {
  console.error('初始化失败:', error.message);
  
  // 检查具体错误类型
  if (error.message.includes('网络')) {
    // 处理网络错误
  } else if (error.message.includes('权限')) {
    // 处理权限错误
  }
}
```

## 🔄 迁移指南

### 从硬编码系统迁移

1. **更新GraphQL客户端配置**：
   ```typescript
   // 旧方式：硬编码缓存策略
   // 新方式：动态缓存配置
   const client = createDubheGraphqlClient({
     endpoint: 'your-endpoint',
     cacheConfig: {
       tableNames: ['your', 'table', 'names'],
       debug: true
     }
   });
   ```

2. **更新ECS世界创建**：
   ```typescript
   // 旧方式：手动指定组件
   // 新方式：自动发现组件
   const world = createECSWorld(client, {
     componentDiscovery: {
       strategy: 'cache-analysis'
     }
   });
   ```

3. **初始化世界**：
   ```typescript
   // 新增：必须调用初始化
   await world.initialize();
   ```

## 📈 性能优化建议

1. **合理配置缓存TTL**：根据数据更新频率设置合适的缓存时间
2. **使用批量查询**：对于多个组件的查询，使用批量查询提高性能
3. **设置防抖时间**：对于频繁的订阅，设置合适的防抖时间
4. **限制并发查询**：设置合理的最大并发查询数量
5. **使用过滤模式**：通过包含/排除模式减少不必要的组件发现

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个系统！

## �� 许可证

MIT License 