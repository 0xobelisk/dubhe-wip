import { createDubheGraphqlClient } from './apollo-client';

/**
 * 测试 batchQuery 的 fields 功能和默认字段
 */
async function testBatchQueryFields() {
  const client = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    subscriptionEndpoint: 'ws://localhost:4000/graphql',
  });

  console.log('🧪 开始测试 batchQuery 的 fields 功能...');

  try {
    // 测试1: 使用自定义 fields
    console.log('\n📋 测试1: 使用自定义字段');
    const customFieldsResult = await client.batchQuery([
      {
        key: 'customEncounters',
        tableName: 'encounters',
        params: {
          first: 2,
          fields: ['player', 'monster', 'updatedAt'], // 自定义字段
        },
      },
      {
        key: 'customAccounts',
        tableName: 'accounts',
        params: {
          first: 2,
          fields: ['account', 'balance', 'updatedAt'], // 自定义字段
        },
      },
    ]);

    console.log('✅ 自定义字段查询成功');
    console.log(
      'Encounters 字段:',
      Object.keys(customFieldsResult.customEncounters.edges[0]?.node || {})
    );
    console.log(
      'Accounts 字段:',
      Object.keys(customFieldsResult.customAccounts.edges[0]?.node || {})
    );

    // 测试2: 不指定 fields，使用默认字段 (updatedAt)
    console.log('\n📋 测试2: 使用默认字段 (updatedAt)');
    const defaultFieldsResult = await client.batchQuery([
      {
        key: 'defaultEncounters',
        tableName: 'encounters',
        params: {
          first: 2,
          // 不指定 fields，应该使用默认的 updatedAt
        },
      },
    ]);

    console.log('✅ 默认字段查询成功');
    console.log(
      '默认字段:',
      Object.keys(defaultFieldsResult.defaultEncounters.edges[0]?.node || {})
    );

    // 验证默认字段是否包含 updatedAt
    const firstNode = defaultFieldsResult.defaultEncounters.edges[0]?.node;
    if (firstNode && 'updatedAt' in firstNode) {
      console.log('✅ 默认字段包含 updatedAt:', firstNode.updatedAt);
    } else {
      console.log('❌ 默认字段不包含 updatedAt');
    }

    // 测试3: 混合使用 fields、filter、orderBy
    console.log('\n📋 测试3: 完整功能测试');
    const fullFeaturesResult = await client.batchQuery([
      {
        key: 'filteredEncounters',
        tableName: 'encounters',
        params: {
          first: 3,
          fields: ['player', 'monster', 'catchAttempts', 'updatedAt'],
          filter: {
            exists: { equalTo: true },
          },
          orderBy: [{ field: 'updatedAt', direction: 'DESC' }],
        },
      },
      {
        key: 'filteredAccounts',
        tableName: 'accounts',
        params: {
          first: 3,
          fields: ['account', 'assetId', 'balance', 'updatedAt'],
          filter: {
            balance: { greaterThan: '0' },
          },
          orderBy: [{ field: 'balance', direction: 'DESC' }],
        },
      },
    ]);

    console.log('✅ 完整功能测试成功');
    console.log(
      `过滤后的 Encounters: ${fullFeaturesResult.filteredEncounters.edges.length} 条`
    );
    console.log(
      `过滤后的 Accounts: ${fullFeaturesResult.filteredAccounts.edges.length} 条`
    );
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    client.close();
  }
}

// 导出测试函数
export { testBatchQueryFields };

// 如果直接运行此文件，执行测试
if (require.main === module) {
  testBatchQueryFields();
}
