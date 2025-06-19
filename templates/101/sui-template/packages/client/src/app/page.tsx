'use client';

import { Transaction, TransactionResult } from '@0xobelisk/sui-client';
import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { Value } from '@/app/state';
import { DUBHE_SCHEMA_ID } from '../../../contracts/deployment';
import { toast } from 'sonner';
import { useContract } from './dubhe/useContract';

export default function Home() {
  const [value, setValue] = useAtom(Value);
  const [loading, setLoading] = useState(false);
  const [ecsInitialized, setEcsInitialized] = useState(false);

  const { contract, graphqlClient, ecsWorld, network, packageId, address } = useContract();

  /**
   * 初始化ECS World
   */
  const initializeECS = async () => {
    try {
      console.log('🎮 初始化 ECS World...');
      // ECS World 在 useContract 中已经创建，这里可以做额外的初始化工作
      setEcsInitialized(true);
      console.log('✅ ECS World 初始化成功');
    } catch (error) {
      console.error('❌ ECS World 初始化失败:', error);
    }
  };

  /**
   * 使用GraphQL客户端查询counter值
   */
  const queryCounterValueWithGraphQL = async () => {
    try {
      console.log('🔍 使用 GraphQL 查询 counter 值...');

      // 查询 counter1 组件（包含 value 字段）
      const result = await graphqlClient.getAllTables('counter1', {
        first: 1,
        orderBy: [{ field: 'createdAt', direction: 'DESC' }]
      });

      if (result.edges.length > 0) {
        const counterData = result.edges[0].node as any;
        console.log('📊 Counter 数据:', counterData);
        setValue(counterData.value || 0);
      } else {
        console.log('📊 未找到 counter 数据，设置默认值 0');
        setValue(0);
      }
    } catch (error) {
      console.error('❌ GraphQL 查询失败:', error);
      // 如果查询失败，设置默认值
      setValue(0);
    }
  };

  /**
   * 使用ECS World查询counter值
   */
  const queryCounterValueWithECS = async () => {
    try {
      console.log('🎮 使用 ECS World 查询 counter 值...');

      // 获取拥有 counter1 组件的实体
      if (address) {
        console.log('address', address);
        // 获取第一个实体的 counter1 组件数据
        const counterComponent = (await ecsWorld.getComponent(address, 'counter1')) as any;
        console.log('📊 Counter 组件数据:', counterComponent);
        setValue(counterComponent?.value || 0);
      } else {
        console.log('📊 未找到 counter1 组件，设置默认值 0');
        setValue(0);
      }
    } catch (error) {
      console.error('❌ ECS 查询失败:', error);
      // 如果查询失败，尝试GraphQL查询
      await queryCounterValueWithGraphQL();
    }
  };

  /**
   * Increments the counter value
   */
  const incrementCounter = async () => {
    setLoading(true);
    try {
      const tx = new Transaction();
      (await contract.tx.counter_system.inc({
        tx,
        params: [tx.object(DUBHE_SCHEMA_ID), tx.pure.u32(1)],
        isRaw: true
      })) as TransactionResult;

      await contract.signAndSendTxn({
        tx,
        onSuccess: async (result) => {
          setTimeout(async () => {
            toast('Transaction Successful', {
              description: new Date().toUTCString(),
              action: {
                label: 'Check in Explorer',
                onClick: () => window.open(contract.getTxExplorerUrl(result.digest), '_blank')
              }
            });
          }, 200);
        },
        onError: (error) => {
          console.error('Transaction failed:', error);
          toast.error('Transaction failed. Please try again.');
        }
      });
    } catch (error) {
      console.error('❌ 合约调用失败:', error);
      toast.error('Transaction failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 使用GraphQL订阅counter变化
   */
  const subscribeToCounterWithGraphQL = () => {
    try {
      console.log('📡 开始 GraphQL 订阅 counter 变化...');

      const observable = graphqlClient.subscribeToTableChanges('counter1', {
        // initialEvent: true, // 🔑 重要：设置 initialEvent 为 true
        onData: (data: any) => {
          console.log('📢 GraphQL 收到 counter 更新:', data);

          // GraphQL 订阅数据结构：data.listen.query.counter1s.nodes
          console.log('完整数据结构:', JSON.stringify(data, null, 2));
          const nodes = data?.listen?.query?.counter1s?.nodes;
          console.log('nodes:', nodes);
          if (nodes && Array.isArray(nodes) && nodes.length > 0) {
            const latestCounter = nodes[0];
            if (latestCounter?.value !== undefined) {
              setValue(latestCounter.value);
              toast('Counter GraphQL Updated', {
                description: `New value: ${latestCounter.value}`
              });
            }
          }
        },
        onError: (error: any) => {
          console.error('❌ GraphQL 订阅错误:', error);
        },
        onComplete: () => {
          console.log('✅ GraphQL 订阅完成');
        }
      });

      // 启动订阅并返回 Subscription 对象
      const subscription = observable.subscribe({});

      return subscription; // 返回 Subscription 对象，有 unsubscribe 方法
    } catch (error) {
      console.error('❌ GraphQL 订阅设置失败:', error);
      return null;
    }
  };

  /**
   * 使用ECS World订阅counter变化
   */
  const subscribeToCounterWithECS = () => {
    try {
      console.log('🎮 开始 ECS 订阅 counter1 组件变化...');

      const subscription = ecsWorld
        .onComponentChanged<any>('counter1', {
          initialEvent: true,
          debounceMs: 500 // 500ms 防抖
        })
        .subscribe({
          next: (result: any) => {
            if (result.data) {
              console.log(
                `📢 [${new Date().toLocaleTimeString()}] 实体 ${result.data.entityId} 的 counter1 组件发生变化:`
              );
              console.log(`  - 变化类型: ${result.data.changeType}`);
              console.log(`  - 组件数据:`, result.data.data);
              console.log(`  - 时间戳: ${result.data.timestamp}`);

              // ECS 组件数据在 result.data.data 中
              const componentData = result.data.data as any;
              if (componentData?.value !== undefined) {
                setValue(componentData.value);
                toast('Counter ECS Updated', {
                  description: `New value: ${componentData.value}`
                });
              }
            }

            if (result.error) {
              console.error('❌ 订阅错误:', result.error);
            }

            if (result.loading) {
              console.log('⏳ 数据加载中...');
            }
          },
          error: (error: any) => {
            console.error('❌ ECS 订阅失败:', error);
          },
          complete: () => {
            console.log('✅ ECS 订阅完成');
          }
        });

      return subscription;
    } catch (error) {
      console.error('❌ ECS 订阅设置失败:', error);
      return null;
    }
  };

  useEffect(() => {
    const initializeAndSubscribe = async () => {
      // 初始化ECS
      await initializeECS();

      // 查询初始值（优先使用ECS，失败则回退到GraphQL）
      await queryCounterValueWithECS();

      // 设置订阅
      let graphqlSubscription: any = null;
      let ecsSubscription: any = null;

      if (ecsInitialized) {
        // 尝试ECS订阅
        ecsSubscription = subscribeToCounterWithECS();
      }

      // 同时设置GraphQL订阅作为备选
      graphqlSubscription = subscribeToCounterWithGraphQL();

      // 清理函数
      return () => {
        if (ecsSubscription) {
          ecsSubscription.unsubscribe();
        }
        if (graphqlSubscription) {
          graphqlSubscription.unsubscribe();
        }
      };
    };

    const cleanup = initializeAndSubscribe();

    return () => {
      cleanup.then((cleanupFn) => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [ecsInitialized]);

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <div className="max-w-7xl mx-auto text-center py-12 px-4 sm:px-6 lg:py-16 lg:px-8 flex-6">
          <div className="flex flex-col gap-6 mt-12">
            <div className="flex flex-col gap-4">
              <div className="text-sm text-gray-600">
                ECS Status: {ecsInitialized ? '✅ 已初始化' : '⏳ 初始化中...'}
              </div>
              You account already have some sui from {network}
              <div className="flex flex-col gap-6 text-2xl text-green-600 mt-6 ">
                Counter: {value}
              </div>
              <div className="flex flex-col gap-6">
                <button
                  type="button"
                  className="mx-auto px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                  onClick={() => incrementCounter()}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Increment'}
                </button>
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                    onClick={() => queryCounterValueWithECS()}
                    disabled={loading}
                  >
                    🎮 ECS 查询
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                    onClick={() => queryCounterValueWithGraphQL()}
                    disabled={loading}
                  >
                    📊 GraphQL 查询
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
