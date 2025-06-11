import { NETWORK, PACKAGE_ID } from 'contracts/deployment';
import { dubheConfig } from 'contracts/dubhe.config';
import metadata from 'contracts/metadata.json';
import { Dubhe, SuiMoveNormalizedModules } from '@0xobelisk/sui-client';
import { createDubheGraphqlClient } from '@0xobelisk/graphql-client';
import { createECSWorld } from '@0xobelisk/ecs';
import dotenv from 'dotenv';

dotenv.config();

export function useContract() {
  const contract = new Dubhe({
    networkType: NETWORK,
    packageId: PACKAGE_ID,
    metadata: metadata as SuiMoveNormalizedModules,
    secretKey: process.env.NEXT_PUBLIC_PRIVATE_KEY
  });

  // 创建 GraphQL 客户端
  const graphqlClient = createDubheGraphqlClient({
    endpoint: process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql',
    subscriptionEndpoint:
      process.env.NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT || 'ws://localhost:4000/graphql',
    dubheConfig: dubheConfig
  });

  // 创建 ECS World
  const ecsWorld = createECSWorld(graphqlClient, {
    queryConfig: {
      enableBatchOptimization: true, // 启用批量查询优化
      defaultCacheTimeout: 5000 // 5秒缓存超时
    },
    subscriptionConfig: {
      defaultDebounceMs: 100, // 100ms 防抖
      reconnectOnError: true // 错误时自动重连
    }
  });

  return {
    contract,
    graphqlClient,
    ecsWorld,
    metadata
  };
}
