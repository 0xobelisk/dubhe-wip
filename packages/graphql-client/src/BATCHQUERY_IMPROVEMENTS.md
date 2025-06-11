# batchQuery 功能改进

本次更新主要解决了两个问题：

## 1. 添加 fields 字段支持

### 问题
之前的 `batchQuery` 方法不支持指定查询字段，只能查询所有字段或使用默认字段。

### 解决方案
扩展了 `batchQuery` 方法的参数类型，添加了对 `fields`, `orderBy` 等参数的支持：

```typescript
// 修改前
params?: BaseQueryParams & { filter?: Record<string, any> };

// 修改后  
params?: BaseQueryParams & { 
  filter?: Record<string, any>;
  orderBy?: OrderBy[];
  fields?: string[]; // 新增：允许用户指定需要查询的字段
};
```

### 使用示例
```typescript
const results = await client.batchQuery([
  {
    key: 'encounters',
    tableName: 'encounters',
    params: {
      first: 5,
      fields: ['player', 'monster', 'catchAttempts', 'updatedAt'], // 指定字段
      filter: { exists: { equalTo: true } },
      orderBy: [{ field: 'updatedAt', direction: 'DESC' }]
    }
  }
]);
```

## 2. 将默认字段从 nodeId 改为 updatedAt

### 问题
原来的默认字段是 `nodeId`，但不是所有表都有这个字段，导致查询失败。

### 解决方案
修改 `convertTableFields` 函数，将默认字段改为 `updatedAt`：

```typescript
// 修改前
function convertTableFields(customFields?: string[]): string {
  if (customFields && customFields.length > 0) {
    return customFields.join('\n    ');
  }
  return 'nodeId'; // 旧的默认字段
}

// 修改后
function convertTableFields(customFields?: string[]): string {
  if (customFields && customFields.length > 0) {
    return customFields.join('\n    ');
  }
  return 'updatedAt'; // 新的默认字段
}
```

### 原因
- `updatedAt` 是所有表都应该有的通用字段
- `nodeId` 不是所有表都存在，可能导致查询错误
- `updatedAt` 对于数据排序和变更追踪更有意义

## 3. 更新示例代码

### 基础示例 (exampleBatchQuery)
更新了 `examples.ts` 中的 `exampleBatchQuery` 函数，展示如何使用新的 fields 功能：

```typescript
const results = await client.batchQuery([
  { 
    key: 'encounters', 
    tableName: 'encounters', 
    params: { 
      first: 5,
      fields: ['player', 'monster', 'catchAttempts', 'updatedAt'],
      filter: { exists: { equalTo: true } },
      orderBy: [{ field: 'updatedAt', direction: 'DESC' }]
    } 
  },
  // ... 更多查询
]);
```

### 高级示例 (exampleAdvancedBatchQuery)
新增了一个高级示例函数，展示：
- 自定义字段选择
- 复杂过滤条件
- 排序功能
- 默认字段行为

## 4. 测试文件

创建了 `test-batch-fields.ts` 测试文件，验证：
- 自定义字段查询
- 默认字段行为
- 完整功能集成测试

## 向后兼容性

✅ **完全向后兼容** - 现有代码无需修改：
- 如果不指定 `fields`，仍然使用默认字段（现在是 `updatedAt`）
- 所有现有的 filter、orderBy 等功能保持不变
- API 接口签名保持一致

## 使用建议

1. **明确指定字段**：建议在生产环境中明确指定需要的字段，避免传输不必要的数据
2. **利用新功能**：充分使用 fields、filter、orderBy 的组合来优化查询性能  
3. **测试验证**：使用新的测试文件验证功能是否符合预期

## 影响范围

- ✅ `batchQuery` 方法：新增字段支持
- ✅ `convertTableFields` 函数：默认字段更改
- ✅ 示例代码：更新展示新功能
- ✅ 类型定义：保持一致性
- ✅ 测试：新增验证用例 