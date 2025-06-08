# 🎮 Dubhe ECS系统 - 动态组件发现版

基于GraphQL的动态Entity-Component-System架构，支持自动发现可用组件类型。

## ✨ 核心特性

- 🔍 **动态组件发现**: 自动发现GraphQL schema中的可用组件
- 🏗️ **多种发现策略**: GraphQL自省、缓存分析、手动配置
- 🚀 **实时查询系统**: 支持复杂的实体查询和过滤
- 📡 **实时订阅**: 组件变化的实时监听和推送
- 🛠️ **查询构建器**: 链式API构建复杂查询
- 💾 **智能缓存**: 自动缓存优化查询性能
- 🎯 **类型安全**: 完整的TypeScript类型支持
- 🔧 **可配置**: 丰富的配置选项和过滤器

## 📦 安装

```bash
npm install @apollo/client graphql
```

## 🚀 快速开始

### 🎯 基本使用（推荐）

```typescript
import { createDubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import { createECSWorld } from './index';

// 1. 创建GraphQL客户端
const graphqlClient = createDubheGraphqlClient({
  endpoint: 'http://localhost:5000/graphql',
  subscriptionEndpoint: 'ws://localhost:5000/graphql',
});

// 2. 创建ECS世界 - 使用默认配置自动发现组件
const world = createECSWorld(graphqlClient);

// 3. 初始化世界（自动发现可用组件）
await world.initialize();

// 4. 获取发现的组件
const availableComponents = await world.getAvailableComponents();
console.log('🔍 发现的组件:', availableComponents);

// 5. 基本查询
if (availableComponents.length > 0) {
  const entities = await world.queryWith(availableComponents[0]);
  console.log('📊 实体数量:', entities.length);
}
```

## 🔧 组件发现策略

### 1. 缓存分析（默认推荐）

```typescript
const world = createECSWorld(graphqlClient, {
  componentDiscovery: {
    strategy: 'cache-analysis',
    cacheTTL: 300, // 5分钟缓存
    includePatterns: ['*'],
    excludePatterns: ['_*', '__*']
  }
});
```

### 2. 手动配置

```typescript
const world = createECSWorld(graphqlClient, {
  componentDiscovery: {
    strategy: 'manual',
    componentTypes: ['account', 'position', 'encounter', 'mapConfig'],
    cacheTTL: 600, // 10分钟缓存
  }
});
```

### 3. GraphQL自省

```typescript
const world = createECSWorld(graphqlClient, {
  componentDiscovery: {
    strategy: 'introspection',
    includePatterns: ['*'], // 包含所有
    excludePatterns: ['_*', '__*'], // 排除内部字段
    cacheTTL: 300,
  }
});
```

### 4. 配置文件

```typescript
const world = createECSWorld(graphqlClient, {
  componentDiscovery: {
    strategy: 'configuration',
    configPath: '/api/ecs-config',
    cacheTTL: 1800, // 30分钟缓存
  }
});
```

## 📋 完整配置示例

```typescript
const world = createECSWorld(graphqlClient, {
  // 组件发现配置
  componentDiscovery: {
    strategy: 'cache-analysis',
    includePatterns: ['*'],
    excludePatterns: ['_*', '__*', 'internal_*'],
    cacheTTL: 300,
    autoRefresh: false,
  },
  
  // 查询配置
  queryConfig: {
    defaultCacheTimeout: 5000,
    maxConcurrentQueries: 10,
    enableBatchOptimization: true,
  },
  
  // 订阅配置
  subscriptionConfig: {
    defaultDebounceMs: 100,
    maxSubscriptions: 100,
    reconnectOnError: true,
  }
});
```

## 🔍 查询API

### 基本查询

```typescript
// 检查实体是否存在
const exists = await world.hasEntity('entity123');

// 检查实体是否有组件
const hasComponent = await world.hasComponent('entity123', 'position');

// 获取组件数据
const position = await world.getComponent<PositionComponent>('entity123', 'position');

// 获取实体的所有组件
const components = await world.getComponents('entity123');
```

### 世界查询

```typescript
// 查询拥有特定组件的实体
const entities = await world.queryWith('position');

// 查询拥有多个组件的实体（交集）
const movableEntities = await world.queryWithAll(['position', 'velocity']);

// 查询拥有任意组件的实体（并集）
const visibleEntities = await world.queryWithAny(['sprite', 'model', 'particle']);

// 排除查询
const staticEntities = await world.queryWithout(['position'], ['velocity']);
```

### 条件查询

```typescript
// 条件查询
const nearbyEntities = await world.queryWhere('position', {
  x: { gte: 0, lte: 100 },
  y: { gte: 0, lte: 100 }
});

// 范围查询
const highLevelPlayers = await world.queryRange('player', 'level', 50, 100);

// 分页查询
const pagedResults = await world.queryPaged(['player'], 1, 20);
```

### 查询构建器

```typescript
// 链式查询
const results = await world.query()
  .with('position', 'health')
  .without('dead')
  .where('health', { current: { gt: 0 } })
  .orderBy('position', 'x', 'ASC')
  .limit(10)
  .execute();
```

## 📡 订阅API

### 组件订阅

```typescript
// 监听组件添加
const unsubscribe1 = world.onComponentAdded('position', (entityId, component) => {
  console.log(`实体 ${entityId} 添加了位置组件:`, component);
});

// 监听组件移除
const unsubscribe2 = world.onComponentRemoved('health', (entityId, component) => {
  console.log(`实体 ${entityId} 移除了健康组件:`, component);
});

// 监听组件变化
const unsubscribe3 = world.onComponentChanged('position', (entityId, component) => {
  console.log(`实体 ${entityId} 位置更新:`, component);
});
```

### 条件订阅

```typescript
// 监听特定条件的组件变化
const unsubscribe = world.onComponentCondition('health', 
  { current: { lte: 20 } }, // 血量低于20
  (entityId, health) => {
    console.log(`⚠️ 实体 ${entityId} 血量危险:`, health);
  }
);
```

### 查询监听

```typescript
// 监听查询结果变化
const watcher = world.watchQuery(['position', 'velocity'], (changes) => {
  console.log('可移动实体变化:', {
    新增: changes.added.length,
    移除: changes.removed.length,
    当前: changes.current.length
  });
});

// 停止监听
watcher.unsubscribe();
```

### 实时数据流

```typescript
// 创建实时数据流
const stream = world.createRealTimeStream('position');

const subscription = stream.subscribe({
  next: (positions) => {
    console.log(`📍 收到 ${positions.length} 个位置更新`);
  },
  error: (error) => {
    console.error('❌ 位置数据流错误:', error);
  }
});

// 停止订阅
subscription.unsubscribe();
```

## 🛠️ 便捷方法

### 多组件查询

```typescript
// 查询组件数据（包含实体数据）
const playerData = await world.queryWithComponentData<PlayerComponent>('player');
// 返回: [{ entityId: 'id1', data: PlayerComponent }, ...]

// 查询多组件数据
const movableData = await world.queryMultiComponentData<PositionComponent, VelocityComponent>(
  'position', 'velocity'
);
// 返回: [{ entityId: 'id1', data1: PositionComponent, data2: VelocityComponent }, ...]

// 获取实体完整状态
const entityState = await world.getEntityState('entity123');
// 返回: { entityId: 'entity123', components: { position: {...}, health: {...} } }
```

### 统计与分析

```typescript
// 获取组件统计
const stats = await world.getComponentStats();
// 返回: { position: 150, health: 120, velocity: 80, ... }

// 查找孤儿实体（只有一个组件）
const orphans = await world.findOrphanEntities();

// 获取实体总数
const totalEntities = await world.getEntityCount();
```

## 🔧 组件发现管理

### 动态刷新

```typescript
// 刷新组件缓存
await world.refreshComponentCache();

// 获取组件元数据
const metadata = await world.getComponentMetadata('position');
console.log('组件字段:', metadata?.fields);

// 检查世界状态
console.log('ECS世界是否就绪:', world.isReady());
```

### 缓存分析

```typescript
// 分析Apollo缓存结构
import { analyzeApolloCache } from './cache-helper';

const analysis = analyzeApolloCache(graphqlClient.getApolloClient());
console.log('缓存分析:', analysis);
```

## ⚡ 性能优化

### 缓存策略

```typescript
// 启用查询缓存
const entities = await world.queryWith('position', { cache: true });

// 批量查询优化
const world = createECSWorld(graphqlClient, {
  queryConfig: {
    enableBatchOptimization: true,
    maxConcurrentQueries: 20,
  }
});
```

### 订阅优化

```typescript
// 配置防抖
const unsubscribe = world.onComponentChanged('position', callback, {
  debounceMs: 100 // 100ms防抖
});

// 过滤订阅
const unsubscribe = world.onComponentCondition('health', 
  { current: { gt: 0 } }, // 只订阅血量大于0的
  callback
);
```

## 🛡️ 错误处理

```typescript
try {
  await world.initialize();
} catch (error) {
  console.error('ECS世界初始化失败:', error);
}

// 检查组件是否存在
const components = await world.getAvailableComponents();
if (components.includes('position')) {
  // 安全查询
  const entities = await world.queryWith('position');
}
```

## 🧹 资源管理

```typescript
// 取消所有订阅
world.unsubscribeAll();

// 清理缓存
world.clearCache();

// 完全清理
world.dispose();
```

## 📊 监控与调试

```typescript
// 获取配置
const config = world.getConfig();
console.log('ECS配置:', config);

// 获取底层客户端
const graphqlClient = world.getGraphQLClient();
const querySystem = world.getQuerySystem();
const subscriptionSystem = world.getSubscriptionSystem();
const componentDiscoverer = world.getComponentDiscoverer();
```

## 🎯 最佳实践

1. **初始化检查**: 始终在使用前调用 `await world.initialize()`
2. **组件验证**: 使用 `getAvailableComponents()` 验证组件存在性
3. **资源清理**: 在组件卸载时调用 `dispose()` 清理资源
4. **错误处理**: 使用try-catch包装异步操作
5. **性能优化**: 合理使用缓存和批量查询
6. **订阅管理**: 及时取消不需要的订阅

## 🚨 故障排除

### 组件未发现
- 检查GraphQL endpoint是否可访问
- 验证表名/组件名映射规则
- 尝试不同的发现策略

### 查询失败
- 确保组件已正确初始化
- 检查组件名称的正确性
- 验证GraphQL schema结构

### 订阅问题
- 确保WebSocket endpoint配置正确
- 检查服务端是否支持订阅
- 验证订阅权限设置

## 📝 更新日志

### v2.0.0 - 动态组件发现
- ✨ 新增动态组件发现系统
- 🔍 支持多种发现策略
- 🛠️ 完善的配置系统
- 📋 组件元数据支持
- 🚀 性能优化和缓存改进 