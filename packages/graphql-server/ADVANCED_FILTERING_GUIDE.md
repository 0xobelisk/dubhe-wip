# 高级过滤和查询功能使用指南

本文档详细介绍了在GraphQL服务器中如何使用增强的过滤、排序和查询功能。

## 概述

我们的GraphQL服务器现在支持强大的过滤功能，通过集成`postgraphile-plugin-connection-filter`插件实现。这个插件提供了：

- **丰富的过滤操作符** - 支持字符串、数字、布尔值等各种类型的过滤
- **逻辑组合** - 支持AND、OR、NOT逻辑操作
- **关系过滤** - 可以基于关联表的字段进行过滤
- **增强的排序** - 支持多字段排序和所有字段的排序选项

## 支持的过滤操作符

### 基础比较操作符

| 操作符 | 简写 | 描述 | 示例 |
|--------|------|------|------|
| `equalTo` | `eq` | 等于 | `{ name: { eq: "admin" } }` |
| `notEqualTo` | `ne` | 不等于 | `{ status: { ne: "inactive" } }` |
| `lessThan` | `lt` | 小于 | `{ age: { lt: 18 } }` |
| `lessThanOrEqualTo` | `lte` | 小于等于 | `{ score: { lte: 100 } }` |
| `greaterThan` | `gt` | 大于 | `{ createdAt: { gt: "2023-01-01" } }` |
| `greaterThanOrEqualTo` | `gte` | 大于等于 | `{ price: { gte: 10.0 } }` |

### 空值检查

| 操作符 | 描述 | 示例 |
|--------|------|------|
| `isNull` | 是否为空 | `{ description: { isNull: true } }` |

### 数组操作符

| 操作符 | 描述 | 示例 |
|--------|------|------|
| `in` | 包含在列表中 | `{ status: { in: ["active", "pending"] } }` |
| `notIn` | 不包含在列表中 | `{ type: { notIn: ["admin", "system"] } }` |

### 字符串操作符

| 操作符 | 描述 | 示例 |
|--------|------|------|
| `like` | SQL LIKE模式匹配 | `{ name: { like: "%admin%" } }` |
| `ilike` | 不区分大小写的LIKE | `{ email: { ilike: "%@GMAIL.COM" } }` |
| `includes` | 包含子字符串 | `{ title: { includes: "重要" } }` |
| `includesInsensitive` | 不区分大小写包含 | `{ content: { includesInsensitive: "ERROR" } }` |
| `startsWith` | 以...开头 | `{ code: { startsWith: "SUI_" } }` |
| `endsWith` | 以...结尾 | `{ filename: { endsWith: ".json" } }` |

## 查询示例

### 1. 基础过滤查询

```graphql
query {
  storeAccounts(filter: {
    balance: { gt: "1000" }
  }) {
    nodes {
      assetId
      account
      balance
    }
  }
}
```

### 2. 多条件组合（隐式AND）

```graphql
query {
  storeAccounts(filter: {
    balance: { gt: "1000" },
    assetId: { like: "0x%" }
  }) {
    nodes {
      assetId
      account
      balance
    }
  }
}
```

### 3. 使用逻辑操作符

```graphql
query {
  storeAccounts(filter: {
    or: [
      { balance: { gt: "10000" } },
      { assetId: { in: ["0x123", "0x456"] } }
    ]
  }) {
    nodes {
      assetId
      account
      balance
    }
  }
}
```

### 4. 复杂的逻辑组合

```graphql
query {
  storeAccounts(filter: {
    and: [
      {
        or: [
          { balance: { gt: "1000" } },
          { assetId: { startsWith: "0x2" } }
        ]
      },
      {
        not: {
          account: { includes: "test" }
        }
      }
    ]
  }) {
    nodes {
      assetId
      account
      balance
    }
  }
}
```

### 5. 字符串模糊搜索

```graphql
query {
  storeEncounters(filter: {
    player: { includesInsensitive: "alice" },
    monster: { isNull: false }
  }) {
    nodes {
      player
      monster
      catchAttempts
    }
  }
}
```

### 6. 数组和范围查询

```graphql
query {
  storePositions(filter: {
    player: { in: ["player1", "player2", "player3"] },
    x: { gte: "10", lte: "100" }
  }) {
    nodes {
      player
      x
      y
    }
  }
}
```

## 增强的排序功能

现在所有字段都支持排序，包括ASC（升序）和DESC（降序）：

### 单字段排序

```graphql
query {
  storeAccounts(
    orderBy: [BALANCE_DESC]
  ) {
    nodes {
      assetId
      account
      balance
    }
  }
}
```

### 多字段排序

```graphql
query {
  storeAccounts(
    orderBy: [ASSET_ID_ASC, BALANCE_DESC]
  ) {
    nodes {
      assetId
      account
      balance
    }
  }
}
```

### 可用的排序选项

对于每个表的每个字段，都会自动生成对应的排序选项：

- `FIELD_NAME_ASC` - 升序
- `FIELD_NAME_DESC` - 降序
- `NATURAL` - 自然排序
- `PRIMARY_KEY_ASC` - 主键升序
- `PRIMARY_KEY_DESC` - 主键降序

## 分页和性能优化

### 使用分页

```graphql
query {
  storeAccounts(
    first: 10,
    after: "cursor_value",
    filter: {
      balance: { gt: "1000" }
    },
    orderBy: [BALANCE_DESC]
  ) {
    edges {
      node {
        assetId
        account
        balance
      }
      cursor
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    totalCount
  }
}
```

### 使用偏移分页

```graphql
query {
  storeAccounts(
    first: 20,
    offset: 100,
    filter: {
      balance: { gt: "1000" }
    }
  ) {
    nodes {
      assetId
      account
      balance
    }
    totalCount
  }
}
```

## 注意事项和最佳实践

### 1. 性能考虑

- 复杂的过滤器可能会导致查询性能下降
- 建议在经常过滤的字段上创建数据库索引
- 使用分页避免一次性返回过多数据

### 2. 安全考虑

- 某些操作符（如正则表达式）可能会消耗大量计算资源
- 建议在生产环境中限制复杂查询的使用

### 3. 调试技巧

- 在开发环境中，可以查看生成的SQL查询来优化性能
- 使用GraphQL Playground的查询分析器来理解查询复杂度

## 支持的数据类型

过滤功能支持以下PostgreSQL数据类型：

- **字符串类型**: `text`, `varchar`, `char`
- **数值类型**: `integer`, `bigint`, `numeric`, `real`, `double precision`
- **布尔类型**: `boolean`
- **日期时间类型**: `timestamp`, `timestamptz`, `date`, `time`
- **JSON类型**: `json`, `jsonb`
- **数组类型**: 所有数组类型
- **自定义类型**: 枚举、复合类型等

## 错误处理

如果查询包含无效的过滤条件，GraphQL会返回详细的错误信息：

```json
{
  "errors": [
    {
      "message": "Invalid filter condition",
      "locations": [{"line": 2, "column": 3}],
      "path": ["storeAccounts"]
    }
  ]
}
```

## 总结

通过这些增强的过滤和查询功能，您可以：

1. **精确过滤** - 使用多种操作符进行精确的数据筛选
2. **灵活组合** - 通过逻辑操作符组合复杂的查询条件  
3. **高效排序** - 对任意字段进行单字段或多字段排序
4. **优化性能** - 通过合理的分页和索引优化查询性能

这些功能让您能够构建更强大、更灵活的数据查询接口，满足各种复杂的业务需求。 