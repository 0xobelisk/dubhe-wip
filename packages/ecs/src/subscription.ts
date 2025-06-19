// ECS订阅系统实现

import { Observable, Observer } from '@apollo/client';
import { DubheGraphqlClient } from '@0xobelisk/graphql-client';
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
import { ComponentDiscoverer } from './world';
import pluralize from 'pluralize';

/**
 * ECS组件变化事件
 */
export interface ComponentChangeResult<T = any> {
  entityId: EntityId;
  data: T | null;
  changeType: 'added' | 'updated' | 'removed';
  timestamp: number;
}

/**
 * ECS订阅结果
 */
export interface ECSSubscriptionResult<T = any> {
  data?: ComponentChangeResult<T>;
  loading: boolean;
  error?: Error;
}

/**
 * ECS查询变化结果
 */
export interface QueryChangeResult {
  changes: QueryChange;
  loading: boolean;
  error?: Error;
}

/**
 * ECS订阅系统核心实现
 */
export class ECSSubscription {
  private graphqlClient: DubheGraphqlClient;
  private subscriptions = new Map<string, any>();
  private queryWatchers = new Map<string, QueryWatcherImpl>();
  private componentDiscoverer: ComponentDiscoverer | null = null;
  // 🆕 组件主键信息缓存 - 与 query.ts 中的实现保持一致
  private componentPrimaryKeys = new Map<ComponentType, string>();

  constructor(
    graphqlClient: DubheGraphqlClient,
    componentDiscoverer?: ComponentDiscoverer
  ) {
    this.graphqlClient = graphqlClient;
    this.componentDiscoverer = componentDiscoverer || null;
  }

  /**
   * 🆕 预先解析并缓存所有组件的主键信息（与 query.ts 保持一致）
   */
  initializeComponentMetadata(
    componentMetadataList: Array<{ name: ComponentType; primaryKeys: string[] }>
  ) {
    this.componentPrimaryKeys.clear();

    for (const metadata of componentMetadataList) {
      if (metadata.primaryKeys.length === 1) {
        this.componentPrimaryKeys.set(metadata.name, metadata.primaryKeys[0]);
        console.log(
          `🔑 [ECS] 缓存组件 ${metadata.name} 主键: ${metadata.primaryKeys[0]}`
        );
      } else {
        console.warn(
          `⚠️ [ECS] 跳过 ${metadata.name}: 无效的主键数量 (${metadata.primaryKeys.length})`
        );
      }
    }
  }

  /**
   * 🆕 获取组件的主键字段名（从缓存中快速获取，与 query.ts 保持一致）
   */
  getComponentPrimaryKeyField(componentType: ComponentType): string {
    return this.componentPrimaryKeys.get(componentType) || 'entityId';
  }

  /**
   * 设置组件发现器
   */
  setComponentDiscoverer(discoverer: ComponentDiscoverer): void {
    this.componentDiscoverer = discoverer;
  }

  /**
   * 获取组件的字段信息（智能解析）
   */
  private async getComponentFields(
    componentType: ComponentType
  ): Promise<string[]> {
    if (this.componentDiscoverer) {
      try {
        const metadata =
          this.componentDiscoverer.getComponentMetadata(componentType);
        if (metadata) {
          return metadata.fields.map((field: any) => field.name);
        }
      } catch (error) {
        console.warn(
          `[ECS] 获取${componentType}字段信息失败: ${formatError(error)}`
        );
      }
    }

    // 无法自动解析时返回基础字段
    console.warn(`[ECS] 无法自动解析${componentType}字段，使用默认字段集`);
    return ['createdAt', 'updatedAt'];
  }

  /**
   * 获取查询时应该使用的字段（优先级：用户指定 > dubhe配置自动解析 > 默认字段）
   */
  private async getQueryFields(
    componentType: ComponentType,
    userFields?: string[]
  ): Promise<string[]> {
    if (userFields && userFields.length > 0) {
      return userFields;
    }

    // 使用dubhe配置自动解析的字段，如果失败返回默认字段
    return this.getComponentFields(componentType);
  }

  /**
   * 监听组件添加事件
   */
  onComponentAdded<T>(
    componentType: ComponentType,
    options?: SubscriptionOptions & { fields?: string[] }
  ): Observable<ECSSubscriptionResult<T>> {
    if (!isValidComponentType(componentType)) {
      return new Observable((observer: Observer<ECSSubscriptionResult<T>>) => {
        observer.error(new Error(`无效的组件类型: ${componentType}`));
      });
    }

    console.log(`🎮 [ECS] 开始订阅组件 ${componentType} 的添加事件...`);

    return new Observable((observer: Observer<ECSSubscriptionResult<T>>) => {
      let subscription: any = null;

      // 异步获取字段并创建订阅
      this.getQueryFields(componentType, options?.fields)
        .then((subscriptionFields) => {
          console.log(
            `🎮 [ECS] ${componentType} 使用字段:`,
            subscriptionFields
          );

          const debouncedEmit = options?.debounceMs
            ? debounce(
                (result: ECSSubscriptionResult<T>) => observer.next(result),
                options.debounceMs
              )
            : (result: ECSSubscriptionResult<T>) => observer.next(result);

          const observable = this.graphqlClient.subscribeToTableChanges(
            componentType,
            {
              initialEvent: options?.initialEvent ?? false,
              fields: subscriptionFields,
              onData: (data) => {
                try {
                  observer.next({ loading: false });

                  // 处理批量数据
                  const pluralTableName =
                    this.getPluralTableName(componentType);
                  const nodes = data?.listen?.query?.[pluralTableName]?.nodes;
                  if (nodes && Array.isArray(nodes)) {
                    nodes.forEach((node: any) => {
                      if (node) {
                        const entityId =
                          node.entityId ||
                          this.extractEntityId(node, componentType);
                        if (entityId) {
                          const result: ECSSubscriptionResult<T> = {
                            data: {
                              entityId,
                              data: node as T,
                              changeType: 'added',
                              timestamp: Date.now(),
                            },
                            loading: false,
                          };
                          debouncedEmit(result);
                        }
                      }
                    });
                  }
                } catch (error) {
                  console.error(
                    `❌ [ECS] 组件添加回调执行失败: ${formatError(error)}`
                  );
                  observer.next({
                    loading: false,
                    error: error as Error,
                  });
                }
              },
              onError: (error) => {
                console.error(
                  `❌ [ECS] 组件${componentType}添加事件订阅失败: ${formatError(error)}`
                );
                observer.next({
                  loading: false,
                  error: error as Error,
                });
              },
              onComplete: () => {
                console.log(`✅ [ECS] 组件${componentType}添加订阅完成`);
                observer.complete();
              },
            }
          );

          // 启动订阅
          subscription = observable.subscribe({});
          console.log(`✅ [ECS] 组件 ${componentType} 添加订阅已启动`);
        })
        .catch((error) => {
          console.error(`❌ [ECS] 获取字段信息失败: ${formatError(error)}`);
          observer.error(error);
        });

      // 返回清理函数
      return () => {
        console.log(`🧹 [ECS] 取消组件 ${componentType} 添加订阅`);
        if (subscription) {
          subscription.unsubscribe();
        }
      };
    });
  }

  /**
   * 监听组件移除事件
   */
  onComponentRemoved<T>(
    componentType: ComponentType,
    options?: SubscriptionOptions & { fields?: string[] }
  ): Observable<ECSSubscriptionResult<T>> {
    if (!isValidComponentType(componentType)) {
      return new Observable((observer: Observer<ECSSubscriptionResult<T>>) => {
        observer.error(new Error(`无效的组件类型: ${componentType}`));
      });
    }

    console.log(`🎮 [ECS] 开始订阅组件 ${componentType} 的移除事件...`);

    return new Observable((observer: Observer<ECSSubscriptionResult<T>>) => {
      let subscription: any = null;
      let lastKnownEntities = new Set<EntityId>();

      try {
        const debouncedEmit = options?.debounceMs
          ? debounce(
              (result: ECSSubscriptionResult<T>) => observer.next(result),
              options.debounceMs
            )
          : (result: ECSSubscriptionResult<T>) => observer.next(result);

        // 首先获取当前实体列表
        this.initializeLastKnownEntities(componentType, lastKnownEntities);

        const observable = this.graphqlClient.subscribeToTableChanges(
          componentType,
          {
            initialEvent: false,
            fields: ['updatedAt'], // 移除检测只需要基本字段
            onData: (data) => {
              try {
                observer.next({ loading: false });

                // 获取当前的实体列表
                const pluralTableName = this.getPluralTableName(componentType);
                const nodes =
                  data?.listen?.query?.[pluralTableName]?.nodes || [];
                const currentEntities = new Set<EntityId>(
                  nodes
                    .map((node: any) => {
                      const entityId =
                        node.entityId ||
                        this.extractEntityId(node, componentType);
                      return entityId;
                    })
                    .filter(Boolean)
                );

                // 找出被移除的实体
                const removedEntities = Array.from(lastKnownEntities).filter(
                  (entityId) => !currentEntities.has(entityId)
                );

                removedEntities.forEach((entityId) => {
                  const result: ECSSubscriptionResult<T> = {
                    data: {
                      entityId,
                      data: null,
                      changeType: 'removed',
                      timestamp: Date.now(),
                    },
                    loading: false,
                  };
                  debouncedEmit(result);
                });

                lastKnownEntities = currentEntities;
              } catch (error) {
                console.error(
                  `❌ [ECS] 组件移除回调执行失败: ${formatError(error)}`
                );
                observer.next({
                  loading: false,
                  error: error as Error,
                });
              }
            },
            onError: (error) => {
              console.error(
                `❌ [ECS] 组件${componentType}移除事件订阅失败: ${formatError(error)}`
              );
              observer.next({
                loading: false,
                error: error as Error,
              });
            },
            onComplete: () => {
              console.log(`✅ [ECS] 组件${componentType}移除订阅完成`);
              observer.complete();
            },
          }
        );

        // 启动订阅
        subscription = observable.subscribe({});
        console.log(`✅ [ECS] 组件 ${componentType} 移除订阅已启动`);
      } catch (error) {
        observer.error(error);
      }

      // 返回清理函数
      return () => {
        console.log(`🧹 [ECS] 取消组件 ${componentType} 移除订阅`);
        if (subscription) {
          subscription.unsubscribe();
        }
      };
    });
  }

  /**
   * 监听组件变化事件（添加、删除、修改）
   */
  onComponentChanged<T>(
    componentType: ComponentType,
    options?: SubscriptionOptions & { fields?: string[] }
  ): Observable<ECSSubscriptionResult<T>> {
    if (!isValidComponentType(componentType)) {
      return new Observable((observer: Observer<ECSSubscriptionResult<T>>) => {
        observer.error(new Error(`无效的组件类型: ${componentType}`));
      });
    }

    console.log(`🎮 [ECS] 开始订阅组件 ${componentType} 的变化...`);

    return new Observable((observer: Observer<ECSSubscriptionResult<T>>) => {
      let subscription: any = null;

      // 异步获取字段并创建订阅
      this.getQueryFields(componentType, options?.fields)
        .then((subscriptionFields) => {
          console.log(
            `🎮 [ECS] ${componentType} 使用字段:`,
            subscriptionFields
          );

          const debouncedEmit = options?.debounceMs
            ? debounce(
                (result: ECSSubscriptionResult<T>) => observer.next(result),
                options.debounceMs
              )
            : (result: ECSSubscriptionResult<T>) => observer.next(result);

          const observable = this.graphqlClient.subscribeToTableChanges(
            componentType,
            {
              initialEvent: options?.initialEvent ?? false,
              fields: subscriptionFields,
              onData: (data) => {
                try {
                  console.log(`📡 [ECS] 收到 ${componentType} 组件数据:`, data);
                  observer.next({ loading: false });

                  // 正确获取复数表名（使用GraphQL客户端的内置方法）
                  const pluralTableName =
                    this.getPluralTableName(componentType);
                  console.log(`📊 [ECS] 查找表名: ${pluralTableName}`);

                  const nodes = data?.listen?.query?.[pluralTableName]?.nodes;
                  console.log(`📊 [ECS] 解析出的节点:`, nodes);

                  if (nodes && Array.isArray(nodes)) {
                    nodes.forEach((node: any) => {
                      console.log(`🔄 [ECS] 处理节点:`, node);
                      if (node) {
                        // 实体ID可能在不同字段中
                        const entityId =
                          node.entityId ||
                          this.extractEntityId(node, componentType);
                        console.log(`🆔 [ECS] 提取的实体ID: ${entityId}`);

                        if (entityId) {
                          const result: ECSSubscriptionResult<T> = {
                            data: {
                              entityId,
                              data: node as T,
                              changeType: 'updated',
                              timestamp: Date.now(),
                            },
                            loading: false,
                          };
                          debouncedEmit(result);
                        } else {
                          console.warn(`⚠️ [ECS] 无法提取实体ID，节点:`, node);
                        }
                      }
                    });
                  } else {
                    console.log(`📊 [ECS] 没有找到有效的节点数据`);
                  }
                } catch (error) {
                  console.error(
                    `❌ [ECS] 组件变化回调执行失败: ${formatError(error)}`
                  );
                  observer.next({
                    loading: false,
                    error: error as Error,
                  });
                }
              },
              onError: (error) => {
                console.error(
                  `❌ [ECS] 组件${componentType}变化事件订阅失败: ${formatError(error)}`
                );
                observer.next({
                  loading: false,
                  error: error as Error,
                });
              },
              onComplete: () => {
                console.log(`✅ [ECS] 组件${componentType}订阅完成`);
                observer.complete();
              },
            }
          );

          // 🔑 关键修复：启动订阅
          subscription = observable.subscribe({});
          console.log(`✅ [ECS] 组件 ${componentType} 订阅已启动`);
        })
        .catch((error) => {
          console.error(`❌ [ECS] 获取字段信息失败: ${formatError(error)}`);
          observer.error(error);
        });

      // 返回清理函数
      return () => {
        console.log(`🧹 [ECS] 取消组件 ${componentType} 订阅`);
        if (subscription) {
          subscription.unsubscribe();
        }
      };
    });
  }

  /**
   * 监听特定条件的组件变化
   */
  onComponentCondition<T>(
    componentType: ComponentType,
    filter: Record<string, any>,
    options?: SubscriptionOptions & { fields?: string[] }
  ): Observable<ECSSubscriptionResult<T>> {
    if (!isValidComponentType(componentType)) {
      return new Observable((observer: Observer<ECSSubscriptionResult<T>>) => {
        observer.error(new Error(`无效的组件类型: ${componentType}`));
      });
    }

    console.log(`🎮 [ECS] 开始订阅组件 ${componentType} 的条件变化...`);

    return new Observable((observer: Observer<ECSSubscriptionResult<T>>) => {
      let subscription: any = null;

      // 异步获取字段并创建订阅
      this.getQueryFields(componentType, options?.fields)
        .then((subscriptionFields) => {
          console.log(
            `🎮 [ECS] ${componentType} 条件订阅使用字段:`,
            subscriptionFields
          );

          const debouncedEmit = options?.debounceMs
            ? debounce(
                (result: ECSSubscriptionResult<T>) => observer.next(result),
                options.debounceMs
              )
            : (result: ECSSubscriptionResult<T>) => observer.next(result);

          const observable = this.graphqlClient.subscribeToFilteredTableChanges(
            componentType,
            filter,
            {
              initialEvent: options?.initialEvent ?? false,
              fields: subscriptionFields,
              onData: (data) => {
                try {
                  observer.next({ loading: false });

                  const pluralTableName =
                    this.getPluralTableName(componentType);
                  const nodes =
                    data?.listen?.query?.[pluralTableName]?.nodes || [];

                  nodes.forEach((node: any) => {
                    if (node) {
                      const entityId =
                        node.entityId ||
                        this.extractEntityId(node, componentType);
                      if (entityId) {
                        const result: ECSSubscriptionResult<T> = {
                          data: {
                            entityId,
                            data: node as T,
                            changeType: 'updated',
                            timestamp: Date.now(),
                          },
                          loading: false,
                        };
                        debouncedEmit(result);
                      }
                    }
                  });
                } catch (error) {
                  console.error(
                    `❌ [ECS] 条件组件变化回调执行失败: ${formatError(error)}`
                  );
                  observer.next({
                    loading: false,
                    error: error as Error,
                  });
                }
              },
              onError: (error) => {
                console.error(
                  `❌ [ECS] 条件组件${componentType}订阅失败: ${formatError(error)}`
                );
                observer.next({
                  loading: false,
                  error: error as Error,
                });
              },
              onComplete: () => {
                console.log(`✅ [ECS] 条件组件${componentType}订阅完成`);
                observer.complete();
              },
            }
          );

          // 启动订阅
          subscription = observable.subscribe({});
          console.log(`✅ [ECS] 组件 ${componentType} 条件订阅已启动`);
        })
        .catch((error) => {
          console.error(`❌ [ECS] 获取字段信息失败: ${formatError(error)}`);
          observer.error(error);
        });

      // 返回清理函数
      return () => {
        console.log(`🧹 [ECS] 取消组件 ${componentType} 条件订阅`);
        if (subscription) {
          subscription.unsubscribe();
        }
      };
    });
  }

  /**
   * 监听查询结果变化
   */
  watchQuery(
    componentTypes: ComponentType[],
    options?: SubscriptionOptions
  ): Observable<QueryChangeResult> {
    const validTypes = componentTypes.filter(isValidComponentType);
    if (validTypes.length === 0) {
      return new Observable((observer: Observer<QueryChangeResult>) => {
        observer.error(new Error('没有有效的组件类型用于查询监听'));
      });
    }

    console.log(`🎮 [ECS] 开始监听查询变化: ${validTypes.join(', ')}`);

    return new Observable((observer: Observer<QueryChangeResult>) => {
      const watcher = new QueryWatcherImpl(
        this.graphqlClient,
        validTypes,
        (changes: QueryChange) => {
          const result: QueryChangeResult = {
            changes,
            loading: false,
          };

          if (options?.debounceMs) {
            const debouncedEmit = debounce(
              () => observer.next(result),
              options.debounceMs
            );
            debouncedEmit();
          } else {
            observer.next(result);
          }
        },
        options
      );

      // 返回清理函数
      return () => {
        console.log(`🧹 [ECS] 取消查询监听: ${validTypes.join(', ')}`);
        watcher.dispose();
      };
    });
  }

  /**
   * 创建实时数据流
   */
  createRealTimeStream<T>(
    componentType: ComponentType,
    initialFilter?: Record<string, any>
  ): Observable<Array<{ entityId: EntityId; data: T }>> {
    if (!isValidComponentType(componentType)) {
      return new Observable(
        (observer: Observer<Array<{ entityId: EntityId; data: T }>>) => {
          observer.error(new Error(`无效的组件类型: ${componentType}`));
        }
      );
    }

    console.log(`🎮 [ECS] 创建实时数据流: ${componentType}`);

    return new Observable(
      (observer: Observer<Array<{ entityId: EntityId; data: T }>>) => {
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
                    node.nodeId ||
                    node.entityId ||
                    Object.values(node)[0] ||
                    '';
                  return {
                    entityId,
                    data: node as T,
                  };
                })
                .filter((result: any) => result.entityId);
              observer.next(results);
            },
            error: (error: any) => {
              console.error(`实时数据流错误: ${formatError(error)}`);
              observer.error(error);
            },
            complete: () => {
              observer.complete();
            },
          });

          // 返回清理函数
          return () => {
            console.log(`🧹 [ECS] 清理实时数据流: ${componentType}`);
            streamSubscription.unsubscribe();
          };
        } catch (error) {
          observer.error(error);
        }
      }
    );
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
        const entityId = node.nodeId || node.entityId || Object.values(node)[0];
        if (entityId) {
          lastKnownEntities.add(entityId);
        }
      });
    } catch (error) {
      console.warn(`初始化已知实体列表失败: ${formatError(error)}`);
    }
  }

  /**
   * 将单数表名转换为复数形式（使用pluralize库确保正确性）
   */
  private getPluralTableName(tableName: string): string {
    // 先转换为camelCase
    const camelCaseName = this.toCamelCase(tableName);

    // 使用pluralize库进行复数化
    return pluralize.plural(camelCaseName);
  }

  /**
   * 转换snake_case到camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * 从节点中提取实体ID（使用组件的主键字段信息）
   */
  private extractEntityId(node: any, componentType: ComponentType): string {
    if (!node || typeof node !== 'object') {
      return '';
    }

    // 🔑 使用组件的主键字段（与 query.ts 保持一致）
    const primaryKeyField = this.getComponentPrimaryKeyField(componentType);
    console.log(
      `🔍 [ECS] 使用 ${componentType} 的主键字段: ${primaryKeyField}`
    );

    // 首先尝试使用主键字段
    if (node[primaryKeyField] && typeof node[primaryKeyField] === 'string') {
      return node[primaryKeyField];
    }

    // 如果主键字段不存在，回退到默认 entityId 字段
    if (
      primaryKeyField !== 'entityId' &&
      node.entityId &&
      typeof node.entityId === 'string'
    ) {
      console.warn(
        `⚠️ [ECS] ${componentType} 主键字段 ${primaryKeyField} 不存在，回退到 entityId`
      );
      return node.entityId;
    }

    // 最后尝试获取第一个字符串值作为备选
    const values = Object.values(node);
    for (const value of values) {
      if (typeof value === 'string' && value.length > 0) {
        console.warn(
          `⚠️ [ECS] ${componentType} 使用第一个字符串值作为实体ID: ${value}`
        );
        return value;
      }
    }

    return '';
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
        const observable = this.graphqlClient.subscribeToTableChanges(
          componentType,
          {
            initialEvent: false,
            onData: () => {
              // 当有数据变化时，重新计算结果
              this.handleDataChange();
            },
            onError: (error) => {
              console.error(
                `❌ [ECS] 查询监听器订阅失败: ${formatError(error)}`
              );
            },
          }
        );

        // 启动订阅
        const actualSubscription = observable.subscribe({});
        this.subscriptions.push(actualSubscription);
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
            return node.nodeId || node.entityId || Object.values(node)[0] || '';
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
                  return (
                    node.nodeId || node.entityId || Object.values(node)[0] || ''
                  );
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
