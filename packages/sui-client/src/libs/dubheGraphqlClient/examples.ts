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
 * 示例：基础查询操作
 */
export async function exampleBasicQuery() {
  const client = createExampleClient();

  try {
    // 1. 查询Store表数据
    const storeEncounters = await client.getAllStoreTables('StoreEncounter', {
      first: 10,
      filter: {
        isRemoved: { equalTo: false },
      },
      orderBy: [{ field: 'createdAt', direction: 'DESC' }],
    });

    console.log('Store encounters:', storeEncounters);

    // 2. 根据ID查询单个记录
    const encounter = await client.getStoreTableById(
      'StoreEncounter',
      'some-id'
    );
    console.log('Single encounter:', encounter);
  } catch (error) {
    console.error('Query failed:', error);
  } finally {
    client.close();
  }
}

/**
 * 示例：实时数据订阅
 */
export function exampleSubscription() {
  const client = createExampleClient();

  // 订阅Store表数据变更
  const subscription = client.subscribeToStoreTableChanges('StoreEncounter', {
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
