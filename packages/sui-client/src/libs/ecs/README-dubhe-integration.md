# ECS + Dubhe Config 集成指南

## 🎯 概述

ECS系统现已完全支持Dubhe配置自动化，提供零配置的组件发现和字段解析功能。这是使用ECS的推荐方式。

## ✨ 新功能

### 1. 自动组件发现
- **从Dubhe配置自动发现组件**：无需手动指定组件列表
- **智能字段解析**：自动解析字段名、类型和主键配置
- **枚举字段支持**：自动识别和处理枚举字段
- **主键配置**：支持单主键、复合主键和无主键表

### 2. 零配置使用
```typescript
// 最简单的使用方式
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  dubheConfig: yourDubheConfig, // 🆕 传入dubhe配置
});

const world = createECSWorld(client); // 🆕 自动检测并配置
await world.initialize(); // 🆕 自动发现所有组件

// 立即可用的查询
const players = await world.queryWith('player');
```

### 3. 增强的组件元数据
- **完整字段信息**：包含字段类型、是否可空、是否为主键等
- **枚举字段标识**：自动标识哪些字段是枚举类型
- **主键配置**：准确的主键字段列表
- **系统字段**：自动添加 `createdAt` 和 `updatedAt`

## 🚀 快速开始

### 基础示例

```typescript
import { createDubheGraphqlClient, createECSWorld } from '@obelisk/sui-client';

// 1. 定义Dubhe配置
const dubheConfig = {
  name: 'my-game',
  components: {
    player: {
      keys: ['id'],
      fields: {
        name: { type: 'string' },
        level: { type: 'u32' },
        player_type: { type: 'PlayerType' },
      },
    },
    position: {
      keys: ['entity_id'],
      fields: {
        entity_id: { type: 'string' },
        x: { type: 'u32' },
        y: { type: 'u32' },
      },
    },
  },
  enums: {
    PlayerType: ['warrior', 'mage', 'archer'],
  },
};

// 2. 创建客户端（自动配置）
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  dubheConfig,
});

// 3. 创建ECS世界（零配置）
const world = createECSWorld(client);

// 4. 初始化（自动发现组件）
await world.initialize();

// 5. 立即使用
const players = await world.queryWith('player');
const positions = await world.queryWith('position');
```

### 高级配置

```typescript
// 手动配置组件发现策略
const world = createECSWorld(client, {
  dubheConfig,
  componentDiscovery: {
    strategy: 'dubhe-config', // 明确指定策略
    includePatterns: ['player*', 'item*'], // 过滤组件
    excludePatterns: ['*_internal'],
  },
  queryConfig: {
    enableAutoFieldResolution: true, // 启用自动字段解析
    enableBatchOptimization: true,
  },
});
```

## 📋 支持的配置格式

### 主键配置
```typescript
components: {
  // 单主键
  player: {
    keys: ['id'], // 单主键
  },
  
  // 复合主键
  inventory: {
    keys: ['player_id', 'item_id'], // 复合主键
  },
  
  // 无主键
  log: {
    keys: [], // 无主键表
  },
  
  // 默认ID主键
  item: {
    // keys 未定义，使用默认id主键
  },
}
```

### 字段类型映射
| Dubhe类型 | GraphQL类型 | 说明 |
|-----------|-------------|------|
| `u8`, `u16`, `u32`, `u64` | `Int` | 整数类型 |
| `i8`, `i16`, `i32`, `i64` | `Int` | 有符号整数 |
| `address`, `string` | `String` | 字符串类型 |
| `bool` | `Boolean` | 布尔类型 |
| 枚举类型名 | `String` | 枚举值 |

## 🔧 组件发现策略

### 1. `dubhe-config` (推荐)
```typescript
componentDiscovery: {
  strategy: 'dubhe-config',
  dubheConfig: yourConfig,
}
```
- ✅ **完整类型信息**：从dubhe配置获取准确的字段类型
- ✅ **主键配置**：正确的主键和复合主键支持
- ✅ **枚举支持**：自动识别枚举字段
- ✅ **零配置**：无需手动维护组件列表

### 2. `manual` (向后兼容)
```typescript
componentDiscovery: {
  strategy: 'manual',
  componentTypes: ['player', 'item', 'position'],
}
```
- ⚠️ **手动维护**：需要手动指定组件列表
- ⚠️ **类型推断**：字段类型通过采样推断，可能不准确

### 3. `cache-analysis` (实验性)
```typescript
componentDiscovery: {
  strategy: 'cache-analysis',
  candidateTableNames: ['player', 'item', 'position'],
}
```
- ⚠️ **需要候选列表**：需要提供可能的表名
- ⚠️ **不完整信息**：无法获取完整的类型和主键信息

## 📊 元数据增强

### 组件元数据示例
```typescript
const playerMeta = await world.getComponentMetadata('player');
console.log(playerMeta);
// 输出:
{
  name: 'player',
  tableName: 'player',
  primaryKeys: ['id'],
  hasDefaultId: true,
  enumFields: ['playerType'],
  fields: [
    {
      name: 'id',
      type: 'ID',
      nullable: false,
      isPrimaryKey: true,
      isEnum: false,
    },
    {
      name: 'playerType',
      type: 'String',
      nullable: true,
      isPrimaryKey: false,
      isEnum: true,
    },
    // ...更多字段
  ],
  description: '从dubhe配置自动发现的组件: player',
  lastUpdated: 1234567890,
}
```

## 🎮 实际示例

查看完整的示例代码：
- `examples-dubhe-config.ts` - 完整示例集合
- `basicDubheConfigExample()` - 基础用法
- `advancedDubheConfigExample()` - 高级配置
- `zeroConfigExample()` - 零配置示例
- `subscriptionDubheConfigExample()` - 订阅示例

## 🔄 迁移指南

### 从手动配置迁移

**旧方式:**
```typescript
const world = createECSWorld(client, {
  componentDiscovery: {
    strategy: 'manual',
    componentTypes: ['player', 'item', 'position'],
  },
});
```

**新方式:**
```typescript
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  dubheConfig: yourDubheConfig, // 🆕
});

const world = createECSWorld(client); // 🆕 自动配置
```

### 兼容性

- ✅ **完全向后兼容**：现有代码无需修改
- ✅ **渐进迁移**：可以逐步迁移到新方式
- ✅ **混合使用**：可以同时使用多种发现策略

## 🚨 注意事项

1. **字段命名转换**：dubhe的 `snake_case` 字段会自动转换为 `camelCase`
2. **系统字段**：所有表都会自动添加 `createdAt` 和 `updatedAt` 字段
3. **枚举处理**：枚举字段在GraphQL中表示为 `String` 类型
4. **主键配置**：确保dubhe配置中的主键配置与实际数据库schema一致

## 🔗 相关文档

- [Dubhe GraphQL Client 文档](../dubheGraphqlClient/README.md)
- [ECS 核心概念](./README.md)
- [组件发现详解](./README-discovery.md)
- [查询系统指南](./README-queries.md) 