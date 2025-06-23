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
   * Initialize ECS World
   */
  const initializeECS = async () => {
    try {
      console.log('🎮 Initializing ECS World...');
      // ECS World is already created in useContract, additional initialization work can be done here
      setEcsInitialized(true);
      console.log('✅ ECS World initialized successfully');
    } catch (error) {
      console.error('❌ ECS World initialization failed:', error);
    }
  };

  /**
   * Query counter value using GraphQL client
   */
  const queryCounterValueWithGraphQL = async () => {
    try {
      console.log('🔍 Querying counter value with GraphQL...');

      // Query counter1 component (contains value field)
      const result = await graphqlClient.getAllTables('counter1', {
        first: 1,
        orderBy: [{ field: 'createdAt', direction: 'DESC' }]
      });

      if (result.edges.length > 0) {
        const counterData = result.edges[0].node as any;
        console.log('📊 Counter data:', counterData);
        setValue(counterData.value || 0);
      } else {
        console.log('📊 No counter data found, setting default value 0');
        setValue(0);
      }
    } catch (error) {
      console.error('❌ GraphQL query failed:', error);
      // If query fails, set default value
      setValue(0);
    }
  };

  /**
   * Query counter value using ECS World
   */
  const queryCounterValueWithECS = async () => {
    try {
      console.log('🎮 Querying counter value with ECS World...');

      // Get entities with counter1 component
      if (address) {
        console.log('address', address);
        // Get counter1 component data from first entity
        const counterComponent = (await ecsWorld.getComponent(address, 'counter1')) as any;
        console.log('📊 Counter component data:', counterComponent);
        setValue(counterComponent?.value || 0);
      } else {
        console.log('📊 No counter1 component found, setting default value 0');
        setValue(0);
      }
    } catch (error) {
      console.error('❌ ECS query failed:', error);
      // If query fails, try GraphQL query
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
      console.error('❌ Contract call failed:', error);
      toast.error('Transaction failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Subscribe to counter changes using GraphQL
   */
  const subscribeToCounterWithGraphQL = () => {
    try {
      console.log('📡 Starting GraphQL subscription for counter changes...');

      const observable = graphqlClient.subscribeToTableChanges('counter1', {
        // initialEvent: true, // 🔑 Important: set initialEvent to true
        onData: (data: any) => {
          console.log('📢 GraphQL received counter update:', data);

          // GraphQL subscription data structure: data.listen.query.counter1s.nodes
          console.log('Complete data structure:', JSON.stringify(data, null, 2));
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
          console.error('❌ GraphQL subscription error:', error);
        },
        onComplete: () => {
          console.log('✅ GraphQL subscription completed');
        }
      });

      // Start subscription and return Subscription object
      const subscription = observable.subscribe({});

      return subscription; // Return Subscription object with unsubscribe method
    } catch (error) {
      console.error('❌ GraphQL subscription setup failed:', error);
      return null;
    }
  };

  /**
   * Subscribe to counter changes using ECS World
   */
  const subscribeToCounterWithECS = () => {
    try {
      console.log('🎮 Starting ECS subscription for counter1 component changes...');

      const subscription = ecsWorld
        .onComponentChanged<any>('counter1', {
          // initialEvent: true,
          // debounceMs: 500 // 500ms debounce
        })
        .subscribe({
          next: (result: any) => {
            if (result) {
              console.log(
                `📢 [${new Date().toLocaleTimeString()}] counter1 component changed for entity ${result.entityId}:`
              );
              console.log(`  - Change type: ${result.changeType}`);
              console.log(`  - Component data:`, result.data);
              console.log(`  - Timestamp: ${result.timestamp}`);

              // ECS component data is in result.data
              const componentData = result.data as any;
              if (componentData?.value !== undefined) {
                setValue(componentData.value);
                toast('Counter ECS Updated', {
                  description: `New value: ${componentData.value}`
                });
              }
            }

            if (result.error) {
              console.error('❌ Subscription error:', result.error);
            }

            if (result.loading) {
              console.log('⏳ Data loading...');
            }
          },
          error: (error: any) => {
            console.error('❌ ECS subscription failed:', error);
          },
          complete: () => {
            console.log('✅ ECS subscription completed');
          }
        });

      return subscription;
    } catch (error) {
      console.error('❌ ECS subscription setup failed:', error);
      return null;
    }
  };

  useEffect(() => {
    const initializeAndSubscribe = async () => {
      // Initialize ECS
      await initializeECS();

      // Query initial value (prefer ECS, fallback to GraphQL on failure)
      await queryCounterValueWithECS();

      // Set up subscriptions
      let graphqlSubscription: any = null;
      let ecsSubscription: any = null;

      if (ecsInitialized) {
        // Try ECS subscription
        ecsSubscription = subscribeToCounterWithECS();
      }

      // Also set up GraphQL subscription as backup
      graphqlSubscription = subscribeToCounterWithGraphQL();

      // Cleanup function
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
                ECS Status: {ecsInitialized ? '✅ Initialized' : '⏳ Initializing...'}
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
                    🎮 ECS Query
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                    onClick={() => queryCounterValueWithGraphQL()}
                    disabled={loading}
                  >
                    📊 GraphQL Query
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
