import { gql } from '@apollo/client';
import {
  createDubheGraphqlClient,
  DubheGraphqlClient,
  QueryBuilders,
} from './apollo-client';
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
 * 示例：基础查询操作 - 使用新的API（已去掉store前缀）
 */
export async function exampleBasicQuery() {
  const client = createExampleClient();

  try {
    // 1. 查询encounters表数据（之前是StoreEncounter，现在是encounters）
    const encounters = await client.getAllTables('encounters', {
      first: 10,
      filter: {
        exists: { equalTo: true },
      },
      orderBy: [{ field: 'createdAt', direction: 'DESC' }],
    });

    console.log('Encounters:', encounters);

    // 2. 查询accounts表数据（之前是StoreAccount，现在是accounts）
    const accounts = await client.getAllTables('accounts', {
      first: 5,
      filter: {
        balance: { greaterThan: '0' },
      },
    });

    console.log('Accounts:', accounts);

    // 3. 根据条件查询单个记录
    const specificAccount = await client.getTableByCondition('accounts', {
      assetId: '0x123...',
      account: '0xabc...',
    });
    console.log('Specific account:', specificAccount);

    // 4. 查询positions表数据
    const positions = await client.getAllTables('positions', {
      first: 10,
      orderBy: [{ field: 'x', direction: 'ASC' }],
    });

    console.log('Positions:', positions);
  } catch (error) {
    console.error('Query failed:', error);
  } finally {
    client.close();
  }
}

/**
 * 示例：实时数据订阅 - 使用新的API
 */
export function exampleSubscription() {
  const client = createExampleClient();

  // 订阅encounters表数据变更
  const subscription = client.subscribeToTableChanges('encounters', {
    onData: (data) => {
      console.log('Received real-time data:', data);
    },
    onError: (error) => {
      console.error('Subscription error:', error);
    },
    onComplete: () => {
      console.log('Subscription completed');
    },
  });

  // 订阅数据流
  subscription.subscribe({
    next: (result: any) => {
      if (result.data) {
        console.log('Subscription data:', result.data);
      }
    },
    error: (error: any) => {
      console.error('Subscription stream error:', error);
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
      { key: 'encounters', tableName: 'encounters', params: { first: 5 } },
      { key: 'accounts', tableName: 'accounts', params: { first: 5 } },
      { key: 'positions', tableName: 'positions', params: { first: 5 } },
    ]);

    console.log('Batch query results:', results);
  } catch (error) {
    console.error('Batch query failed:', error);
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
            id
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
