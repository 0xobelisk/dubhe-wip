
# Dubhe GraphQL 智能压测报告

生成时间: 2025/6/23 00:20:22

## 查询压测结果

| 表名 | 测试类型 | RPS | 平均延迟(ms) | 总请求数 | 错误数 | 状态 |
|------|----------|-----|-------------|----------|-------|------|
| COUNTER0 | getAllTables | 288.97 | 5.75 | 2890 | 0 | ✅ |
| COUNTER0 | getAllTables | 295.38 | 5.22 | 2955 | 0 | ✅ |
| COUNTER1 | getAllTables | 321.21 | 3.94 | 3215 | 0 | ✅ |
| COUNTER1 | getAllTables | 290.77 | 5.26 | 2910 | 0 | ✅ |
| COUNTER2 | getAllTables | 312.00 | 4.37 | 3120 | 0 | ✅ |
| COUNTER2 | getAllTables | 298.76 | 4.87 | 2990 | 0 | ✅ |
| COUNTER0 | getAllTables | 600.92 | 4.68 | 18030 | 0 | ✅ |
| COUNTER1 | getAllTables | 601.84 | 4.65 | 18063 | 0 | ✅ |
| COUNTER2 | getAllTables | 592.15 | 4.96 | 17870 | 0 | ✅ |
| COUNTER0 | batchQuery | 1209.57 | 4.51 | 72580 | 0 | ✅ |
| COUNTER1 | batchQuery | 1209.42 | 4.46 | 72580 | 0 | ✅ |
| COUNTER2 | batchQuery | 1201.05 | 4.54 | 72080 | 0 | ✅ |

## 订阅压测结果

| 表名 | 测试类型 | 连接数 | 接收事件数 | 平均事件延迟(ms) | 错误数 | 状态 |
|------|----------|--------|------------|-----------------|-------|------|
| COUNTER0 | subscribeToTableChanges | 1 | 1 | 10.00 | 0 | ✅ |
| COUNTER1 | subscribeToTableChanges | 1 | 43 | 10.00 | 0 | ✅ |
| COUNTER2 | subscribeToTableChanges | 1 | 66 | 10.00 | 0 | ✅ |
| COUNTER0 | subscribeToFilteredTableChanges | 1 | 1 | 10.00 | 0 | ✅ |
| COUNTER1 | subscribeToFilteredTableChanges | 1 | 43 | 10.00 | 0 | ✅ |
| COUNTER2 | subscribeToFilteredTableChanges | 1 | 66 | 10.00 | 0 | ✅ |

## 查询性能汇总

- **总请求数**: 289283
- **平均 RPS**: 601.84
- **平均延迟**: 4.77ms
- **总错误数**: 0
- **成功率**: 100.00%

