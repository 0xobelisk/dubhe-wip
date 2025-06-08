# Dubhe ECS 查询和订阅系统

基于GraphQL的Entity-Component-System (ECS) 查询和订阅系统，为Dubhe项目提供强大的实体组件查询能力。

## 🎯 核心特性

- ✅ **完整的ECS查询接口** - 支持单组件、多组件、条件查询等
- ✅ **实时订阅系统** - 监听组件变化、查询结果变化
- ✅ **查询构建器** - 链式API，支持复杂查询条件
- ✅ **性能优化** - 内置缓存、批量查询、防抖处理
- ✅ **类型安全** - 完整的TypeScript类型支持
- ✅ **易于使用** - 简洁的API设计，丰富的示例

## 📦 安装和设置

```typescript
import { createDubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import { createECSWorld } from './index';

// 创建GraphQL客户端
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  subscriptionEndpoint: 'ws://localhost:4000/graphql'
});

// 创建ECS世界
const world = createECSWorld(client);
```

## 🔍 基础查询

### 单组件查询
```typescript
// 查询拥有位置组件的所有实体
const entitiesWithPosition = await world.queryWith('position');
console.log(`找到 ${entitiesWithPosition.length} 个实体`);
```

### 多组件查询
```typescript
// 交集查询 - 拥有位置AND健康值的实体
const entitiesWithPosAndHealth = await world.queryWithAll(['position', 'health']);

// 并集查询 - 拥有位置OR速度的实体  
const entitiesWithPosOrVelocity = await world.queryWithAny(['position', 'velocity']);

// 排除查询 - 有位置但没有速度的实体
const staticEntities = await world.queryWithout(['position'], ['velocity']);
```

### 条件查询
```typescript
// 查询健康值大于50的实体
const healthyEntities = await world.queryWhere('health', {
  current: { greaterThan: 50 }
});

// 范围查询 - x坐标在0-100之间
const entitiesInRange = await world.queryRange('position', 'x', 0, 100);
```

## 🔧 查询构建器

```typescript
// 复杂查询示例
const activePlayers = await world.query()
  .with('player', 'position', 'health')     // 必须有这些组件
  .without('dead')                          // 排除死亡组件
  .where('health', { current: { greaterThan: 0 } })  // 健康值大于0
  .orderBy('player', 'level', 'DESC')      // 按等级降序
  .limit(10)                               // 限制10个结果
  .execute();
```

## 🔔 订阅系统

### 组件变化监听
```typescript
// 监听玩家组件变化
const unsubscribe = world.onComponentChanged<PlayerComponent>('player', 
  (entityId, playerData) => {
    console.log(`玩家 ${entityId} 数据更新:`, playerData);
  },
  { debounceMs: 100 } // 100ms防抖
);

// 取消订阅
unsubscribe();
```

### 条件订阅
```typescript
// 监听健康值危险的实体
const unsubscribeHealth = world.onComponentCondition<HealthComponent>(
  'health',
  { current: { lessThan: 20 } }, // 健康值小于20
  (entityId, healthData) => {
    console.log(`⚠️ 实体 ${entityId} 健康值危险!`);
  }
);
```

### 查询结果监听
```typescript
// 监听活跃玩家列表变化
const queryWatcher = world.watchQuery(
  ['player', 'position'], 
  (changes) => {
    console.log(`新增: ${changes.added.length} 个玩家`);
    console.log(`移除: ${changes.removed.length} 个玩家`);
    console.log(`当前: ${changes.current.length} 个活跃玩家`);
  }
);
```

### 实时数据流
```typescript
// 创建位置数据的实时流
const stream = world.createRealTimeStream<PositionComponent>('position');
const subscription = stream.subscribe({
  next: (positions) => {
    console.log(`收到 ${positions.length} 个位置更新`);
    positions.forEach(({ entityId, data }) => {
      console.log(`实体 ${entityId}: (${data.x}, ${data.y})`);
    });
  },
  error: (error) => console.error('数据流错误:', error)
});
```

## 🚀 高级功能

### 获取组件数据
```typescript
// 查询带组件数据的实体
const playersWithData = await world.queryWithComponentData<PlayerComponent>('player');

// 查询多组件数据
const playerDetails = await world.queryMultiComponentData<PlayerComponent, HealthComponent>(
  'player', 'health'
);

// 获取实体完整状态
const entityState = await world.getEntityState(entityId);
```

### 统计和分析
```typescript
// 组件统计
const stats = await world.getComponentStats();
console.log('组件统计:', stats);

// 查找孤儿实体（只有一个组件）
const orphans = await world.findOrphanEntities();

// 分页查询
const page1 = await world.queryPaged(['position'], 1, 10);
```

## 📊 性能优化

### 缓存
```typescript
// 启用缓存（默认开启）
const entities = await world.queryWith('position', { cache: true });

// 清理缓存
world.clearCache();
```

### 批量查询
```typescript
// 并行查询多个组件类型
const results = await Promise.all([
  world.queryWith('position'),
  world.queryWith('health'),
  world.queryWith('velocity')
]);
```

### 防抖处理
```typescript
// 订阅时使用防抖
world.onComponentChanged('position', callback, { 
  debounceMs: 200 // 200ms防抖
});
```

## 🎮 组件类型定义

```typescript
// 定义组件接口
interface PositionComponent {
  x: number;
  y: number;
}

interface HealthComponent {
  current: number;
  max: number;
}

interface PlayerComponent {
  name: string;
  level: number;
}

// 使用类型安全的查询
const playerData = await world.getComponent<PlayerComponent>(entityId, 'player');
```

## 🛠️ API 参考

### 核心接口

#### ECSWorld
- `hasEntity(entityId)` - 检查实体是否存在
- `getAllEntities()` - 获取所有实体ID
- `getEntityCount()` - 获取实体总数
- `hasComponent(entityId, componentType)` - 检查组件是否存在
- `getComponent<T>(entityId, componentType)` - 获取组件数据
- `getComponents(entityId)` - 获取实体的所有组件类型

#### 查询方法
- `queryWith(componentType, options?)` - 单组件查询
- `queryWithAll(componentTypes, options?)` - 多组件交集查询
- `queryWithAny(componentTypes, options?)` - 多组件并集查询
- `queryWithout(include, exclude, options?)` - 排除查询
- `queryWhere(componentType, predicate, options?)` - 条件查询
- `queryRange(componentType, field, min, max, options?)` - 范围查询

#### 订阅方法
- `onComponentAdded<T>(componentType, callback, options?)` - 监听组件添加
- `onComponentRemoved<T>(componentType, callback, options?)` - 监听组件移除
- `onComponentChanged<T>(componentType, callback, options?)` - 监听组件变化
- `watchQuery(componentTypes, callback, options?)` - 监听查询结果变化

### 查询选项

```typescript
interface QueryOptions {
  limit?: number;           // 限制结果数量
  orderBy?: OrderBy[];      // 排序选项
  cache?: boolean;          // 是否使用缓存
}

interface SubscriptionOptions {
  initialEvent?: boolean;   // 是否触发初始事件
  debounceMs?: number;      // 防抖延迟（毫秒）
  filter?: Record<string, any>; // 额外过滤条件
}
```

## 🔧 资源管理

```typescript
// 取消所有订阅
world.unsubscribeAll();

// 清理缓存
world.clearCache();

// 完全清理资源
world.dispose();
```

## 📝 最佳实践

1. **合理使用缓存** - 对于频繁查询的数据启用缓存
2. **批量查询** - 使用Promise.all并行查询多个组件
3. **防抖订阅** - 对于高频变化的组件使用防抖
4. **及时清理** - 组件卸载时取消订阅和清理资源
5. **类型安全** - 定义明确的组件接口，使用泛型

## 🐛 故障排除

### 常见问题

1. **查询返回空结果**
   - 检查组件类型名称是否正确
   - 确认GraphQL端点可访问
   - 验证表中是否有数据

2. **订阅不工作**
   - 确认WebSocket端点配置正确
   - 检查网络连接
   - 验证PostGraphile Listen配置

3. **性能问题**
   - 启用查询缓存
   - 使用分页查询大数据集
   - 合理设置防抖时间

## 📚 更多示例

查看 `examples.ts` 文件获取完整的使用示例，包括：
- 基础查询示例
- 查询构建器示例  
- 订阅系统示例
- 高级功能示例
- 性能测试示例

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个ECS系统！ 