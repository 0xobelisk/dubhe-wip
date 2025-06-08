// ECS订阅系统实现

import { Observable } from '@apollo/client';
import { DubheGraphqlClient } from '../dubheGraphqlClient/apollo-client';
import {
  EntityId,
  ComponentType,
  ComponentCallback,
  QueryChangeCallback,
  QueryWatcher,
  QueryChange,
  SubscriptionOptions,
  Unsubscribe,
  ComponentChangeEvent,
} from './types';
import {
  calculateDelta,
  debounce,
  isValidEntityId,
  isValidComponentType,
  formatError,
  createTimestamp,
} from './utils';

/**
 * ECS订阅系统核心实现
 */
export class ECSSubscription {
  private graphqlClient: DubheGraphqlClient;
  private subscriptions = new Map<string, any>();
  private queryWatchers = new Map<string, QueryWatcherImpl>();

  constructor(graphqlClient: DubheGraphqlClient) {
    this.graphqlClient = graphqlClient;
  }

  /**
   * 监听组件添加事件
   */
  onComponentAdded<T>(
    componentType: ComponentType,
    callback: ComponentCallback<T>,
    options?: SubscriptionOptions
  ): Unsubscribe {
    if (!isValidComponentType(componentType)) {
      console.warn(`无效的组件类型: ${componentType}`);
      return () => {};
    }

    const subscriptionKey = `component_added_${componentType}_${Date.now()}`;

    try {
      const debouncedCallback = options?.debounceMs
        ? debounce(callback, options.debounceMs)
        : callback;

      const subscription = this.graphqlClient.subscribeToTableChanges(
        componentType,
        {
          initialEvent: options?.initialEvent ?? false,
          fields: ['updatedAt'],
          onData: (data) => {
            try {
              // PostGraphile Listen 提供的数据结构
              const relatedNode = data.listen?.relatedNode;
              if (relatedNode && relatedNode.id) {
                debouncedCallback(relatedNode.id, relatedNode as T);
              }

              // 处理批量数据
              const pluralTableName = this.getPluralTableName(componentType);
              const nodes = data.listen?.query?.[pluralTableName]?.nodes;
              if (nodes && Array.isArray(nodes)) {
                nodes.forEach((node: any) => {
                  if (node && node.id) {
                    debouncedCallback(node.id, node as T);
                  }
                });
              }
            } catch (error) {
              console.error(`组件添加回调执行失败: ${formatError(error)}`);
            }
          },
          onError: (error) => {
            console.error(
              `组件${componentType}添加事件订阅失败: ${formatError(error)}`
            );
          },
        }
      );

      this.subscriptions.set(subscriptionKey, subscription);

      return () => {
        subscription?.unsubscribe();
        this.subscriptions.delete(subscriptionKey);
      };
    } catch (error) {
      console.error(`创建组件添加订阅失败: ${formatError(error)}`);
      return () => {};
    }
  }

  /**
   * 监听组件移除事件
   */
  onComponentRemoved<T>(
    componentType: ComponentType,
    callback: ComponentCallback<T>,
    options?: SubscriptionOptions
  ): Unsubscribe {
    if (!isValidComponentType(componentType)) {
      console.warn(`无效的组件类型: ${componentType}`);
      return () => {};
    }

    // 注意：PostGraphile Listen 可能不直接支持删除事件
    // 这里我们通过监听数据变化来推断删除
    const subscriptionKey = `component_removed_${componentType}_${Date.now()}`;
    let lastKnownEntities = new Set<EntityId>();

    try {
      const debouncedCallback = options?.debounceMs
        ? debounce(callback, options.debounceMs)
        : callback;

      // 首先获取当前实体列表
      this.initializeLastKnownEntities(componentType, lastKnownEntities);

      const subscription = this.graphqlClient.subscribeToTableChanges(
        componentType,
        {
          initialEvent: false,
          fields: ['updatedAt'],
          onData: (data) => {
            try {
              // 获取当前的实体列表
              const pluralTableName = this.getPluralTableName(componentType);
              const nodes = data.listen?.query?.[pluralTableName]?.nodes || [];
              const currentEntities = new Set<EntityId>(
                nodes.map((node: any) => node.id)
              );

              // 找出被移除的实体
              const removedEntities = Array.from(lastKnownEntities).filter(
                (entityId) => !currentEntities.has(entityId)
              );

              removedEntities.forEach((entityId) => {
                debouncedCallback(entityId, null as any); // 移除事件不提供数据
              });

              lastKnownEntities = currentEntities;
            } catch (error) {
              console.error(`组件移除回调执行失败: ${formatError(error)}`);
            }
          },
          onError: (error) => {
            console.error(
              `组件${componentType}移除事件订阅失败: ${formatError(error)}`
            );
          },
        }
      );

      this.subscriptions.set(subscriptionKey, subscription);

      return () => {
        subscription?.unsubscribe();
        this.subscriptions.delete(subscriptionKey);
      };
    } catch (error) {
      console.error(`创建组件移除订阅失败: ${formatError(error)}`);
      return () => {};
    }
  }

  /**
   * 监听组件变化事件（添加、删除、修改）
   */
  onComponentChanged<T>(
    componentType: ComponentType,
    callback: ComponentCallback<T>,
    options?: SubscriptionOptions
  ): Unsubscribe {
    if (!isValidComponentType(componentType)) {
      console.warn(`无效的组件类型: ${componentType}`);
      return () => {};
    }

    const subscriptionKey = `component_changed_${componentType}_${Date.now()}`;

    try {
      const debouncedCallback = options?.debounceMs
        ? debounce(callback, options.debounceMs)
        : callback;

      const subscription = this.graphqlClient.subscribeToTableChanges(
        componentType,
        {
          initialEvent: options?.initialEvent ?? false,
          onData: (data) => {
            try {
              // 处理单个变更
              const relatedNode = data.listen?.relatedNode;
              if (relatedNode && relatedNode.id) {
                debouncedCallback(relatedNode.id, relatedNode as T);
              }

              // 处理批量数据
              const pluralTableName = this.getPluralTableName(componentType);
              const nodes = data.listen?.query?.[pluralTableName]?.nodes;
              if (nodes && Array.isArray(nodes)) {
                nodes.forEach((node: any) => {
                  if (node && node.id) {
                    debouncedCallback(node.id, node as T);
                  }
                });
              }
            } catch (error) {
              console.error(`组件变化回调执行失败: ${formatError(error)}`);
            }
          },
          onError: (error) => {
            console.error(
              `组件${componentType}变化事件订阅失败: ${formatError(error)}`
            );
          },
        }
      );

      this.subscriptions.set(subscriptionKey, subscription);

      return () => {
        subscription?.unsubscribe();
        this.subscriptions.delete(subscriptionKey);
      };
    } catch (error) {
      console.error(`创建组件变化订阅失败: ${formatError(error)}`);
      return () => {};
    }
  }

  /**
   * 监听特定条件的组件变化
   */
  onComponentCondition<T>(
    componentType: ComponentType,
    filter: Record<string, any>,
    callback: ComponentCallback<T>,
    options?: SubscriptionOptions
  ): Unsubscribe {
    if (!isValidComponentType(componentType)) {
      console.warn(`无效的组件类型: ${componentType}`);
      return () => {};
    }

    const subscriptionKey = `component_condition_${componentType}_${Date.now()}`;

    try {
      const debouncedCallback = options?.debounceMs
        ? debounce(callback, options.debounceMs)
        : callback;

      const subscription = this.graphqlClient.subscribeToFilteredTableChanges(
        componentType,
        filter,
        {
          initialEvent: options?.initialEvent ?? false,
          onData: (data) => {
            try {
              const pluralTableName = this.getPluralTableName(componentType);
              const nodes = data.listen?.query?.[pluralTableName]?.nodes || [];

              nodes.forEach((node: any) => {
                if (node && node.id) {
                  debouncedCallback(node.id, node as T);
                }
              });
            } catch (error) {
              console.error(`条件组件变化回调执行失败: ${formatError(error)}`);
            }
          },
          onError: (error) => {
            console.error(
              `条件组件${componentType}订阅失败: ${formatError(error)}`
            );
          },
        }
      );

      this.subscriptions.set(subscriptionKey, subscription);

      return () => {
        subscription?.unsubscribe();
        this.subscriptions.delete(subscriptionKey);
      };
    } catch (error) {
      console.error(`创建条件组件订阅失败: ${formatError(error)}`);
      return () => {};
    }
  }

  /**
   * 监听查询结果变化
   */
  watchQuery(
    componentTypes: ComponentType[],
    callback: QueryChangeCallback,
    options?: SubscriptionOptions
  ): QueryWatcher {
    const validTypes = componentTypes.filter(isValidComponentType);
    if (validTypes.length === 0) {
      console.warn('没有有效的组件类型用于查询监听');
      return {
        unsubscribe: () => {},
        getCurrentResults: () => [],
      };
    }

    const watcherKey = `query_watcher_${validTypes.join(',')}_${Date.now()}`;
    const watcher = new QueryWatcherImpl(
      this.graphqlClient,
      validTypes,
      callback,
      options
    );

    this.queryWatchers.set(watcherKey, watcher);

    return {
      unsubscribe: () => {
        watcher.dispose();
        this.queryWatchers.delete(watcherKey);
      },
      getCurrentResults: () => watcher.getCurrentResults(),
    };
  }

  /**
   * 创建实时数据流
   */
  createRealTimeStream<T>(
    componentType: ComponentType,
    initialFilter?: Record<string, any>
  ): Observable<Array<{ entityId: EntityId; data: T }>> {
    if (!isValidComponentType(componentType)) {
      return new Observable((subscriber: any) => {
        subscriber.error(new Error(`无效的组件类型: ${componentType}`));
      });
    }

    return new Observable((subscriber: any) => {
      try {
        const subscription = this.graphqlClient.createRealTimeDataStream(
          componentType,
          { filter: initialFilter }
        );

        const streamSubscription = subscription.subscribe({
          next: (connection: any) => {
            const results = connection.edges
              .map((edge: any) => {
                const node = edge.node as any;
                const entityId =
                  node.nodeId || node.id || Object.values(node)[0] || '';
                return {
                  entityId,
                  data: node as T,
                };
              })
              .filter((result: any) => result.entityId);
            subscriber.next(results);
          },
          error: (error: any) => {
            console.error(`实时数据流错误: ${formatError(error)}`);
            subscriber.error(error);
          },
          complete: () => {
            subscriber.complete();
          },
        });

        // 返回清理函数
        return () => {
          streamSubscription.unsubscribe();
        };
      } catch (error) {
        subscriber.error(error);
      }
    });
  }

  /**
   * 初始化已知实体列表（用于检测删除）
   */
  private async initializeLastKnownEntities(
    componentType: ComponentType,
    lastKnownEntities: Set<EntityId>
  ): Promise<void> {
    try {
      const connection = await this.graphqlClient.getAllTables(componentType, {
        fields: ['updatedAt'],
      });

      connection.edges.forEach((edge) => {
        const node = edge.node as any;
        const entityId = node.nodeId || node.id || Object.values(node)[0];
        if (entityId) {
          lastKnownEntities.add(entityId);
        }
      });
    } catch (error) {
      console.warn(`初始化已知实体列表失败: ${formatError(error)}`);
    }
  }

  /**
   * 获取复数表名
   */
  private getPluralTableName(componentType: ComponentType): string {
    return componentType.endsWith('s') ? componentType : componentType + 's';
  }

  /**
   * 取消所有订阅
   */
  unsubscribeAll(): void {
    // 取消常规订阅
    this.subscriptions.forEach((subscription) => {
      try {
        subscription?.unsubscribe();
      } catch (error) {
        console.warn(`取消订阅失败: ${formatError(error)}`);
      }
    });
    this.subscriptions.clear();

    // 取消查询监听器
    this.queryWatchers.forEach((watcher) => {
      try {
        watcher.dispose();
      } catch (error) {
        console.warn(`取消查询监听器失败: ${formatError(error)}`);
      }
    });
    this.queryWatchers.clear();
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.unsubscribeAll();
  }
}

/**
 * 查询监听器实现
 */
class QueryWatcherImpl {
  private graphqlClient: DubheGraphqlClient;
  private componentTypes: ComponentType[];
  private callback: QueryChangeCallback;
  private options?: SubscriptionOptions;
  private subscriptions: any[] = [];
  private currentResults: EntityId[] = [];
  private isInitialized = false;

  constructor(
    graphqlClient: DubheGraphqlClient,
    componentTypes: ComponentType[],
    callback: QueryChangeCallback,
    options?: SubscriptionOptions
  ) {
    this.graphqlClient = graphqlClient;
    this.componentTypes = componentTypes;
    this.callback = callback;
    this.options = options;
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // 获取初始结果
      await this.updateCurrentResults();

      // 为每个组件类型创建订阅
      this.componentTypes.forEach((componentType) => {
        const subscription = this.graphqlClient.subscribeToTableChanges(
          componentType,
          {
            initialEvent: false,
            onData: () => {
              // 当有数据变化时，重新计算结果
              this.handleDataChange();
            },
            onError: (error) => {
              console.error(`查询监听器订阅失败: ${formatError(error)}`);
            },
          }
        );

        this.subscriptions.push(subscription);
      });

      this.isInitialized = true;

      // 触发初始事件（如果需要）
      if (this.options?.initialEvent && this.currentResults.length > 0) {
        this.callback({
          added: this.currentResults,
          removed: [],
          current: this.currentResults,
        });
      }
    } catch (error) {
      console.error(`查询监听器初始化失败: ${formatError(error)}`);
    }
  }

  private async handleDataChange(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      const oldResults = [...this.currentResults];
      await this.updateCurrentResults();

      const changes = calculateDelta(oldResults, this.currentResults);

      if (changes.added.length > 0 || changes.removed.length > 0) {
        const debouncedCallback = this.options?.debounceMs
          ? debounce(this.callback, this.options.debounceMs)
          : this.callback;

        debouncedCallback(changes);
      }
    } catch (error) {
      console.error(`处理查询变化失败: ${formatError(error)}`);
    }
  }

  private async updateCurrentResults(): Promise<void> {
    try {
      if (this.componentTypes.length === 1) {
        // 单组件查询
        const connection = await this.graphqlClient.getAllTables(
          this.componentTypes[0],
          { fields: ['updatedAt'] }
        );
        this.currentResults = connection.edges
          .map((edge) => {
            const node = edge.node as any;
            return node.nodeId || node.id || Object.values(node)[0] || '';
          })
          .filter(Boolean);
      } else {
        // 多组件查询（交集）
        const queries = this.componentTypes.map((type) => ({
          key: type,
          tableName: type,
          params: {
            fields: ['updatedAt'],
            filter: {},
          },
        }));

        const batchResult = await this.graphqlClient.batchQuery(queries);

        // 计算交集
        const entitySets = this.componentTypes.map((type) => {
          const connection = batchResult[type];
          return connection
            ? connection.edges
                .map((edge) => {
                  const node = edge.node as any;
                  return node.nodeId || node.id || Object.values(node)[0] || '';
                })
                .filter(Boolean)
            : [];
        });

        this.currentResults = entitySets.reduce((intersection, currentSet) => {
          const currentSetLookup = new Set(currentSet);
          return intersection.filter((id) => currentSetLookup.has(id));
        });
      }
    } catch (error) {
      console.error(`更新查询结果失败: ${formatError(error)}`);
      this.currentResults = [];
    }
  }

  getCurrentResults(): EntityId[] {
    return [...this.currentResults];
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => {
      try {
        subscription?.unsubscribe();
      } catch (error) {
        console.warn(`取消查询监听器订阅失败: ${formatError(error)}`);
      }
    });
    this.subscriptions = [];
  }
}
