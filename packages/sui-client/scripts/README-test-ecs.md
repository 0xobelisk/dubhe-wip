# ECS Monster Hunter 测试脚本使用说明

## 概述

`test_ecs_monster_hunter.ts` 是一个综合测试脚本，展示了如何使用最新的 Dubhe ECS 系统来查询 Monster Hunter 游戏中的组件数据。

## 功能特性

### 🎯 主要测试内容

1. **ECS 世界初始化**
   - 使用 dubhe 配置自动创建 ECS world
   - 自动发现和配置组件
   - 展示配置策略和字段解析状态

2. **组件元数据查询**
   - 查看 position 组件（包含 x, y 坐标）
   - 查看 player 组件（空组件）
   - 显示组件字段、类型和主键信息

3. **标准 ECS 接口演示**
   - `getEntitiesByComponent()` - 按组件类型查询实体
   - `getEntity()` - 获取完整实体数据
   - `getComponent()` - 获取特定组件数据
   - `hasComponent()` - 检查实体是否拥有组件
   - `getComponents()` - 获取实体的所有组件

4. **游戏数据分析**
   - 玩家位置信息统计
   - 地图配置查询
   - 怪物数据分析
   - 其他游戏组件统计

### 🎮 Monster Hunter 组件

脚本会测试以下游戏组件：

- **player**: 玩家实体（空组件）
- **position**: 位置组件（x, y 坐标）
- **moveable**: 可移动标记
- **obstruction**: 阻挡物标记
- **encounterable**: 可遭遇标记
- **encounter**: 遭遇数据（怪物地址，捕获尝试次数）
- **monster**: 怪物数据（ID，类型）
- **map_config**: 地图配置（宽度，高度，地形）

## 使用方法

### 1. 基本运行

```bash
# 在 sui-client 目录下
cd packages/sui-client

# 使用默认端点运行
npx tsx scripts/test_ecs_monster_hunter.ts

# 或使用 ts-node
ts-node scripts/test_ecs_monster_hunter.ts
```

### 2. 自定义 GraphQL 端点

```bash
# 设置环境变量
export GRAPHQL_ENDPOINT=http://your-graphql-server:4000/graphql

# 运行测试
npx tsx scripts/test_ecs_monster_hunter.ts
```

### 3. 编程方式使用

```typescript
import { testMonsterHunterECS } from './scripts/test_ecs_monster_hunter';

// 运行测试
await testMonsterHunterECS();
```

## 输出示例

```
🎮 === Monster Hunter ECS 测试 ===

🔌 创建 GraphQL client...
🌍 创建 ECS world...
🚀 初始化 ECS world...
✅ ECS world 初始化完成
📋 使用策略: dubhe-config
🔧 自动字段解析: true

📦 === 可用组件列表 ===
发现 11 个组件:
  - player
  - position
  - moveable
  - obstruction
  - map_config
  - encounterable
  - encounter_trigger
  - encounter
  - monster
  - owned_by
  - monster_catch_attempt

📍 === Position 组件元数据 ===
组件名: position
表名: position
主键: [id]
字段:
  - id: string (必填)
  - x: u64 (必填)
  - y: u64 (必填)
描述: Position component for Monster Hunter game

🔍 === 标准 ECS 接口查询 ===
👥 查询所有玩家实体...
找到 5 个玩家实体
前3个玩家ID: [0x123..., 0x456..., 0x789...]

📍 查询所有有位置的实体...
找到 12 个有位置的实体

🎯 查询同时拥有 player 和 position 的实体...
找到 5 个有位置的玩家

📊 === 玩家详细数据 ===
🎮 玩家 1 (ID: 0x123...):
  完整数据: {
    "id": "0x123...",
    "player": {},
    "position": { "x": "100", "y": "200" }
  }
  拥有 player 组件: true
  拥有 position 组件: true
  position 数据: { "x": "100", "y": "200" }
  所有组件: [player, position, moveable]

✅ === 测试完成 ===
```

## 错误处理

### 连接错误

如果看到连接错误：

```
❌ 测试失败: Error: connect ECONNREFUSED 127.0.0.1:4000

💡 连接提示:
请确保 GraphQL 服务器正在运行在: http://localhost:4000/graphql
你可以通过环境变量设置端点: GRAPHQL_ENDPOINT=http://your-server:port/graphql
```

**解决方案**：
1. 启动你的 GraphQL 服务器
2. 确认端点地址正确
3. 设置正确的 `GRAPHQL_ENDPOINT` 环境变量

### 组件未找到

如果某些组件查询返回空结果，这可能是正常的，表示：
- 数据库中没有该类型的实体
- 组件配置可能需要调整
- GraphQL schema 可能不匹配

## 自定义和扩展

### 添加新的测试

在 `testMonsterHunterECS()` 函数中添加新的测试代码：

```typescript
// 测试自定义查询
console.log('🔍 === 自定义查询 ===');
const strongMonsters = await world.queryWith('monster', {
  filter: { monster_type: 'Eagle' }
});
console.log(`找到 ${strongMonsters.length} 只老鹰`);
```

### 修改配置

可以在 `dubhe.config.ts` 中修改组件配置，测试脚本会自动使用新配置。

## 依赖要求

- Node.js >= 16
- TypeScript
- 运行中的 GraphQL 服务器
- 正确配置的 Monster Hunter 数据库

## 相关文件

- `dubhe.config.ts` - Monster Hunter 游戏配置
- `src/libs/ecs/` - ECS 系统实现
- `src/libs/dubheGraphqlClient/` - GraphQL 客户端实现

---

💡 **提示**: 这个测试脚本是学习和理解 Dubhe ECS 系统的最佳起点！ 