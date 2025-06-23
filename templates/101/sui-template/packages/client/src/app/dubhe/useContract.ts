import { NETWORK, PACKAGE_ID } from 'contracts/deployment';
import dubheMetadata from 'contracts/dubhe.config.json';
import metadata from 'contracts/metadata.json';
import { Dubhe, SuiMoveNormalizedModules } from '@0xobelisk/sui-client';
import { createDubheGraphqlClient } from '@0xobelisk/graphql-client';
import { createECSWorld } from '@0xobelisk/ecs';
import { useMemo } from 'react';
import dotenv from 'dotenv';

dotenv.config();

export function useContract() {
  // 缓存 Dubhe 合约实例
  const contract = useMemo(() => {
    console.log('🔧 创建 Dubhe 合约实例...');
    return new Dubhe({
      networkType: NETWORK,
      packageId: PACKAGE_ID,
      metadata: metadata as SuiMoveNormalizedModules,
      secretKey: process.env.NEXT_PUBLIC_PRIVATE_KEY
    });
  }, []);

  // 缓存 GraphQL 客户端实例
  const graphqlClient = useMemo(() => {
    console.log('🔧 创建 GraphQL 客户端...');
    return createDubheGraphqlClient({
      endpoint: process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql',
      subscriptionEndpoint:
        process.env.NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT || 'ws://localhost:4000/graphql',
      dubheMetadata
    });
  }, []);

  // 缓存 ECS World 实例
  const ecsWorld = useMemo(() => {
    console.log('🔧 创建 ECS World...');
    return createECSWorld(graphqlClient, {
      queryConfig: {
        enableBatchOptimization: true, // 启用批量查询优化
        defaultCacheTimeout: 5000 // 5秒缓存超时
      },
      subscriptionConfig: {
        defaultDebounceMs: 100, // 100ms 防抖
        reconnectOnError: true // 错误时自动重连
      }
    });
  }, [graphqlClient]);

  // 缓存地址（避免每次重新计算）
  const address = useMemo(() => {
    return contract.getAddress();
  }, [contract]);

  return useMemo(
    () => ({
      contract,
      graphqlClient,
      ecsWorld,
      metadata,
      network: NETWORK,
      packageId: PACKAGE_ID,
      address
    }),
    [contract, graphqlClient, ecsWorld, address]
  );
}
