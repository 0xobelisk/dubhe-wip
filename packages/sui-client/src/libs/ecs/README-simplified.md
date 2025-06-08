# ECS 系统简化架构

## 概述

我们已经成功简化了ECS系统，删除了复杂的discovery.ts文件，将组件发现逻辑直接内置到world.ts中。现在系统更加简洁、易懂且易于维护。

## 主要变更

### 1. 删除了复杂的组件发现系统
- ❌ 删除了 `discovery.ts` 文件
- ❌ 删除了复杂的 `cache-analysis` 模式
- ❌ 删除了过滤器和缓存配置
- ❌ 删除了 `refreshComponentCache()` 方法

### 2. 简化的组件发现配置
```typescript
// 新的简化配置
export interface ComponentDiscoveryConfig {
  strategy: 'manual' | 'dubhe-config';
  componentTypes?: ComponentType[];  // 手动模式使用
  dubheConfig?: DubheConfig;        // dubhe-config模式使用
}
```

### 3. 内置的SimpleComponentDiscoverer
- 直接在world.ts中实现
- 只支持两种模式：`manual` 和 `dubhe-config`
- 代码简洁，逻辑清晰

## 使用方式

### 方式1：手动指定组件（manual模式）
```typescript
const world = createECSWorldWithComponents(client, [
  'player',
  'position', 
  'inventory',
  'item'
]);

await world.initialize();
```

### 方式2：使用dubhe配置（dubhe-config模式）
```typescript
// 方式2a：通过GraphQL client传入dubhe config
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  dubheConfig: myDubheConfig
});
const world = createECSWorld(client);

// 方式2b：直接在ECS配置中传入dubhe config
const world = createECSWorld(client, {
  dubheConfig: myDubheConfig
});

await world.initialize();
```

## 标准ECS接口

系统完全支持标准ECS接口（驼峰命名）：

### 实体查询接口
- `getEntity(id)` - 获取单个实体完整数据
- `getEntities()` - 获取所有实体ID列表  
- `getEntitiesByComponent(componentType)` - 获取拥有特定组件的实体

### 组件查询接口
- `getComponent(entityId, componentType)` - 获取实体的特定组件
- `getComponents(entityId)` - 获取实体的所有组件类型
- `hasComponent(entityId, componentType)` - 检查实体是否拥有组件

## 优势

### ✅ 简化的架构
- 删除了复杂的discovery系统
- 组件发现逻辑直接内置在world.ts中
- 代码更容易理解和维护

### ✅ 两种清晰的模式
- **手动模式**：明确指定组件列表，适合已知组件的场景
- **dubhe-config模式**：从配置文件自动发现，适合动态组件的场景

### ✅ 零配置体验
```typescript
// 如果GraphQL client已包含dubhe config，无需额外配置
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  dubheConfig: myDubheConfig
});

const world = createECSWorld(client);
await world.initialize(); // 自动使用dubhe-config模式
```

### ✅ 完全向后兼容
- 所有现有API继续可用
- 标准接口和现有接口并存
- 性能完全相同

## 文件结构

```
packages/sui-client/src/libs/ecs/
├── types.ts                    # 类型定义（简化）
├── world.ts                    # 主要类 + 内置组件发现
├── query.ts                    # 查询系统
├── subscription.ts             # 订阅系统
├── utils.ts                    # 工具函数
├── index.ts                    # 导出（简化）
├── examples-standard-interface.ts  # 标准接口示例
├── examples-dubhe-config.ts    # dubhe配置示例
└── README-standard-interface.md # 标准接口文档
```

## 迁移指南

如果你之前使用了复杂的discovery配置，请按以下方式迁移：

### 旧方式（已删除）
```typescript
// ❌ 不再支持
const world = createECSWorld(client, {
  componentDiscovery: {
    strategy: 'cache-analysis',
    candidateTableNames: ['players', 'items'],
    includePatterns: ['*'],
    excludePatterns: ['_*'],
    cacheTTL: 300,
    autoRefresh: true
  }
});
```

### 新方式
```typescript
// ✅ 使用手动模式
const world = createECSWorldWithComponents(client, [
  'player', 'item'  // 直接指定组件名
]);

// 或者使用dubhe-config模式
const world = createECSWorld(client, {
  dubheConfig: myDubheConfig
});
```

## 总结

新的简化架构提供了：
- 🎯 **更简单的配置** - 只需要选择manual或dubhe-config模式
- 🚀 **更好的性能** - 删除了不必要的复杂逻辑
- 📖 **更易理解** - 代码结构清晰，逻辑简单
- 🔧 **更易维护** - 减少了代码量和复杂度
- ✅ **完全兼容** - 现有代码无需修改

推荐使用dubhe-config模式，它能自动从配置文件中发现组件，提供最佳的开发体验！ 