import { gql } from '@apollo/client';
import { createDubheGraphqlClient, DubheGraphqlClient } from '../src/client';
import { Connection, StoreTableRow, DubheClientConfig } from '../src/types';

/**
 * 创建基础客户端
 */
export function createExampleClient(): DubheGraphqlClient {
  const config: DubheClientConfig = {
    endpoint: 'http://localhost:4000/graphql',
    subscriptionEndpoint: 'ws://localhost:4000/graphql',
    headers: {
      Authorization: 'Bearer your-token-here',
    },
  };

  return createDubheGraphqlClient(config);
}

/**
 * 创建带重试功能的客户端
 */
export function createClientWithRetry(): DubheGraphqlClient {
  const config: DubheClientConfig = {
    endpoint: 'http://localhost:4000/graphql',
    subscriptionEndpoint: 'ws://localhost:4000/graphql',
    retryOptions: {
      delay: {
        initial: 500,
        max: 10000,
        jitter: true,
      },
      attempts: {
        max: 3,
        retryIf: (error) => {
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

  return createDubheGraphqlClient(config);
}

/**
 * 基础查询示例
 */
export async function exampleBasicQuery() {
  const client = createExampleClient();

  try {
    // 查询encounters表
    const encounters = await client.getAllTables('encounters', {
      first: 5,
      filter: {
        exists: { equalTo: true },
      },
      orderBy: [{ field: 'createdAt', direction: 'DESC' }],
    });
    console.log('Encounters:', encounters.edges.length, '条记录');

    // 查询accounts表
    const accounts = await client.getAllTables('accounts', {
      first: 5,
      filter: {
        balance: { greaterThan: '0' },
      },
    });
    console.log('Accounts:', accounts.edges.length, '条记录');

    // 条件查询单个记录
    const specificAccount = await client.getTableByCondition('account', {
      assetId: '0x123...',
      account: '0xabc...',
    });
    console.log('条件查询:', specificAccount ? '找到记录' : '未找到记录');
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    client.close();
  }
}

/**
 * 实时订阅示例
 */
export function exampleSubscription() {
  const client = createExampleClient();

  // 基础订阅
  const basicSubscription = client.subscribeToTableChanges('encounters', {
    initialEvent: true,
    fields: ['player', 'monster', 'catchAttempts', 'createdAt'],
    onData: (data) => {
      console.log('实时数据:', data.listen.query.encounters);
    },
    onError: (error) => {
      console.error('订阅错误:', error);
    },
  });

  // 过滤订阅
  const filteredSubscription = client.subscribeToFilteredTableChanges(
    'accounts',
    { balance: { greaterThan: '1000' } },
    {
      initialEvent: true,
      fields: ['assetId', 'account', 'balance', 'updatedAt'],
      orderBy: [{ field: 'balance', direction: 'DESC' }],
      first: 5,
      onData: (data) => {
        console.log('高余额账户更新:', data.listen.query.accounts);
      },
    }
  );

  const subscriptions = [
    basicSubscription.subscribe({}),
    filteredSubscription.subscribe({}),
  ];

  // 10秒后取消订阅
  setTimeout(() => {
    subscriptions.forEach((sub) => sub.unsubscribe());
    client.close();
  }, 10000);
}

/**
 * 批量查询示例
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
          fields: ['player', 'monster', 'catchAttempts', 'updatedAt'],
        },
      },
      {
        key: 'accounts',
        tableName: 'accounts',
        params: {
          first: 5,
          fields: ['account', 'assetId', 'balance', 'updatedAt'],
          filter: { balance: { greaterThan: '0' } },
        },
      },
    ]);

    console.log('批量查询结果:');
    console.log(`Encounters: ${results.encounters.edges.length} 条记录`);
    console.log(`Accounts: ${results.accounts.edges.length} 条记录`);
  } catch (error) {
    console.error('批量查询失败:', error);
  } finally {
    client.close();
  }
}

/**
 * 多表订阅示例
 */
export function exampleMultiTableSubscription() {
  const client = createExampleClient();

  const multiTableSub = client.subscribeToMultipleTables(
    [
      {
        tableName: 'encounters',
        options: {
          initialEvent: true,
          fields: ['player', 'monster', 'catchAttempts'],
          first: 5,
        },
      },
      {
        tableName: 'accounts',
        options: {
          initialEvent: true,
          fields: ['account', 'balance'],
          filter: { balance: { greaterThan: '0' } },
          first: 3,
        },
      },
    ],
    {
      onData: (allData) => {
        console.log('多表订阅数据:', {
          encounters: allData.encounters?.listen.query.encounters,
          accounts: allData.accounts?.listen.query.accounts,
        });
      },
      onError: (error) => {
        console.error('多表订阅错误:', error);
      },
    }
  );

  const subscription = multiTableSub.subscribe({});

  // 30秒后取消订阅
  setTimeout(() => {
    subscription.unsubscribe();
    client.close();
  }, 30000);
}

/**
 * 自定义GraphQL查询示例
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

    console.log('自定义查询结果:', result.data);
  } catch (error) {
    console.error('自定义查询失败:', error);
  } finally {
    client.close();
  }
}

/**
 * 缓存配置示例
 */
export function createClientWithCache(): DubheGraphqlClient {
  return createDubheGraphqlClient({
    endpoint: 'http://localhost:4000/graphql',
    subscriptionEndpoint: 'ws://localhost:4000/graphql',
    cacheConfig: {
      paginatedTables: ['accounts', 'encounters'],
      customMergeStrategies: {
        accounts: {
          keyArgs: ['filter'],
          merge: (existing, incoming) => {
            if (!incoming || !Array.isArray(incoming.edges)) {
              return existing;
            }
            return {
              ...incoming,
              edges: [...(existing?.edges || []), ...incoming.edges],
            };
          },
        },
      },
    },
  });
}
