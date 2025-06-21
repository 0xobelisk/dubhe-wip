# ECS 包更新文档

## 概述

本次更新为 ECS 包添加了基于 **DubheMetadata JSON 格式**的自动配置解析功能，实现了 Components 和 Resources 的正确分离，并为每种类型提供了专门的查询方法。

## 主要变化

### 1. 灵活的配置方式

**DubheMetadata 现在是可选项**，系统支持多种配置方式：

```typescript
// 方式1: 从 GraphQL client 获取 dubheMetadata（推荐）
const graphqlClient = createDubheGraphqlClient({
  endpoint: 'http://localhost:3001/graphql',
  dubheMetadata: jsonMetadata, // 在 GraphQL client 中提供
});
const world = createECSWorld(graphqlClient); // 自动获取

// 方式2: 在 ECS config 中显式提供
const world = createECSWorld(graphqlClient, {
  dubheMetadata: jsonMetadata, // 显式提供
});

// 方式3: 最简配置（仅需要 GraphQL client）
const world = createECSWorld(graphqlClient); // 使用所有默认值
```

### 2. 智能元数据获取

系统按以下优先级获取 DubheMetadata：
1. **ECS Config** 中显式提供的 `dubheMetadata`
2. **GraphQL Client** 中的 `dubheMetadata`
3. 如果都没有，抛出清晰的错误信息

### 3. 自动类型分离

系统会自动根据主键配置将表分为两类：

- **ECS Components** - 单主键表，用于传统ECS操作
- **Resources** - 复合主键或无主键表，用于资源管理

### 4. 新增类型定义

```typescript
// DubheMetadata JSON 格式
export type DubheMetadata = {
  components: Array<
    Record<
      string,
      {
        fields: Array<Record<string, any>>;
        keys: string[];
      }
    >
  >;
  resources: Array<
    Record<
      string,
      {
        fields: Array<Record<string, any>>;
        keys: string[];
      }
    >
  >;
  enums: any[];
};

// ECS世界配置（所有字段都是可选的）
export interface ECSWorldConfig {
  dubheMetadata?: DubheMetadata; // 可选，从 GraphQL client 获取
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

### 5. 分离规则

#### ECS Components（单主键表）
- **条件**：`primaryKeys.length === 1`
- **用途**：传统ECS实体-组件操作
- **方法**：`queryWith()`, `onComponentChanged()`, `getComponent()` 等

#### Resources（复合主键或无主键表）
- **条件**：`primaryKeys.length !== 1`
- **用途**：资源管理和全局状态
- **方法**：`getResource()`, `getResources()`, `subscribeToResourceChanges()` 等

## 使用示例

### 配置 DubheMetadata

```typescript
const dubheMetadata: DubheMetadata = {
  components: [
    {
      // ECS组件：单主键
      Player: {
        fields: [{ name: 'string' }, { level: 'u32' }],
        keys: [], // 空数组 = 使用默认 entityId
      },
    },
    {
      // ECS组件：自定义单主键
      UserProfile: {
        fields: [{ userId: 'string' }, { email: 'string' }],
        keys: ['userId'], // 单主键
      },
    },
  ],
  
  resources: [
    {
      // 资源：复合主键
      Position: {
        fields: [{ x: 'u32' }, { y: 'u32' }],
        keys: ['x', 'y'], // 复合主键
      },
    },
    {
      // 资源：无主键
      GameLog: {
        fields: [{ action: 'string' }, { data: 'string' }],
        keys: [], // 无主键
      },
    },
  ],

  enums: [],
};
```

### 创建 ECS World

#### 方式1：从 GraphQL Client 获取（推荐）

```typescript
import { createDubheGraphqlClient, createECSWorld } from '@0xobelisk/ecs';

// 创建GraphQL客户端，包含dubheMetadata
const graphqlClient = createDubheGraphqlClient({
  endpoint: 'http://localhost:3001/graphql',
  subscriptionEndpoint: 'ws://localhost:3001/graphql',
  dubheMetadata, // 在 GraphQL client 中提供
});

// 创建ECS世界 - 自动从 GraphQL client 获取 dubheMetadata
const world = createECSWorld(graphqlClient, {
  queryConfig: {
    defaultCacheTimeout: 5 * 60 * 1000,
    maxConcurrentQueries: 10,
    enableBatchOptimization: true,
  },
});
```

#### 方式2：显式提供 DubheMetadata

```typescript
// 创建GraphQL客户端（不包含dubheMetadata）
const graphqlClient = createDubheGraphqlClient({
  endpoint: 'http://localhost:3001/graphql',
  subscriptionEndpoint: 'ws://localhost:3001/graphql',
});

// 创建ECS世界 - 显式提供 dubheMetadata
const world = createECSWorld(graphqlClient, {
  dubheMetadata, // 在 ECS config 中显式提供
  subscriptionConfig: {
    defaultDebounceMs: 100,
    maxSubscriptions: 50,
    reconnectOnError: true,
  },
});
```

#### 方式3：最简配置

```typescript
// 创建GraphQL客户端，包含dubheMetadata
const graphqlClient = createDubheGraphqlClient({
  endpoint: 'http://localhost:3001/graphql',
  dubheMetadata,
});

// 最简配置 - 使用所有默认值
const world = createECSWorld(graphqlClient);
```

### 查询示例

#### ECS Components 查询

```typescript
// 查询拥有特定组件的所有实体
const playerEntities = await world.queryWith('Player');

// 获取特定实体的组件数据
const playerData = await world.getComponent<PlayerComponent>('entity123', 'Player');

// 订阅组件变化
const subscription = world.onComponentChanged<PlayerComponent>('Player', {
  onData: (data) => console.log('Player changed:', data),
});
```

#### Resources 查询

```typescript
// 查询单个资源（根据主键）
const position = await world.getResource<PositionResource>('Position', {
  x: 10,
  y: 20,
});

// 查询多个资源
const gameLogs = await world.getResources<GameLogResource>('GameLog', {
  action: 'player_move',
});

// 订阅资源变化
const resourceSub = world.subscribeToResourceChanges<PositionResource>('Position', {
  filter: { x: { greaterThan: 0 } },
  onData: (data) => console.log('Position changed:', data),
});
```

## API 参考

### 工厂函数

```typescript
createECSWorld(
  graphqlClient: DubheGraphqlClient,
  config?: Partial<ECSWorldConfig> // 现在是可选的
): DubheECSWorld
```

### World 方法

#### ECS Components
- `getAvailableComponents()` - 获取所有ECS组件类型
- `getComponentMetadata(type)` - 获取组件元数据
- `queryWith(component, options?)` - 查询拥有组件的实体
- `getComponent<T>(entityId, component)` - 获取实体组件数据
- `onComponentChanged<T>(component, options?)` - 订阅组件变化

#### Resources
- `getAvailableResources()` - 获取所有资源类型
- `getResourceMetadata(type)` - 获取资源元数据
- `getResource<T>(type, keyValues, options?)` - 查询单个资源
- `getResources<T>(type, filters?, options?)` - 查询多个资源
- `subscribeToResourceChanges<T>(type, options?)` - 订阅资源变化

#### 配置
- `getDubheMetadata()` - 获取JSON格式元数据
- `configure(config)` - 动态更新配置

## 升级指南

### 从旧版本升级

1. **现在 config 参数是可选的**：
   ```typescript
   // ✅ 新版本 - 更简洁
   const world = createECSWorld(graphqlClient); // config 可选
   
   // ✅ 也支持完整配置
   const world = createECSWorld(graphqlClient, {
     dubheMetadata, // 可选
     queryConfig: { /* ... */ },
   });
   ```

2. **推荐使用 GraphQL client 提供 dubheMetadata**：
   ```typescript
   // ✅ 推荐方式
   const graphqlClient = createDubheGraphqlClient({
     endpoint: 'http://localhost:3001/graphql',
     dubheMetadata, // 在这里提供
   });
   const world = createECSWorld(graphqlClient);
   ```

3. **错误处理更清晰**：
   ```typescript
   // 如果没有提供 dubheMetadata，会得到清晰的错误信息
   try {
     const world = createECSWorld(graphqlClientWithoutMetadata);
   } catch (error) {
     console.log(error.message);
     // "DubheMetadata is required for ECS World initialization. 
     //  Please provide it either in ECSWorldConfig or in GraphQL client configuration."
   }
   ```

## 优势

1. **灵活性**：支持多种配置方式，适应不同使用场景
2. **简化**：最简情况下只需要 GraphQL client
3. **一致性**：与 GraphQL client 共享 dubheMetadata，避免重复配置
4. **智能获取**：自动选择最佳的 metadata 来源
5. **向后兼容**：现有代码无需修改即可工作
6. **类型安全**：提供完整的TypeScript类型支持

## 故障排除

### 常见问题

1. **元数据未找到错误**：
   ```
   DubheMetadata is required for ECS World initialization.
   ```
   **解决**：确保在 GraphQL client 或 ECS config 中提供了 dubheMetadata

2. **组件未发现**：
   检查组件是否为单主键表，复合主键表会被分类为资源

3. **优先级问题**：
   ECS config 中的 dubheMetadata 优先级高于 GraphQL client 中的

### 调试信息

系统会自动显示 metadata 来源：
```typescript
// 控制台输出示例：
// 📥 Using DubheMetadata from GraphQL client
// 📥 Using DubheMetadata from ECS config
```

查看发现结果：
```typescript
console.log('ECS Components:', world.getAvailableComponents());
console.log('Resources:', world.getAvailableResources());
```

## 示例项目

参考 `packages/ecs/scripts/examples-dubhe-config.ts` 获取完整示例，包含所有三种配置方式的演示。 