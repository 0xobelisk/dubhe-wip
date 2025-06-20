/**
 * DubheGraphqlClient 使用示例 - 支持自动解析 dubhe config
 *
 * 这个示例展示了如何使用新的 dubhe config 自动解析功能，
 * 让客户端自动识别表的字段信息，无需手动指定。
 */

import { createDubheGraphqlClient } from './client';
import { DubheMetadata } from './types';

// 1. 导入JSON格式的dubhe配置
import dubheConfigJson from '../dubhe.config_1.json';

// 2. 创建客户端实例
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:8080/v1/graphql',
  subscriptionEndpoint: 'ws://localhost:8080/v1/graphql',
  dubheMetadata: dubheConfigJson as unknown as DubheMetadata,
});

// 3. 使用示例
async function exampleUsage() {
  try {
    // 查询counter0表的数据
    const result = await client.getAllTables('counter0', {
      first: 10,
      orderBy: [{ field: 'updatedAt', direction: 'DESC' }],
    });

    console.log('Counter0数据:', result);

    // 查询counter1表的数据
    const counter1Result = await client.getAllTables('counter1', {
      first: 5,
      filter: { value: { greaterThan: 0 } },
    });

    console.log('Counter1数据:', counter1Result);

    // 根据条件查询单个记录
    const singleRecord = await client.getTableByCondition('counter1', {
      entityId: '0x123...',
    });

    console.log('单个记录:', singleRecord);

    // 订阅数据变更
    const subscription = client.subscribeToTableChanges('counter0', {
      onData: (data) => {
        console.log('收到数据变更:', data);
      },
      onError: (error) => {
        console.error('订阅错误:', error);
      },
    });

    // 批量查询多个表
    const batchResult = await client.batchQuery([
      {
        key: 'counters0',
        tableName: 'counter0',
        params: { first: 5 },
      },
      {
        key: 'counters1',
        tableName: 'counter1',
        params: { first: 5 },
      },
    ]);

    console.log('批量查询结果:', batchResult);

    // 获取表字段信息
    const counter0Fields = client.getTableFields('counter0');
    console.log('Counter0字段:', counter0Fields);

    // 获取主键信息
    const counter0PrimaryKeys = client.getTablePrimaryKeys('counter0');
    console.log('Counter0主键:', counter0PrimaryKeys);

    // 多表订阅
    const multiTableSubscription = client.subscribeToTableList(
      ['counter0', 'counter1'],
      {
        onData: (allData) => {
          console.log('多表数据:', allData);
        },
        first: 10,
        initialEvent: true,
      }
    );
  } catch (error) {
    console.error('使用错误:', error);
  }
}

// 输出配置信息
console.log('Dubhe元数据:', client.getDubheMetadata());
console.log('所有表信息:', client.getAllTableInfo());

export { exampleUsage };

// 如果直接运行此文件，执行示例
if (require.main === module) {
  exampleUsage().catch(console.error);
}
