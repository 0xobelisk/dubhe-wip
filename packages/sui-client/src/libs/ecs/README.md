# Dubhe ECS 系统

一个为 Sui 链设计的简洁、强大的实体-组件-系统（ECS）架构，支持自动组件发现和标准ECS接口。

## 🚀 快速开始

### 安装和导入
```typescript
import { createECSWorld, createDubheGraphqlClient } from '@0xobelisk/sui-client';
```

### 基础使用

#### 方式1：使用Dubhe配置（推荐）
```typescript
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  dubheConfig: myDubheConfig
});

const world = createECSWorld(client);
await world.initialize();  // 自动发现组件

// 使用标准ECS接口
const players = await world.getEntitiesByComponent('player');
const playerData = await world.getComponent(players[0], 'player');
```

#### 方式2：手动指定组件
```typescript
const world = createECSWorldWithComponents(client, [
  'player', 'position', 'inventory', 'item'
]);

await world.initialize();
```

## 📚 核心概念

### 自动策略判断
系统会根据配置自动选择最合适的策略：
- **Dubhe配置模式**：从配置文件自动发现组件（推荐）
- **手动模式**：明确指定组件名称列表

### 标准ECS接口
支持完整的标准ECS接口（驼峰命名）：

**实体查询**
- `getEntity(id)` - 获取实体完整数据
- `getEntities()` - 获取所有实体
- `getEntitiesByComponent(type)` - 按组件查询实体

**组件查询**
- `getComponent(entityId, type)` - 获取组件数据
- `getComponents(entityId)` - 获取实体所有组件
- `hasComponent(entityId, type)` - 检查组件存在

## 🔧 配置选项

```typescript
export interface ComponentDiscoveryConfig {
  componentNames?: ComponentType[];  // 手动模式：组件名称列表
  dubheConfig?: DubheConfig;        // 自动模式：Dubhe配置
}
```

## 📖 详细文档

- **[标准接口文档](./README-standard-interface.md)** - 完整的标准ECS接口规范和示例
- **[简化架构说明](./README-simplified.md)** - 了解简化后的系统架构
- **[自动策略判断](./README-auto-strategy.md)** - 了解自动策略选择机制

## 💡 示例代码

- **[标准接口示例](./examples-standard-interface.ts)** - 标准ECS接口的完整使用示例
- **[Dubhe配置示例](./examples-dubhe-config.ts)** - Dubhe配置模式的使用示例

## 🏗️ 文件结构

```
packages/sui-client/src/libs/ecs/
├── index.ts                          # 主要导出
├── types.ts                          # 类型定义
├── world.ts                          # ECS世界主类
├── query.ts                          # 查询系统
├── subscription.ts                   # 订阅系统
├── utils.ts                          # 工具函数
├── examples-standard-interface.ts    # 标准接口示例
├── examples-dubhe-config.ts          # Dubhe配置示例
└── README-*.md                       # 详细文档
```

## ✨ 核心特性

- **🎯 零配置** - 提供dubheConfig即可自动工作
- **📱 标准接口** - 完全符合ECS标准接口规范
- **🔄 实时更新** - 支持组件变化订阅
- **⚡ 高性能** - 优化的查询和批量操作
- **🛡️ 类型安全** - 完整的TypeScript支持
- **🔧 灵活配置** - 支持手动和自动两种模式

## 🎯 推荐使用方式

1. **优先使用Dubhe配置模式** - 提供最佳的开发体验
2. **使用标准ECS接口** - 保证代码的可移植性
3. **利用TypeScript类型** - 获得更好的开发体验

开始构建你的ECS应用吧！🚀 