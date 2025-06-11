'use client';

import React, { useEffect, useState } from 'react';
import { useContract } from './useContract';

interface Player {
  id: string;
  name: string;
  level: number;
  createdAt: string;
  updatedAt: string;
}

interface Position {
  id: string;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
}

export function ExampleUsage() {
  const { contract, graphqlClient, ecsWorld } = useContract();

  const [players, setPlayers] = useState<Player[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 初始化 ECS World
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        console.log('✅ ECS World 初始化成功');
      } catch (err) {
        console.error('❌ ECS World 初始化失败:', err);
        setError('ECS World 初始化失败');
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  // 使用 GraphQL 客户端查询数据
  const queryPlayersWithGraphQL = async () => {
    try {
      setLoading(true);
      console.log('🔍 使用 GraphQL 客户端查询玩家数据...');

      const result = await graphqlClient.getAllTables<Player>('player', {
        first: 10,
        orderBy: [{ field: 'createdAt', direction: 'DESC' }]
      });

      const playerData = result.edges.map((edge) => edge.node);
      setPlayers(playerData);
      console.log(`✅ 查询到 ${playerData.length} 个玩家`);
    } catch (err) {
      console.error('❌ GraphQL 查询失败:', err);
      setError('GraphQL 查询失败');
    } finally {
      setLoading(false);
    }
  };

  // 使用 ECS World 查询数据
  const queryPlayersWithECS = async () => {
    try {
      setLoading(true);
      console.log('🎮 使用 ECS World 查询玩家实体...');

      // 获取所有拥有 player 组件的实体
      const playerEntityIds = await ecsWorld.getEntitiesByComponent('player');
      console.log(`🎯 找到 ${playerEntityIds.length} 个玩家实体`);

      // 获取每个实体的详细数据
      const playerEntities = [];
      for (const entityId of playerEntityIds.slice(0, 10)) {
        const entityData = await ecsWorld.getEntity(entityId);
        if (entityData) {
          playerEntities.push(entityData);
        }
      }

      console.log(`📊 获取到 ${playerEntities.length} 个玩家实体的详细数据`);

      // 如果需要，也可以查询位置数据
      const positionEntityIds = await ecsWorld.getEntitiesByComponent('position');
      console.log(`📍 找到 ${positionEntityIds.length} 个位置实体`);
    } catch (err) {
      console.error('❌ ECS 查询失败:', err);
      setError('ECS 查询失败');
    } finally {
      setLoading(false);
    }
  };

  // 订阅玩家组件变化
  const subscribeToPlayerChanges = () => {
    console.log('🔔 开始订阅玩家组件变化...');

    const unsubscribe = ecsWorld.onComponentChanged<Player>('player', (entityId, component) => {
      console.log(`📢 玩家实体 ${entityId} 发生变化:`, component);
      // 这里可以更新 UI 状态
    });

    // 返回取消订阅函数
    return unsubscribe;
  };

  // 使用 GraphQL 客户端进行实时订阅
  const subscribeToPlayersWithGraphQL = () => {
    console.log('📡 开始订阅玩家表变化...');

    const subscription = graphqlClient.subscribeToTableChanges<Player>('player', {
      fields: ['id', 'name', 'level', 'createdAt', 'updatedAt'],
      initialEvent: true
    });

    subscription.subscribe({
      next: (result) => {
        console.log('📢 GraphQL 订阅收到数据:', result);
        // 这里可以更新 UI 状态
      },
      error: (err) => {
        console.error('❌ GraphQL 订阅错误:', err);
      },
      complete: () => {
        console.log('✅ GraphQL 订阅完成');
      }
    });

    return subscription;
  };

  // 使用 Sui 合约进行链上操作
  const callSuiContract = async () => {
    try {
      console.log('⛓️ 调用 Sui 合约...');

      // 这里调用你的合约方法
      // const result = await contract.tx.some_method();
      // console.log('✅ 合约调用成功:', result);

      console.log('📝 合约元数据:', contract.metadata);
    } catch (err) {
      console.error('❌ 合约调用失败:', err);
      setError('合约调用失败');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Dubhe 客户端使用示例</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          错误: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* GraphQL 客户端操作 */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">📊 GraphQL 客户端</h2>
          <div className="space-y-2">
            <button
              onClick={queryPlayersWithGraphQL}
              disabled={loading}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50 w-full"
            >
              {loading ? '查询中...' : '查询玩家数据'}
            </button>
            <button
              onClick={subscribeToPlayersWithGraphQL}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 w-full"
            >
              订阅玩家变化
            </button>
          </div>
          {players.length > 0 && (
            <div className="mt-4">
              <h3 className="font-medium">查询结果 ({players.length} 条):</h3>
              <pre className="text-xs bg-white p-2 rounded mt-2 overflow-auto">
                {JSON.stringify(players.slice(0, 3), null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* ECS World 操作 */}
        <div className="bg-green-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">🎮 ECS World</h2>
          <div className="space-y-2">
            <button
              onClick={queryPlayersWithECS}
              disabled={loading}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50 w-full"
            >
              {loading ? '查询中...' : '查询玩家实体'}
            </button>
            <button
              onClick={subscribeToPlayerChanges}
              disabled={loading}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 w-full"
            >
              订阅组件变化
            </button>
          </div>
        </div>

        {/* Sui 合约操作 */}
        <div className="bg-purple-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">⛓️ Sui 合约</h2>
          <div className="space-y-2">
            <button
              onClick={callSuiContract}
              className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 w-full"
            >
              调用合约方法
            </button>
            <div className="text-xs text-gray-600">状态: {contract ? '已连接' : '未连接'}</div>
          </div>
        </div>

        {/* 综合示例 */}
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">🔄 综合操作</h2>
          <div className="space-y-2">
            <button
              onClick={async () => {
                await queryPlayersWithGraphQL();
                await queryPlayersWithECS();
              }}
              disabled={loading}
              className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 disabled:opacity-50 w-full"
            >
              同时查询数据
            </button>
            <div className="text-xs text-gray-600">使用 GraphQL 和 ECS 同时查询数据</div>
          </div>
        </div>
      </div>

      {/* 使用说明 */}
      <div className="mt-8 bg-gray-50 p-4 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">📖 使用说明</h2>
        <div className="text-sm space-y-2">
          <p>
            <strong>GraphQL 客户端:</strong>{' '}
            用于直接查询和订阅数据库表数据，支持分页、过滤、排序等高级功能。
          </p>
          <p>
            <strong>ECS World:</strong> 提供实体-组件-系统模式的数据访问，更适合游戏逻辑开发。
          </p>
          <p>
            <strong>Sui 合约:</strong> 用于调用链上合约方法，执行区块链交易。
          </p>
          <p>
            <strong>环境变量:</strong> 确保设置了 NEXT_PUBLIC_GRAPHQL_ENDPOINT 和
            NEXT_PUBLIC_PRIVATE_KEY。
          </p>
        </div>
      </div>
    </div>
  );
}
