# ECS 标准接口规范（驼峰命名）

本文档描述了 Dubhe ECS 系统的标准接口规范，使用驼峰命名格式以保持与现有API的一致性。

## 📋 概述

ECS系统现在完全符合标准的ECS接口规范，提供统一的、语义明确的接口方法。这些标准接口遵循经典的ECS架构设计原则。

## 🎯 标准接口规范

### 实体查询接口

| 方法名 | 参数 | 返回值 | 描述 |
|--------|------|--------|------|
| `getEntity(id)` | `id: EntityId` | `Promise<any \| null>` | 获取单个实体的完整数据 |
| `getEntities()` | 无 | `Promise<EntityId[]>` | 获取所有实体ID列表 |
| `getEntitiesByComponent(componentType)` | `componentType: ComponentType` | `Promise<EntityId[]>` | 获取拥有特定组件的所有实体 |

### 组件查询接口

| 方法名 | 参数 | 返回值 | 描述 |
|--------|------|--------|------|
| `getComponent(entityId, componentType)` | `entityId: EntityId`<br/>`componentType: ComponentType` | `Promise<any \| null>` | 获取实体的特定组件数据 |
| `getComponents(entityId)` | `entityId: EntityId` | `Promise<ComponentType[]>` | 获取实体拥有的所有组件类型 |
| `hasComponent(entityId, componentType)` | `entityId: EntityId`<br/>`componentType: ComponentType` | `Promise<boolean>` | 检查实体是否拥有特定组件 |

## 🚀 使用示例

### 基础使用

```typescript
import { createDubheGraphqlClient, createECSWorld } from '@obelisk/sui-client';

// 创建ECS世界
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  dubheConfig: yourDubheConfig,
});

const world = createECSWorld(client);
await world.initialize();

// ============ 实体查询接口 ============

// 获取所有实体
const allEntities = await world.getEntities();
console.log('所有实体:', allEntities);

// 获取单个实体的完整数据
const entityData = await world.getEntity('player_001');
console.log('实体完整数据:', entityData);
// 输出示例:
// {
//   id: 'player_001',
//   components: {
//     player: { name: 'Alice', level: 25 },
//     position: { x: 100, y: 200 },
//     health: { current: 80, max: 100 }
//   }
// }

// 获取拥有特定组件的所有实体
const playerEntities = await world.getEntitiesByComponent('player');
console.log('所有玩家实体:', playerEntities);

// ============ 组件查询接口 ============

// 检查实体是否拥有特定组件
const hasPlayer = await world.hasComponent('entity_001', 'player');
console.log('拥有玩家组件:', hasPlayer);

// 获取实体的特定组件数据
const playerData = await world.getComponent('entity_001', 'player');
console.log('玩家组件数据:', playerData);

// 获取实体的所有组件类型
const allComponents = await world.getComponents('entity_001');
console.log('实体的所有组件:', allComponents);
```

### 游戏系统示例

```typescript
// 移动系统：处理所有可移动的实体
async function movementSystem(world: ECSWorld) {
  // 获取所有拥有位置组件的实体
  const entitiesWithPosition = await world.getEntitiesByComponent('position');
  
  for (const entityId of entitiesWithPosition) {
    // 检查是否也有移动组件
    const canMove = await world.hasComponent(entityId, 'velocity');
    
    if (canMove) {
      // 获取位置和速度数据
      const position = await world.getComponent(entityId, 'position');
      const velocity = await world.getComponent(entityId, 'velocity');
      
      // 更新位置（这里只是示例逻辑）
      console.log(`移动实体 ${entityId} 从 (${position.x}, ${position.y})`);
    }
  }
}

// 战斗系统：处理具有战斗能力的实体
async function combatSystem(world: ECSWorld) {
  // 获取所有拥有生命值组件的实体
  const entitiesWithHealth = await world.getEntitiesByComponent('health');
  
  for (const entityId of entitiesWithHealth) {
    // 检查是否也有攻击组件
    const canAttack = await world.hasComponent(entityId, 'attack');
    
    if (canAttack) {
      const health = await world.getComponent(entityId, 'health');
      const attack = await world.getComponent(entityId, 'attack');
      
      console.log(`战斗单位 ${entityId}: HP ${health.current}/${health.max}, ATK ${attack.damage}`);
    }
  }
}

// 物品管理系统
async function inventorySystem(world: ECSWorld) {
  // 获取所有拥有背包组件的实体
  const entitiesWithInventory = await world.getEntitiesByComponent('inventory');
  
  for (const entityId of entitiesWithInventory) {
    // 获取完整的实体状态
    const entityData = await world.getEntity(entityId);
    
    if (entityData) {
      console.log(`实体 ${entityId} 的完整状态:`, entityData);
    }
  }
}
```

### 查询优化示例

```typescript
// 批量查询优化
async function optimizedQueries(world: ECSWorld) {
  // 并行查询多个组件的实体
  const [
    playerEntities,
    itemEntities,
    npcEntities
  ] = await Promise.all([
    world.getEntitiesByComponent('player'),
    world.getEntitiesByComponent('item'),
    world.getEntitiesByComponent('npc')
  ]);
  
  console.log(`找到: ${playerEntities.length} 玩家, ${itemEntities.length} 物品, ${npcEntities.length} NPC`);
  
  // 针对特定实体批量获取组件
  if (playerEntities.length > 0) {
    const playerId = playerEntities[0];
    
    // 并行获取多个组件
    const [playerData, positionData, inventoryData] = await Promise.all([
      world.getComponent(playerId, 'player'),
      world.getComponent(playerId, 'position'),
      world.getComponent(playerId, 'inventory')
    ]);
    
    console.log('玩家数据:', { playerData, positionData, inventoryData });
  }
}
```

## 🔄 与现有API的关系

### 兼容性对照表

| 标准接口 | 现有API | 关系 |
|----------|---------|------|
| `getEntities()` | `getAllEntities()` | 完全等价 |
| `getEntitiesByComponent()` | `queryWith()` | 完全等价 |
| `getComponent()` | `getComponent()` | 完全等价 |
| `getComponents()` | `getComponents()` | 完全等价 |
| `hasComponent()` | `hasComponent()` | 完全等价 |
| `getEntity()` | `getEntityState()` | 功能相似，返回格式略有不同 |

### 完全向后兼容

```typescript
// ✅ 新标准接口
const entities = await world.getEntities();
const hasComp = await world.hasComponent('id1', 'player');

// ✅ 现有API（继续可用）
const entities2 = await world.getAllEntities();
const hasComp2 = await world.hasComponent('id1', 'player');

// 两者结果完全一致
console.log(entities === entities2); // true
console.log(hasComp === hasComp2);   // true
```

## ⚡ 性能特性

### 1. 零性能开销
- 标准接口方法直接委托给现有实现
- 没有额外的转换或包装开销
- 编译时优化，运行时性能一致

### 2. 相同的缓存策略
- 标准接口享受相同的查询缓存
- 智能的结果缓存和失效机制
- 批量查询优化

### 3. 相同的错误处理
- 统一的错误处理和重试机制
- 完整的错误日志和调试信息

## 🎯 最佳实践

### 1. 接口选择建议

```typescript
// ✅ 推荐：使用标准接口（更清晰的语义）
const entities = await world.getEntities();
const playerData = await world.getComponent(entityId, 'player');

// ✅ 也可以：使用现有API（更简洁的命名）
const entities2 = await world.getAllEntities();
const playerData2 = await world.getComponent(entityId, 'player');

// 💡 建议：在新项目中使用标准接口，现有项目可继续使用原有API
```

### 2. 错误处理

```typescript
// 标准的错误处理模式
async function safeEntityAccess(world: ECSWorld, entityId: string) {
  try {
    // 先检查实体是否存在（通过获取组件列表）
    const components = await world.getComponents(entityId);
    
    if (components.length === 0) {
      console.log(`实体 ${entityId} 不存在或无组件`);
      return null;
    }
    
    // 获取完整实体数据
    const entityData = await world.getEntity(entityId);
    return entityData;
    
  } catch (error) {
    console.error(`访问实体 ${entityId} 失败:`, error);
    return null;
  }
}
```

### 3. 类型安全

```typescript
// 使用泛型确保类型安全
interface PlayerComponent {
  name: string;
  level: number;
  experience: number;
}

interface PositionComponent {
  x: number;
  y: number;
  mapId: string;
}

// 类型安全的组件获取
const playerData = await world.getComponent(entityId, 'player') as PlayerComponent;
const positionData = await world.getComponent(entityId, 'position') as PositionComponent;

if (playerData && positionData) {
  console.log(`玩家 ${playerData.name} 在位置 (${positionData.x}, ${positionData.y})`);
}
```

## 📊 接口规范总结

### ✅ 已实现的标准接口

- ✅ `getEntity(id)` - 获取单个实体完整数据
- ✅ `getEntities()` - 获取所有实体ID  
- ✅ `getEntitiesByComponent(componentType)` - 按组件查询实体
- ✅ `getComponent(entityId, componentType)` - 获取实体组件
- ✅ `getComponents(entityId)` - 获取实体所有组件
- ✅ `hasComponent(entityId, componentType)` - 检查组件存在性

### 🚀 额外增强功能

ECS系统还提供了超出标准规范的增强功能：

- 🔍 高级查询：`queryWithAll()`, `queryWithAny()`, `queryWhere()`
- 📊 统计信息：`getEntityCount()`, `getComponentStats()`
- 🔄 实时订阅：`onComponentChanged()`, `watchQuery()`
- 🛠️ 查询构建器：链式API和流式查询
- 📋 组件发现：自动组件发现和元数据管理

## 🔗 相关文档

- [ECS 核心概念](./README.md)
- [Dubhe Config 集成](./README-dubhe-integration.md)
- [查询系统详解](./README-dynamic.md)
- [标准接口示例](./examples-standard-interface.ts) 