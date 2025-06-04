import { makeExtendSchemaPlugin, gql, embed } from 'postgraphile';
import { GraphQLResolveInfo } from 'graphql';
import { subscriptionLogger, gqlLogger } from './logger';

interface SubscriptionContext {
	pgClient?: any;
	jwtClaims?: any;
	[key: string]: any;
}

interface TableSubscriptionArgs {
	tableName: string;
	filter?: Record<string, any>;
}

interface StoreSubscriptionArgs {
	storeName: string;
	keys?: Record<string, any>;
}

// 通用的表变更订阅 payload
const createTableSubscriptionPayload = (tableName: string) => `
    type ${tableName}SubscriptionPayload {
        event: String!
        table: String!
        timestamp: String
        data: JSON
        id: String
        oldData: JSON
    }
`;

// 动态创建表的订阅（移除store前缀）
const createStoreSubscription = (storeName: string) => `
    extend type Subscription {
        """订阅 ${storeName} 表的变更"""
        ${storeName}Changed: StoreChangePayload @pgSubscription(topic: "store:${storeName}")
    }
`;

// 创建动态订阅插件
export const createDynamicSubscriptionPlugin = (tableNames: string[]) => {
	// 为每个动态表生成订阅定义，去掉store_前缀暴露给API
	const storeSubscriptions = tableNames
		.filter(name => name.startsWith('store_'))
		.map(name => name.replace('store_', ''))
		.map(name => createStoreSubscription(name))
		.join('\n');

	subscriptionLogger.info('创建动态订阅插件', {
		totalTables: tableNames.length,
		storeTables: tableNames.filter(name => name.startsWith('store_'))
			.length,
	});

	return makeExtendSchemaPlugin(({ pgSql: sql }) => ({
		typeDefs: gql`
			# 通用的 store 变更 payload
			type StoreChangePayload {
				event: String!
				table: String!
				timestamp: String
				data: JSON
				id: String
			}

			# 通用的表变更 payload
			type TableChangePayload {
				event: String!
				table: String!
				schema: String!
				timestamp: String
				data: JSON
				id: String
			}

			extend type Subscription {
				"""
				订阅所有表的变更
				"""
				allStoresChanged: StoreChangePayload
					@pgSubscription(topic: "store:all")
					
				"""
				订阅具体表的变更
				"""
				tableChanged(tableName: String!): TableChangePayload
					@pgSubscription(topic: { $graphql: "\"table:\" + $args.tableName + \":change\"" })
			}

			${storeSubscriptions}
		`,

		resolvers: {
			StoreChangePayload: {
				event: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.event || data.operation || 'unknown';
				},
				table: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.table || data.table_name || 'unknown';
				},
				timestamp: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.timestamp || new Date().toISOString();
				},
				data: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.data || data.new_record || data;
				},
				id: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.id || data.key || null;
				},
			},
			TableChangePayload: {
				event: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.event || data.operation || 'unknown';
				},
				table: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.table || data.table_name || 'unknown';
				},
				schema: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.schema || 'public';
				},
				timestamp: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.timestamp || new Date().toISOString();
				},
				data: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.data || data.new_record || data;
				},
				id: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.id || data.key || null;
				},
			},
		},
	}));
};

// 创建系统表订阅插件（简化版）
export const SystemTableSubscriptionPlugin = makeExtendSchemaPlugin(
	({ pgSql: sql }) => ({
		typeDefs: gql`
			type SystemEventPayload {
				event: String!
				subject: String
				timestamp: String
				data: JSON
			}

			extend type Subscription {
				"""
				订阅系统事件
				"""
				systemEvent: SystemEventPayload
					@pgSubscription(topic: "system:all")
			}
		`,

		resolvers: {
			SystemEventPayload: {
				event: (payload: any) => {
					subscriptionLogger.debug('解析SystemEventPayload.event', {
						payloadType: typeof payload,
						payloadLength: payload?.length || 0,
					});
					const data = parseNotifyPayload(payload);
					return data.event || data.operation || 'system_event';
				},
				subject: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.subject || data.table || null;
				},
				timestamp: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.timestamp || new Date().toISOString();
				},
				data: (payload: any) => {
					const data = parseNotifyPayload(payload);
					return data.data || data;
				},
			},
		},
	})
);

// 辅助函数：解析 PostgreSQL NOTIFY payload
export function parseNotifyPayload(payload: string): any {
	subscriptionLogger.debug('接收到 payload', {
		payloadType: typeof payload,
		payloadLength: payload?.length || 0,
	});

	try {
		const parsed = JSON.parse(payload);
		subscriptionLogger.debug('JSON 解析成功', {
			event: parsed.event,
			table: parsed.table,
		});
		return parsed;
	} catch (e) {
		// 如果不是 JSON，返回原始字符串
		subscriptionLogger.warn('payload 不是有效的 JSON，返回原始数据', {
			payload:
				payload?.substring(0, 100) +
				(payload?.length > 100 ? '...' : ''),
			error: e instanceof Error ? e.message : String(e),
		});
		return { raw: payload, event: 'raw_data', data: payload };
	}
}

// 创建订阅授权函数（可选）
export const createSubscriptionAuthorizationFunction = () => {
	subscriptionLogger.info('创建订阅授权函数');
	return `
        CREATE OR REPLACE FUNCTION app_hidden.validate_subscription(topic text)
        RETURNS TEXT AS $$
        BEGIN
            -- 这里可以添加自定义的授权逻辑
            -- 例如：检查用户权限、验证订阅主题等
            
            -- 如果是 store 相关的订阅，可能需要检查用户权限
            IF topic LIKE 'store:%' THEN
                -- 可以在这里添加权限检查
                -- IF NOT has_permission(current_user, topic) THEN
                --     RAISE EXCEPTION 'Unauthorized subscription' USING errcode = 'AUTHZ';
                -- END IF;
                NULL;
            END IF;
            
            -- 返回一个唯一标识符，用于后续取消订阅
            -- 这里使用静态值，实际应用中可能需要生成动态值
            RETURN 'SUB_' || md5(topic || current_timestamp::text)::text;
        END;
        $$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;
    `;
};
