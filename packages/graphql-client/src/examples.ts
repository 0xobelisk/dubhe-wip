import { gql } from '@apollo/client';
import {
  createDubheGraphqlClient,
  DubheGraphqlClient,
  QueryBuilders,
} from './client';
import { Connection, StoreTableRow, DubheClientConfig } from './types';

/**
 * 使用示例：创建客户端
 */
export function createExampleClient(): DubheGraphqlClient {
  const config: DubheClientConfig = {
    endpoint: 'http://localhost:4000/graphql',
    subscriptionEndpoint: 'ws://localhost:4000/graphql',
    headers: {
      Authorization: 'Bearer your-token-here',
      'X-Custom-Header': 'custom-value',
    },
    fetchOptions: {
      // 可选：自定义fetch选项
    },
  };

  return createDubheGraphqlClient(config);
}

/**
 * 使用示例：创建带重试功能的客户端
 */
export function createClientWithRetry(): DubheGraphqlClient {
  const config: DubheClientConfig = {
    endpoint: 'http://localhost:4000/graphql',
    subscriptionEndpoint: 'ws://localhost:4000/graphql',
    headers: {
      Authorization: 'Bearer your-token-here',
    },
    // 配置重试选项
    retryOptions: {
      delay: {
        initial: 500, // 初始延迟500ms
        max: 10000, // 最大延迟10秒
        jitter: true, // 启用随机抖动
      },
      attempts: {
        max: 3, // 最多重试3次（加上初始请求共4次）
        retryIf: (error, operation) => {
          // 自定义重试条件：
          // 1. 网络错误
          // 2. 5xx服务器错误
          // 3. 超时错误
          console.log(
            `❌ 请求失败，正在重试... 操作: ${operation.operationName}`,
            error
          );

          return Boolean(
            error &&
              (error.networkError ||
                (error.graphQLErrors && error.graphQLErrors.length === 0) ||
                error.networkError?.statusCode >= 500)
          );
        },
      },
    },
  };

  console.log('🔄 创建了带重试功能的GraphQL客户端');
  return createDubheGraphqlClient(config);
}

/**
 * 示例：基础查询操作 - 展示单数/复数自动转换
 */
export async function exampleBasicQuery() {
  const client = createExampleClient();

  try {
    // ✅ 支持单数表名 - 自动转换为复数
    console.log('🔄 使用单数表名查询...');

    // 1. 使用单数 'encounter' - 自动转换为 'encounters'
    const encountersFromSingular = await client.getAllTables('encounter', {
      first: 5,
      filter: {
        exists: { equalTo: true },
      },
      orderBy: [{ field: 'createdAt', direction: 'DESC' }],
    });
    console.log(
      '✅ 单数 "encounter" 查询结果:',
      encountersFromSingular.edges.length,
      '条记录'
    );

    // 2. 使用复数 'encounters' - 保持不变
    const encountersFromPlural = await client.getAllTables('encounters', {
      first: 5,
      filter: {
        exists: { equalTo: true },
      },
    });
    console.log(
      '✅ 复数 "encounters" 查询结果:',
      encountersFromPlural.edges.length,
      '条记录'
    );

    // 3. 使用单数 'account' - 自动转换为 'accounts'
    const accountsFromSingular = await client.getAllTables('account', {
      first: 5,
      filter: {
        balance: { greaterThan: '0' },
      },
    });
    console.log(
      '✅ 单数 "account" 查询结果:',
      accountsFromSingular.edges.length,
      '条记录'
    );

    // 5. 根据条件查询单个记录
    const specificAccount = await client.getTableByCondition('account', {
      assetId: '0x123...',
      account: '0xabc...',
    });
    console.log(
      '🔍 条件查询结果:',
      specificAccount ? '找到记录' : '未找到记录'
    );
  } catch (error) {
    console.error('❌ 查询失败:', error);
  } finally {
    client.close();
  }
}

/**
 * 示例：实时数据订阅 - 使用新的PostGraphile Listen订阅
 */
export function exampleListenSubscription() {
  const client = createExampleClient();

  console.log('🔔 开始使用PostGraphile Listen订阅...');

  // 1. 基础listen订阅 - 支持单数表名自动转换
  const basicSubscription = client.subscribeToTableChanges('encounter', {
    // 单数形式
    initialEvent: true, // 立即获取初始数据
    fields: ['player', 'monster', 'catchAttempts', 'createdAt'],
    topicPrefix: 'store_', // 自定义topic前缀，实际topic会是: postgraphile:game_encounter
    onData: (data) => {
      console.log(
        '📨 Encounters实时数据（单数转复数）:',
        data.listen.query.encounters
      );
    },
    onError: (error) => {
      console.error('❌ Encounters订阅错误:', error);
    },
  });

  // 2. 高级过滤订阅 - 只监听特定条件的数据
  const filteredSubscription = client.subscribeToFilteredTableChanges(
    'account', // 单数形式
    { balance: { greaterThan: '1000' } }, // 只监听余额大于1000的账户
    {
      initialEvent: true,
      fields: ['assetId', 'account', 'balance', 'updatedAt'],
      orderBy: [{ field: 'balance', direction: 'DESC' }],
      first: 5,
      onData: (data) => {
        console.log(
          '💰 高余额账户实时更新（单数转复数）:',
          data.listen.query.accounts
        );
      },
    }
  );

  // 3. 自定义查询订阅
  const customSubscription = client.subscribeWithListen(
    'store_positions',
    `positions(first: 10, filter: { x: { greaterThan: 0 } }) {
      totalCount
      nodes {
        player
        x
        y
        updatedAt
      }
    }`,
    {
      initialEvent: false,
      onData: (data) => {
        console.log('🗺️ 位置数据更新:', data.listen.query.positions);
      },
    }
  );

  // 订阅数据流
  const subscriptions = [
    basicSubscription.subscribe(),
    filteredSubscription.subscribe(),
    customSubscription.subscribe(),
  ];

  // 10秒后取消所有订阅
  setTimeout(() => {
    console.log('🛑 取消所有订阅...');
    subscriptions.forEach((sub) => sub.unsubscribe());
    client.close();
  }, 10000);
}

/**
 * 示例：实时数据订阅 - 使用旧版API（向后兼容）
 */
export function exampleLegacySubscription() {
  const client = createExampleClient();

  // 使用旧版API的订阅（仍然有效，但推荐使用新的listen订阅）
  const subscription = client.subscribeToTableChanges('encounters', {
    onData: (data) => {
      console.log('📨 接收到实时数据（旧版API）:', data);
    },
    onError: (error) => {
      console.error('❌ 订阅错误:', error);
    },
    onComplete: () => {
      console.log('✅ 订阅完成');
    },
  });

  // 订阅数据流
  subscription.subscribe({
    next: (result: any) => {
      if (result.data) {
        console.log('📊 订阅数据:', result.data);
      }
    },
    error: (error: any) => {
      console.error('❌ 订阅流错误:', error);
    },
  });

  // 5秒后取消订阅
  setTimeout(() => {
    subscription.subscribe().unsubscribe();
    client.close();
  }, 5000);
}

/**
 * 示例：批量查询多个表
 */
export async function exampleBatchQuery() {
  const client = createExampleClient();

  try {
    const results = await client.batchQuery([
      {
        key: 'encounters',
        tableName: 'encounters',
        params: {
          first: 5,
          fields: ['player', 'monster', 'catchAttempts', 'updatedAt'], // 指定需要的字段
        },
      },
      {
        key: 'accounts',
        tableName: 'accounts',
        params: {
          first: 5,
          fields: ['account', 'assetId', 'balance', 'updatedAt'], // 指定需要的字段
          filter: { balance: { greaterThan: '0' } }, // 添加过滤条件
        },
      },
      {
        key: 'positions',
        tableName: 'positions',
        params: {
          first: 5,
          fields: ['player', 'x', 'y', 'updatedAt'], // 指定需要的字段
          orderBy: [{ field: 'updatedAt', direction: 'DESC' }], // 添加排序
        },
      },
    ]);

    console.log('✅ 批量查询结果:');
    console.log(`🔍 Encounters: ${results.encounters.edges.length} 条记录`);
    console.log(`💰 Accounts: ${results.accounts.edges.length} 条记录`);
    console.log(`🗺️ Positions: ${results.positions.edges.length} 条记录`);

    // 访问具体数据
    results.encounters.edges.forEach((edge, index) => {
      console.log(`Encounter ${index + 1}:`, edge.node);
    });
  } catch (error) {
    console.error('❌ 批量查询失败:', error);
  } finally {
    client.close();
  }
}

/**
 * 示例：高级批量查询 - 展示 fields、filter、orderBy 的完整用法
 */
export async function exampleAdvancedBatchQuery() {
  const client = createExampleClient();

  try {
    console.log('🚀 开始高级批量查询示例...');

    const results = await client.batchQuery([
      {
        key: 'activeEncounters',
        tableName: 'encounter', // 支持单数形式
        params: {
          first: 10,
          fields: ['player', 'monster', 'catchAttempts', 'exists', 'updatedAt'],
          filter: {
            exists: { equalTo: true },
            catchAttempts: { greaterThan: 0 },
          },
          orderBy: [{ field: 'updatedAt', direction: 'DESC' }],
        },
      },
      {
        key: 'wealthyAccounts',
        tableName: 'account', // 支持单数形式
        params: {
          first: 5,
          fields: ['account', 'assetId', 'balance', 'updatedAt'],
          filter: {
            balance: { greaterThan: '1000' },
          },
          orderBy: [{ field: 'balance', direction: 'DESC' }],
        },
      },
      {
        key: 'recentPositions',
        tableName: 'position', // 支持单数形式
        params: {
          first: 15,
          fields: ['player', 'x', 'y', 'updatedAt'],
          filter: {
            x: { greaterThan: 0 },
            y: { greaterThan: 0 },
          },
          orderBy: [{ field: 'updatedAt', direction: 'DESC' }],
        },
      },
      {
        key: 'defaultFields',
        tableName: 'encounters',
        params: {
          first: 3,
          // 不指定 fields，将使用默认的 updatedAt 字段
        },
      },
    ]);

    console.log('✅ 高级批量查询完成!');

    // 详细展示结果
    console.log('\n📊 查询结果统计:');
    console.log(
      `⚔️ 活跃遭遇: ${results.activeEncounters.totalCount || results.activeEncounters.edges.length} 条`
    );
    console.log(
      `💰 富有账户: ${results.wealthyAccounts.totalCount || results.wealthyAccounts.edges.length} 条`
    );
    console.log(
      `🗺️ 最新位置: ${results.recentPositions.totalCount || results.recentPositions.edges.length} 条`
    );
    console.log(`📋 默认字段: ${results.defaultFields.edges.length} 条`);

    // 展示富有账户的详细信息
    if (results.wealthyAccounts.edges.length > 0) {
      console.log('\n💎 富有账户详情:');
      results.wealthyAccounts.edges.forEach((edge, index) => {
        const account = edge.node;
        console.log(
          `  ${index + 1}. 账户: ${account.account}, 余额: ${account.balance}`
        );
      });
    }

    // 展示最新位置信息
    if (results.recentPositions.edges.length > 0) {
      console.log('\n🎯 最新位置详情:');
      results.recentPositions.edges.slice(0, 5).forEach((edge, index) => {
        const pos = edge.node;
        console.log(
          `  ${index + 1}. 玩家: ${pos.player}, 位置: (${pos.x}, ${pos.y})`
        );
      });
    }

    // 展示默认字段查询结果
    if (results.defaultFields.edges.length > 0) {
      console.log('\n📝 默认字段查询结果 (只有 updatedAt):');
      results.defaultFields.edges.forEach((edge, index) => {
        console.log(`  ${index + 1}. updatedAt: ${edge.node.updatedAt}`);
      });
    }

    return results;
  } catch (error) {
    console.error('❌ 高级批量查询失败:', error);
    throw error;
  } finally {
    client.close();
  }
}

/**
 * 示例：实时数据流
 */
export function exampleRealTimeStream() {
  const client = createExampleClient();

  const stream = client.createRealTimeDataStream('encounters', {
    first: 10,
    filter: { exists: { equalTo: true } },
  });

  const subscription = stream.subscribe({
    next: (data: any) => {
      console.log('Real-time stream data:', data);
    },
    error: (error: any) => {
      console.error('Stream error:', error);
    },
  });

  // 30秒后停止流
  setTimeout(() => {
    subscription.unsubscribe();
    client.close();
  }, 30000);
}

/**
 * 示例：自定义GraphQL查询 - 使用新的表名
 */
export async function exampleCustomQuery() {
  const client = createExampleClient();

  const CUSTOM_QUERY = gql`
    query GetPlayerEncounters($player: String!) {
      encounters(filter: { player: { equalTo: $player } }) {
        edges {
          node {
            entityId
            player
            monster
            catchAttempts
            exists
          }
        }
        totalCount
      }
    }
  `;

  try {
    const result = await client.query(CUSTOM_QUERY, {
      player: '0x123...',
    });

    console.log('Custom query result:', result.data);
  } catch (error) {
    console.error('Custom query failed:', error);
  } finally {
    client.close();
  }
}

/**
 * 示例：网络不稳定环境下使用重试功能
 */
export async function exampleRetryInUnstableNetwork() {
  // 创建带重试功能的客户端
  const client = createClientWithRetry();

  console.log('🌐 开始测试重试功能...');

  try {
    // 在网络不稳定的情况下查询数据
    const startTime = Date.now();

    const encounters = await client.getAllTables('encounters', {
      first: 5,
      filter: { exists: { equalTo: true } },
    });

    const endTime = Date.now();
    console.log(`✅ 查询成功! 耗时: ${endTime - startTime}ms`);
    console.log(`📊 获取到 ${encounters.edges.length} 条encounters数据`);

    // 尝试查询可能失败的数据
    const accounts = await client.getAllTables('accounts', {
      first: 3,
      orderBy: [{ field: 'balance', direction: 'DESC' }],
    });

    console.log(`💰 获取到 ${accounts.edges.length} 条accounts数据`);
  } catch (error) {
    console.error('❌ 重试后仍然失败:', error);
  } finally {
    console.log('🔚 关闭客户端连接');
    client.close();
  }
}

/**
 * 示例：不同重试策略的对比
 */
export function createClientsWithDifferentRetryStrategies() {
  // 1. 保守重试策略（适用于生产环境）
  const conservativeClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    retryOptions: {
      delay: { initial: 1000, max: 5000, jitter: true },
      attempts: { max: 2 }, // 只重试2次
    },
  });

  // 2. 积极重试策略（适用于开发环境）
  const aggressiveClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    retryOptions: {
      delay: { initial: 200, max: 2000, jitter: false },
      attempts: { max: 5 }, // 重试5次
    },
  });

  // 3. 自定义重试策略（只对特定错误重试）
  const customClient = createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    retryOptions: {
      delay: { initial: 300, max: 3000 },
      attempts: {
        max: 3,
        retryIf: (error, operation) => {
          // 只对网络错误和超时错误重试
          const isNetworkError = error?.networkError;
          const isTimeout = error?.message?.includes('timeout');

          if (isNetworkError || isTimeout) {
            console.log(`🔄 重试${operation.operationName}: ${error.message}`);
            return true;
          }

          console.log(`❌ 不重试${operation.operationName}: ${error.message}`);
          return false;
        },
      },
    },
  });

  return {
    conservative: conservativeClient,
    aggressive: aggressiveClient,
    custom: customClient,
  };
}

/**
 * 示例：多表订阅 - 同时订阅多个表的数据变更
 */
export function exampleMultiTableSubscription() {
  const client = createExampleClient();

  console.log('🔔 开始多表订阅示例...');

  // 方式1: 使用详细配置订阅多个表
  const multiTableSubscription = client.subscribeToMultipleTables(
    [
      {
        tableName: 'encounter',
        options: {
          initialEvent: true,
          fields: ['player', 'monster', 'catchAttempts', 'createdAt'],
          filter: { exists: { equalTo: true } },
          first: 5,
          onData: (data: any) => {
            console.log(
              '📊 Encounters表数据更新:',
              data.listen.query.encounters
            );
          },
        },
      },
      {
        tableName: 'account',
        options: {
          initialEvent: true,
          fields: ['assetId', 'account', 'balance', 'updatedAt'],
          filter: { balance: { greaterThan: '0' } },
          first: 3,
          orderBy: [{ field: 'balance', direction: 'DESC' }],
          onData: (data: any) => {
            console.log('💰 Accounts表数据更新:', data.listen.query.accounts);
          },
        },
      },
      {
        tableName: 'position',
        options: {
          initialEvent: true,
          fields: ['player', 'x', 'y', 'updatedAt'],
          first: 10,
          onData: (data: any) => {
            console.log('🗺️ Positions表数据更新:', data.listen.query.positions);
          },
        },
      },
    ],
    {
      onData: (allData) => {
        console.log('🎯 所有表的最新数据:', {
          encounters: allData.encounter?.listen.query.encounters,
          accounts: allData.account?.listen.query.accounts,
          positions: allData.position?.listen.query.positions,
        });
      },
      onError: (error) => {
        console.error('❌ 多表订阅错误:', error);
      },
    }
  );

  // 方式2: 使用简化API订阅表名列表
  const tableListSubscription = client.subscribeToTableList(
    ['encounter', 'account', 'position'],
    {
      initialEvent: true,
      fields: ['entityId', 'createdAt', 'updatedAt'], // 所有表共用的字段
      first: 5,
      onData: (allData) => {
        console.log('📦 表列表订阅数据更新:', {
          tablesCount: Object.keys(allData).length,
          data: allData,
        });
      },
      onError: (error) => {
        console.error('❌ 表列表订阅错误:', error);
      },
    }
  );

  // 订阅数据流
  const subscription1 = multiTableSubscription.subscribe({
    next: (data: any) => {
      console.log('✅ 多表订阅数据接收成功:', Object.keys(data));
    },
    error: (error: any) => {
      console.error('❌ 多表订阅流错误:', error);
    },
  });

  const subscription2 = tableListSubscription.subscribe({
    next: (data: any) => {
      console.log('✅ 表列表订阅数据接收成功:', Object.keys(data));
    },
    error: (error: any) => {
      console.error('❌ 表列表订阅流错误:', error);
    },
  });

  // 15秒后取消所有订阅
  setTimeout(() => {
    console.log('🛑 取消多表订阅...');
    subscription1.unsubscribe();
    subscription2.unsubscribe();
    client.close();
  }, 15000);

  return {
    multiTableSubscription,
    tableListSubscription,
    subscriptions: [subscription1, subscription2],
  };
}

/**
 * 示例：高级多表订阅 - 不同表使用不同的订阅策略
 */
export function exampleAdvancedMultiTableSubscription() {
  const client = createExampleClient();

  console.log('🚀 开始高级多表订阅示例...');

  const advancedSubscription = client.subscribeToMultipleTables(
    [
      // 高频更新的表 - 实时获取最新数据
      {
        tableName: 'position',
        options: {
          initialEvent: true,
          fields: ['player', 'x', 'y', 'updatedAt'],
          first: 20,
          topicPrefix: 'realtime_',
          onData: (data) => {
            console.log(
              '⚡ 位置实时更新:',
              data.listen.query.positions.nodes.length,
              '个位置'
            );
          },
        },
      },
      // 中频更新的表 - 监听特定条件
      {
        tableName: 'encounter',
        options: {
          initialEvent: true,
          fields: ['player', 'monster', 'catchAttempts', 'exists'],
          filter: {
            catchAttempts: { greaterThan: 0 },
            exists: { equalTo: true },
          },
          first: 10,
          orderBy: [{ field: 'createdAt', direction: 'DESC' }],
          onData: (data) => {
            console.log(
              '⚔️ 活跃遭遇更新:',
              data.listen.query.encounters.totalCount,
              '个遭遇'
            );
          },
        },
      },
      // 低频更新的表 - 只关注大额变动
      {
        tableName: 'account',
        options: {
          initialEvent: false, // 不获取初始数据，只监听变更
          fields: ['account', 'assetId', 'balance'],
          filter: { balance: { greaterThan: '10000' } }, // 只监听大额账户
          first: 5,
          orderBy: [{ field: 'balance', direction: 'DESC' }],
          onData: (data) => {
            console.log('💎 大额账户变动:', data.listen.query.accounts);
            // 可以在这里触发特殊业务逻辑
          },
        },
      },
    ],
    {
      onData: (allData) => {
        const summary = {
          positions: allData.position?.listen.query.positions?.totalCount || 0,
          encounters:
            allData.encounter?.listen.query.encounters?.totalCount || 0,
          accounts: allData.account?.listen.query.accounts?.totalCount || 0,
          timestamp: new Date().toISOString(),
        };
        console.log('📊 多表数据摘要:', summary);
      },
      onError: (error) => {
        console.error('❌ 高级多表订阅错误:', error);
      },
      onComplete: () => {
        console.log('✅ 高级多表订阅完成');
      },
    }
  );

  const subscription = advancedSubscription.subscribe();

  // 30秒后停止订阅
  setTimeout(() => {
    console.log('🔚 停止高级多表订阅');
    subscription.unsubscribe();
    client.close();
  }, 30000);

  return { subscription, client };
}
