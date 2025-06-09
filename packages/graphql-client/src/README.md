# DubheGraphqlClient

强大的GraphQL客户端，专为Dubhe索引器设计，支持完整的CRUD操作和实时订阅功能。

## ✨ 主要特性

- 🔄 **实时订阅**: 支持PostGraphile的`listen`订阅功能
- 📊 **高级过滤**: 强大的过滤和排序功能
- 🚀 **性能优化**: 内置重试机制和缓存策略
- 📱 **跨平台**: 支持浏览器和Node.js环境
- 🛡️ **类型安全**: 完整的TypeScript支持

## 🚀 快速开始

### 安装

```bash
npm install @0xobelisk/sui-client
```

### 基础使用

```typescript
import { createDubheGraphqlClient } from '@0xobelisk/sui-client';

const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  subscriptionEndpoint: 'ws://localhost:4000/graphql',
});

// 查询数据
const accounts = await client.getAllTables('accounts', {
  first: 10,
  filter: { balance: { greaterThan: '1000' } },
  orderBy: [{ field: 'balance', direction: 'DESC' }],
});

console.log(accounts);
```

## 📡 实时订阅功能（重要更新）

### PostGraphile Listen订阅

我们现在支持PostGraphile的高级`listen`订阅功能，这是推荐的实时数据监听方式：

```typescript
// 1. 基础listen订阅
const subscription = client.subscribeToTableChanges('encounters', {
  initialEvent: true, // 立即获取初始数据
  fields: ['player', 'monster', 'catchAttempts'],
  topicPrefix: 'store_xxxxxx', // 自定义topic前缀 (可选)
  onData: (data) => {
    // data.listen.query.encounters 包含实时数据
    console.log('实时数据:', data.listen.query.encounters);
  },
});

// 2. 带过滤的高级订阅
const filteredSub = client.subscribeToFilteredTableChanges('accounts', 
  { balance: { greaterThan: '1000' } }, 
  {
    initialEvent: true,
    orderBy: [{ field: 'balance', direction: 'DESC' }],
    first: 5,
    topicPrefix: 'wallet_', // 自定义前缀
  }
);

// 3. 自定义查询订阅
const customSub = client.subscribeWithListen(
  'store_positions',
  `positions(first: 10) { nodes { player x y } }`,
  { initialEvent: false }
);
```

### 订阅特性

- **🔄 实时更新**: 数据库变更时自动通知
- **⚡ 初始事件**: 可选择订阅时立即获取当前数据
- **🎯 精确过滤**: 只监听符合条件的数据变更
- **📊 结构化数据**: 返回完整的GraphQL查询结果

## 🔍 查询功能

### 基础查询

```typescript
// 查询所有账户（支持单数表名）
const accounts = await client.getAllTables('account');

// 带分页和过滤的查询
const filteredAccounts = await client.getAllTables('account', {
  first: 20,
  after: 'cursor_string',
  filter: {
    balance: { greaterThan: '0' },
    assetId: { startsWith: '0x' }
  },
  orderBy: [{ field: 'createdAt', direction: 'DESC' }]
});
```

### 条件查询

```typescript
// 根据特定条件查询单条记录（支持单数表名）
const account = await client.getTableByCondition('account', {
  assetId: '0x123...',
  account: '0xabc...'
});
```

### 批量查询

```typescript
const results = await client.batchQuery([
  { key: 'encounters', tableName: 'encounters', params: { first: 5 } },
  { key: 'accounts', tableName: 'accounts', params: { first: 10 } },
  { key: 'positions', tableName: 'positions', params: { first: 15 } }
]);
```

## ⚙️ 配置选项

### 客户端配置

```typescript
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  subscriptionEndpoint: 'ws://localhost:4000/graphql',
  headers: {
    'Authorization': 'Bearer token',
    'X-Custom-Header': 'value'
  },
  retryOptions: {
    delay: { initial: 500, max: 10000 },
    attempts: { max: 3 }
  }
});
```

### 重试机制

```typescript
const clientWithRetry = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  retryOptions: {
    delay: {
      initial: 500,    // 初始延迟500ms
      max: 10000,      // 最大延迟10秒
      jitter: true     // 启用随机抖动
    },
    attempts: {
      max: 3,          // 最多重试3次
      retryIf: (error) => {
        // 自定义重试条件
        return error.networkError || error.networkError?.statusCode >= 500;
      }
    }
  }
});
```

## 🆕 API变更说明

### 表名处理简化

我们采用简单的复数/单数转换逻辑，与PostGraphile保持一致：

```typescript
// ✅ 简单转换规则 - 只判断最后的's'
'account' → 'accounts'     // 单数加's'变复数
'accounts' → 'account'     // 复数去's'变单数
'encounter' → 'encounters' // 单数加's'变复数
'encounters' → 'encounter' // 复数去's'变单数

// 已经以's'结尾的保持不变
'accounts' → 'accounts'    // 已经是复数
'positions' → 'positions'  // 已经是复数
```

### 订阅API升级

```typescript
// ✅ 推荐：使用新的listen订阅
client.subscribeToTableChanges('encounters', {
  initialEvent: true,
  fields: ['player', 'monster']
});

// ✅ 仍然支持：旧版订阅API（向后兼容）
client.subscribeToStoreTableChanges('encounters', options);
```

## 🔧 最佳实践

### 1. 使用listen订阅进行实时更新

```typescript
// 推荐做法
const subscription = client.subscribeToTableChanges('encounters', {
  initialEvent: true,  // 获取初始数据
  fields: ['player', 'monster', 'catchAttempts'],
  onData: (data) => {
    updateGameState(data.listen.query.encounters.nodes);
  }
});
```

### 2. 合理使用过滤和分页

```typescript
// 只监听相关数据
const filteredSub = client.subscribeToFilteredTableChanges('accounts',
  { account: { equalTo: currentUserAddress } },
  { 
    initialEvent: true,
    first: 50  // 限制数据量
  }
);
```

### 3. 错误处理和重连

```typescript
const subscription = client.subscribeToTableChanges('encounters', {
  onError: (error) => {
    console.error('订阅错误:', error);
    // 可以实现自动重连逻辑
    setTimeout(() => restartSubscription(), 5000);
  }
});
```

## 📚 完整示例

查看 `examples.ts` 文件获取更多完整的使用示例，包括：

- 基础查询和过滤
- 实时订阅和数据流
- 批量操作
- 错误处理
- 重试机制

## 🔄 迁移指南

从旧版本迁移到新版本：

1. **订阅API**: 推荐使用新的`subscribeToTableChanges`，支持`initialEvent`选项
2. **数据结构**: listen订阅返回`data.listen.query.tableName`结构
3. **表名**: 继续使用去掉store前缀的表名（如`accounts`而不是`store_accounts`）

## 🛠️ 开发指南

```bash
# 开发
npm run dev

# 构建
npm run build

# 测试
npm run test
```

# DubheGraphqlClient 动态缓存配置

`DubheGraphqlClient` 现在支持动态配置缓存策略，不再需要硬编码表名。

## 基础用法

### 不启用缓存（默认）
```typescript
const client = new DubheGraphqlClient({
  endpoint: 'http://localhost:5000/graphql',
});
```

### 启用特定表的分页缓存
```typescript
const client = new DubheGraphqlClient({
  endpoint: 'http://localhost:5000/graphql', 
  cacheConfig: {
    // 指定需要分页缓存的表名（使用单数形式）
    paginatedTables: ['account', 'encounter', 'position', 'mapConfig'],
  },
});
```

## 高级用法

### 自定义缓存策略
```typescript
const client = new DubheGraphqlClient({
  endpoint: 'http://localhost:5000/graphql',
  cacheConfig: {
    paginatedTables: ['account', 'encounter'],
    customMergeStrategies: {
      // 表名使用复数形式（与GraphQL schema一致）
      accounts: {
        keyArgs: ['filter'], // 只根据filter缓存，忽略orderBy
        merge: (existing, incoming) => {
          // 自定义合并逻辑
          if (!incoming || !Array.isArray(incoming.edges)) {
            return existing;
          }
          return {
            ...incoming,
            edges: [...(existing?.edges || []), ...incoming.edges],
          };
        },
      },
      encounters: {
        keyArgs: ['filter', 'orderBy'], // 默认缓存键
        // 使用默认合并策略
      },
    },
  },
});
```

## 配置选项

### `cacheConfig.paginatedTables`
- 类型: `string[]`
- 说明: 需要启用分页缓存的表名列表（使用单数形式）
- 示例: `['account', 'user', 'order']`

### `cacheConfig.customMergeStrategies`
- 类型: `Record<string, { keyArgs?: string[]; merge?: Function }>`
- 说明: 自定义缓存合并策略
- 表名使用复数形式（与GraphQL schema一致）

#### `keyArgs`
- 类型: `string[]`
- 默认值: `['filter', 'orderBy']`
- 说明: 用于生成缓存键的参数名

#### `merge`
- 类型: `(existing: any, incoming: any) => any`
- 说明: 自定义的缓存合并函数
- 参数:
  - `existing`: 现有的缓存数据
  - `incoming`: 新获取的数据

## 注意事项

1. **表名格式**: 
   - `paginatedTables` 中使用单数形式：`'account'`
   - `customMergeStrategies` 中使用复数形式：`'accounts'`

2. **默认合并策略**: 会将新的 edges 追加到现有的 edges 后面，适用于分页查询

3. **性能考虑**: 只为真正需要分页缓存的表启用此功能，避免不必要的内存占用

## 迁移指南

### 从硬编码配置迁移

**之前（硬编码）:**
```typescript
// 无法配置，固定支持 accounts, encounters, positions, mapConfigs
const client = new DubheGraphqlClient({ endpoint: '...' });
```

**现在（动态配置）:**
```typescript
const client = new DubheGraphqlClient({
  endpoint: '...',
  cacheConfig: {
    paginatedTables: ['account', 'encounter', 'position', 'mapConfig'],
  },
});
```

这样的设计提供了：
- ✅ 更好的灵活性 - 用户可以选择需要缓存的表
- ✅ 更好的性能 - 不会为不需要的表创建缓存策略  
- ✅ 更好的可扩展性 - 支持自定义缓存策略
- ✅ 向后兼容 - 不配置时不会启用任何缓存策略 

## 多表订阅 (新功能)

DubheGraphqlClient 现在支持同时订阅多个表的数据变更！

### 方式1：详细配置多表订阅

```typescript
import { createDubheGraphqlClient } from './dubhe-graphql-client';

const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  subscriptionEndpoint: 'ws://localhost:4000/graphql'
});

// 同时订阅多个表，每个表有独立配置
const multiTableSubscription = client.subscribeToMultipleTables([
  {
    tableName: 'encounter',
    options: {
      initialEvent: true,
      fields: ['player', 'monster', 'catchAttempts', 'createdAt'],
      filter: { exists: { equalTo: true } },
      first: 5,
      onData: (data) => {
        console.log('Encounters更新:', data.listen.query.encounters);
      }
    }
  },
  {
    tableName: 'account', 
    options: {
      initialEvent: true,
      fields: ['assetId', 'account', 'balance'],
      filter: { balance: { greaterThan: '0' } },
      first: 3,
      orderBy: [{ field: 'balance', direction: 'DESC' }],
      onData: (data) => {
        console.log('Accounts更新:', data.listen.query.accounts);
      }
    }
  },
  {
    tableName: 'position',
    options: {
      initialEvent: true,
      fields: ['player', 'x', 'y'],
      first: 10,
      onData: (data) => {
        console.log('Positions更新:', data.listen.query.positions);
      }
    }
  }
], {
  // 全局回调 - 接收所有表的数据
  onData: (allData) => {
    console.log('所有表的最新数据:', {
      encounters: allData.encounter?.listen.query.encounters,
      accounts: allData.account?.listen.query.accounts, 
      positions: allData.position?.listen.query.positions
    });
  },
  onError: (error) => {
    console.error('多表订阅错误:', error);
  }
});

// 开始订阅
const subscription = multiTableSubscription.subscribe({
  next: (data) => {
    console.log('接收到数据，包含的表:', Object.keys(data));
  },
  error: (error) => {
    console.error('订阅流错误:', error);
  }
});

// 取消订阅
// subscription.unsubscribe();
```

### 方式2：简化的表名列表订阅

```typescript
// 使用相同配置订阅多个表
const tableListSubscription = client.subscribeToTableList(
  ['encounter', 'account', 'position'],
  {
    initialEvent: true,
    fields: ['id', 'createdAt', 'updatedAt'], // 所有表共用的字段
    first: 5,
    onData: (allData) => {
      console.log('表列表订阅数据更新:', {
        tablesCount: Object.keys(allData).length,
        data: allData
      });
    },
    onError: (error) => {
      console.error('表列表订阅错误:', error);
    }
  }
);

const subscription = tableListSubscription.subscribe();
```

### 特性

- ✅ **支持表名列表批量订阅**
- ✅ **每个表可独立配置过滤条件、字段、排序等**
- ✅ **支持表级别和全局级别的回调函数**
- ✅ **自动单数/复数表名转换**
- ✅ **基于PostGraphile Listen的实时推送**
- ✅ **统一的错误处理和订阅管理**

### API 参考

#### `subscribeToMultipleTables(tableConfigs, globalOptions)`

**参数：**
- `tableConfigs`: `MultiTableSubscriptionConfig[]` - 表配置数组
- `globalOptions`: `SubscriptionOptions` - 全局订阅选项

**返回：**
- `Observable<MultiTableSubscriptionData>` - 包含所有表数据的Observable

#### `subscribeToTableList(tableNames, options)`

**参数：**
- `tableNames`: `string[]` - 表名数组
- `options`: `SubscriptionOptions & { fields?, filter?, initialEvent?, first?, topicPrefix? }` - 统一配置

**返回：**
- `Observable<MultiTableSubscriptionData>` - 包含所有表数据的Observable

### 使用场景

1. **游戏实时数据监控** - 同时监听玩家位置、遭遇战、账户余额
2. **业务数据仪表板** - 实时展示多个业务表的关键指标
3. **数据同步** - 将多个表的变更同步到缓存或其他系统
4. **实时分析** - 对多表数据进行实时统计和分析

# DubheGraphqlClient - 自动字段解析功能

## 概述

DubheGraphqlClient 现在支持自动解析 dubhe config 中的组件信息，无需手动指定表字段。这大大简化了开发者的使用体验。

## 新功能特性

### 🚀 自动字段解析
- 从 dubhe config 自动解析表结构
- 自动识别字段类型和主键配置
- 支持枚举类型识别
- 自动添加系统字段（createdAt, updatedAt）

### 🔧 智能字段管理
- 查询时自动使用解析的字段
- 仍支持手动指定字段（覆盖自动解析）
- 提供字段信息查询API

### 📊 主键支持
- 支持默认 id 主键
- 支持自定义单一主键
- 支持复合主键
- 支持无主键表

## 使用方法

### 1. 基础配置

```typescript
import { createDubheGraphqlClient, DubheConfig } from '@dubhe/sui-client';

// 定义你的 dubhe config
const dubheConfig: DubheConfig = {
  name: "my_game",
  description: "My awesome game",
  enums: {
    MonsterType: ["Fire", "Water", "Grass"],
    Direction: ["North", "South", "East", "West"]
  },
  components: {
    // 有默认 id 字段的表
    Player: {
      fields: {
        name: "string",
        level: "u32",
        experience: "u64"
      }
      // keys 未定义 = 有默认 id 字段
    },
    
    // 自定义主键
    Position: {
      fields: {
        x: "u32",
        y: "u32",
        player_id: "string"
      },
      keys: ["player_id"] // 使用 player_id 作为主键
    },
    
    // 复合主键
    Monster: {
      fields: {
        monster_type: "MonsterType", // 枚举类型
        level: "u32",
        hp: "u32",
        owner_id: "string"
      },
      keys: ["owner_id", "monster_type"] // 复合主键
    },
    
    // 无主键表
    GameEvent: {
      fields: {
        event_type: "string",
        description: "string"
      },
      keys: [] // 空数组 = 无主键
    }
  }
};

// 创建客户端，传入 dubhe config
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  subscriptionEndpoint: 'ws://localhost:4000/graphql',
  dubheConfig: dubheConfig, // 🎉 传入配置，启用自动解析
});
```

### 2. 自动字段查询

```typescript
// ✨ 不需要指定 fields，自动使用解析的字段
const players = await client.getAllTables('player');
// 自动查询: id, name, level, experience, createdAt, updatedAt

const monsters = await client.getAllTables('monster', {
  filter: { level: { greaterThan: 10 } }
});
// 自动查询: ownerId, monsterType, level, hp, createdAt, updatedAt
```

### 3. 手动字段覆盖

```typescript
// 🔧 仍然可以手动指定字段
const playersWithCustomFields = await client.getAllTables('player', {
  fields: ['id', 'name'] // 只查询这两个字段
});
```

### 4. 字段信息查询

```typescript
// 📊 查询解析的字段信息
const playerFields = client.getTableFields('player');
// 返回: ['id', 'name', 'level', 'experience', 'createdAt', 'updatedAt']

const monsterPrimaryKeys = client.getTablePrimaryKeys('monster');
// 返回: ['ownerId', 'monsterType']

const monsterEnumFields = client.getTableEnumFields('monster');
// 返回: { monsterType: ['Fire', 'Water', 'Grass'] }

// 获取所有表信息
const allTableInfo = client.getAllTableInfo();
```

### 5. 订阅自动字段

```typescript
// 🔔 订阅时也会自动使用解析的字段
const subscription = client.subscribeToTableChanges('player', {
  initialEvent: true,
  // 不指定 fields，自动使用解析的字段
});
```

## 字段解析规则

### 字段名转换
- dubhe config 中的字段名（snake_case）→ GraphQL 字段名（camelCase）
- 例如：`player_id` → `playerId`

### 主键配置
| keys 值 | 说明 | 示例 |
|---------|------|------|
| `undefined` | 有默认 id 字段 | `['id']` |
| `["field1"]` | 单一自定义主键 | `['playerId']` |
| `["field1", "field2"]` | 复合主键 | `['ownerId', 'monsterType']` |
| `[]` | 无主键 | `[]` |

### 系统字段
所有表自动添加：
- `createdAt` - 创建时间
- `updatedAt` - 更新时间

### 枚举字段识别
- 自动识别 dubhe config 中定义的枚举类型
- 提供枚举值查询功能

## 兼容性

### 向后兼容
- 不传入 `dubheConfig` 时，行为与之前完全一致
- 手动指定 `fields` 时，优先使用手动指定的字段

### 渐进式采用
- 可以部分表使用自动解析，部分表手动指定
- 可以在自动解析基础上进行字段覆盖

## 最佳实践

### 1. 推荐配置方式
```typescript
// ✅ 推荐：集中管理 dubhe config
import { dubheConfig } from './config/dubhe.config';

const client = createDubheGraphqlClient({
  endpoint: process.env.GRAPHQL_ENDPOINT,
  dubheConfig: dubheConfig,
});
```

### 2. 字段查询优化
```typescript
// ✅ 推荐：让系统自动解析字段
const data = await client.getAllTables('player');

// ⚠️ 仅在需要优化性能时手动指定
const lightData = await client.getAllTables('player', {
  fields: ['id', 'name'] // 只查询必要字段
});
```

### 3. 类型安全
```typescript
// ✅ 推荐：使用 TypeScript 类型
interface Player {
  id: string;
  name: string;
  level: number;
  experience: number;
  createdAt: string;
  updatedAt: string;
}

const players = await client.getAllTables<Player>('player');
```

## 错误处理

### 配置错误
```typescript
// 如果 dubhe config 中没有对应的表配置
const unknownTable = client.getTableFields('unknown_table');
// 返回默认字段: ['id', 'createdAt', 'updatedAt']
```

### 字段冲突
```typescript
// 手动字段优先级更高
const customFields = await client.getAllTables('player', {
  fields: ['custom_field'] // 即使配置中没有，也会使用这个字段
});
```

## 示例项目

查看 `example-usage.ts` 文件获取完整的使用示例。

## 更新日志

### v2.0.0
- ✨ 新增 dubhe config 自动解析功能
- ✨ 新增字段信息查询 API
- ✨ 新增枚举字段识别
- ✨ 新增主键配置支持
- 🔧 优化字段名转换逻辑
- 📚 新增详细文档和示例