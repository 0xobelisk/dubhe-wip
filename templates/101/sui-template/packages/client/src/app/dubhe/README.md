# Dubhe 客户端使用指南

这个模块将 GraphQL 客户端、ECS World 和 Sui 合约封装到 `useContract` hook 中，让前端可以方便地使用这些功能。

## 快速开始

### 1. 环境变量配置

在 `.env.local` 文件中添加以下环境变量：

```bash
# GraphQL 端点
NEXT_PUBLIC_GRAPHQL_ENDPOINT=http://localhost:4000/graphql
NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT=ws://localhost:4000/graphql

# Sui 私钥（用于交易签名）
NEXT_PUBLIC_PRIVATE_KEY=your_private_key_here
```

### 2. 基本使用

```tsx
import { useContract } from './dubhe/useContract';

function MyComponent() {
  const { contract, graphqlClient, ecsWorld, initializeECS } = useContract();
  
  // 使用示例...
}
```

## 功能介绍

### 🔧 useContract() 返回的对象

- **contract**: Sui 合约客户端，用于链上交易
- **graphqlClient**: GraphQL 客户端，用于数据查询和订阅
- **ecsWorld**: ECS World 实例，用于实体-组件-系统模式的数据访问
- **metadata**: 合约元数据
- **initializeECS()**: 异步初始化 ECS World
- **getAvailableComponents()**: 获取所有可用组件
- **queryEntitiesByComponent()**: 查询拥有特定组件的实体
- **getEntityData()**: 获取实体完整数据
- **subscribeToComponent()**: 订阅组件变化

## 使用场景

### 📊 数据查询

#### 使用 GraphQL 客户端
```tsx
// 查询表数据（支持分页、过滤、排序）
const players = await graphqlClient.getAllTables('player', {
  first: 10,
  orderBy: [{ field: 'createdAt', direction: 'DESC' }],
  filter: { level: { greaterThan: 5 } }
});

// 查询单条数据
const player = await graphqlClient.getTableByCondition('player', {
  id: 'player123'
});
```

#### 使用 ECS World
```tsx
// 初始化 ECS World
await initializeECS();

// 查询拥有特定组件的实体
const playerEntities = await ecsWorld.getEntitiesByComponent('player');

// 获取实体完整数据
const entityData = await ecsWorld.getEntity('entity123');

// 检查实体是否有特定组件
const hasPlayerComponent = await ecsWorld.hasComponent('entity123', 'player');

// 获取实体的特定组件数据
const playerData = await ecsWorld.getComponent('entity123', 'player');
```

### 📡 实时订阅

#### GraphQL 订阅
```tsx
// 订阅表变化
const subscription = graphqlClient.subscribeToTableChanges('player', {
  fields: ['id', 'name', 'level'],
  initialEvent: true
});

subscription.subscribe({
  next: (data) => console.log('数据更新:', data),
  error: (err) => console.error('订阅错误:', err)
});
```

#### ECS 组件订阅
```tsx
// 订阅组件变化
const unsubscribe = ecsWorld.onComponentChanged('player', (entityId, component) => {
  console.log(`实体 ${entityId} 的玩家组件发生变化:`, component);
});

// 取消订阅
unsubscribe();
```

### ⛓️ 链上交易

```tsx
// 调用合约方法
try {
  const result = await contract.tx.some_method({
    // 方法参数
  });
  console.log('交易成功:', result);
} catch (error) {
  console.error('交易失败:', error);
}
```

## 高级功能

### 🔄 批量查询
```tsx
// GraphQL 批量查询
const batchResults = await graphqlClient.batchQuery([
  { key: 'players', tableName: 'player', params: { first: 10 } },
  { key: 'positions', tableName: 'position', params: { first: 10 } }
]);
```

### 🎯 复杂查询
```tsx
// ECS 复合查询
const entities = await ecsWorld.queryWithAll(['player', 'position']); // 同时拥有两个组件
const entitiesAny = await ecsWorld.queryWithAny(['player', 'npc']); // 拥有任一组件
const filtered = await ecsWorld.queryWhere('player', { level: { greaterThan: 10 } }); // 条件查询
```

### 🗂️ 全局配置和资源表
```tsx
// 查询全局配置（无主键表）
const globalConfig = await ecsWorld.getGlobalConfig('game_settings');

// 查询资源（复合主键表）
const resource = await ecsWorld.getResource('equipment', {
  player_id: 'player123',
  slot: 'weapon'
});
```

## 最佳实践

### 1. 初始化管理
```tsx
useEffect(() => {
  const init = async () => {
    try {
      await initializeECS();
      console.log('ECS 初始化成功');
    } catch (error) {
      console.error('ECS 初始化失败:', error);
    }
  };
  init();
}, []);
```

### 2. 错误处理
```tsx
try {
  const data = await graphqlClient.getAllTables('player');
  // 处理数据
} catch (error) {
  if (error.message.includes('network')) {
    // 网络错误处理
  } else {
    // 其他错误处理
  }
}
```

### 3. 订阅清理
```tsx
useEffect(() => {
  const unsubscribe = ecsWorld.onComponentChanged('player', handlePlayerChange);
  
  return () => {
    unsubscribe(); // 组件卸载时清理订阅
  };
}, []);
```

### 4. 性能优化
```tsx
// 使用缓存
const result = await graphqlClient.getAllTables('player', {
  // 查询参数
}, {
  cachePolicy: 'cache-first' // 优先使用缓存
});

// 限制查询结果
const limitedResults = await ecsWorld.queryWith('player', {
  limit: 50 // 限制结果数量
});
```

## 类型安全

定义你的数据类型以获得更好的 TypeScript 支持：

```tsx
interface Player {
  id: string;
  name: string;
  level: number;
  createdAt: string;
  updatedAt: string;
}

// 使用泛型
const players = await graphqlClient.getAllTables<Player>('player');
const playerComponent = await ecsWorld.getComponent<Player>('entity123', 'player');
```

## 故障排除

### 常见问题

1. **ECS 初始化失败**
   - 检查 GraphQL 端点是否可访问
   - 确认 dubhe 配置是否正确

2. **订阅连接失败**
   - 检查 WebSocket 端点配置
   - 确认服务器支持 WebSocket

3. **合约调用失败**
   - 检查私钥配置
   - 确认网络连接和合约地址

### 调试提示

开启详细日志：
```tsx
// 在浏览器控制台查看详细的客户端日志
console.log('GraphQL 客户端:', graphqlClient);
console.log('ECS World 配置:', ecsWorld.getConfig());
```

## 示例项目

查看 `example-usage.tsx` 文件获取完整的使用示例，包括：
- 数据查询和显示
- 实时订阅
- 错误处理
- UI 交互

这个示例展示了如何在 React 组件中集成所有功能。 