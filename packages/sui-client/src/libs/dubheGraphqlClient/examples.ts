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
