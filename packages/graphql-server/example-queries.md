# 简化架构使用示例

## 🎯 新架构说明

现在当Rust indexer创建了`store_encounter`表后，PostGraphile会自动：

1. **自动生成GraphQL Schema**：`store_encounter` → `Encounter`类型
2. **自动生成Query字段**：`encounters` (复数)
3. **自动支持Live Queries**：实时订阅表变更

## 📊 基础查询

### 查询所有encounters
```graphql
query AllEncounters {
  encounters {
    nodes {
      id
      playerId
      createdAt
      # ... 其他字段
    }
    totalCount
  }
}
```

### 带过滤的查询
```graphql
query FilteredEncounters($playerId: String!) {
  encounters(filter: { playerId: { equalTo: $playerId } }) {
    nodes {
      id
      playerId
      createdAt
    }
  }
}
```

## 🔄 实时订阅 (Live Queries)

### 方法1：订阅所有数据变更
```graphql
subscription LiveEncounters {
  encounters @live {
    nodes {
      id
      playerId
      createdAt
    }
  }
}
```

### 方法2：订阅特定过滤条件的数据变更
```graphql
subscription LivePlayerEncounters($playerId: String!) {
  encounters(filter: { playerId: { equalTo: $playerId } }) @live {
    nodes {
      id
      playerId
      createdAt
      status
    }
  }
}
```

## 🎮 实际使用场景

### 游戏遭遇实时监控
```graphql
subscription GameEncounterMonitor {
  encounters(filter: { status: { equalTo: "active" } }) @live {
    nodes {
      id
      playerId
      enemyType
      status
      createdAt
    }
    totalCount
  }
}
```

### 玩家数据实时更新
```graphql
subscription PlayerDataLive($playerId: String!) {
  # 假设有store_player表
  players(filter: { id: { equalTo: $playerId } }) @live {
    nodes {
      id
      level
      experience
      gold
      lastActive
    }
  }
}
```

## 🔧 客户端使用 (JavaScript)

### Apollo Client Live Queries
```javascript
import { useLiveQuery } from '@apollo/client/react/hooks';

function EncounterList({ playerId }) {
  const { data, loading, error } = useLiveQuery(
    gql`
      query LiveEncounters($playerId: String!) {
        encounters(filter: { playerId: { equalTo: $playerId } }) @live {
          nodes {
            id
            enemyType
            status
            createdAt
          }
        }
      }
    `,
    {
      variables: { playerId },
    }
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data.encounters.nodes.map(encounter => (
        <div key={encounter.id}>
          {encounter.enemyType} - {encounter.status}
        </div>
      ))}
    </div>
  );
}
```

## 📈 优势对比

### ❌ 旧架构（复杂）
- 需要自定义notification系统
- 需要WebSocket服务器
- 需要复杂的channel管理
- 需要手动发送通知

### ✅ 新架构（简化）
- 使用PostGraphile原生Live Queries
- 自动检测数据库变更
- 自动生成订阅功能
- 无需额外配置

## 🧪 测试步骤

1. **启动服务**：
   ```bash
   cd packages/graphql-server
   npm start
   ```

2. **打开GraphQL Playground**：
   访问 `http://localhost:4000`

3. **测试查询**：
   复制上面的查询到playground

4. **测试实时更新**：
   - 在一个tab开启live query
   - 在另一个tab执行数据插入
   - 观察第一个tab是否实时更新

5. **数据插入测试**：
   ```sql
   INSERT INTO store_encounter (player_id, enemy_type, status) 
   VALUES ('player123', 'dragon', 'active');
   ```

## 🎯 表命名规则

- **数据库表**：`store_encounter`、`store_player`、`store_item`
- **GraphQL类型**：`Encounter`、`Player`、`Item`
- **GraphQL字段**：`encounters`、`players`、`items`

这样就实现了你想要的通用表单系统！🎉 