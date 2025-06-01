"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSubscriptionAuthorizationFunction = exports.SystemTableSubscriptionPlugin = exports.createDynamicSubscriptionPlugin = void 0;
exports.parseNotifyPayload = parseNotifyPayload;
const postgraphile_1 = require("postgraphile");
// 通用的表变更订阅 payload
const createTableSubscriptionPayload = (tableName) => `
    type ${tableName}SubscriptionPayload {
        event: String!
        table: String!
        timestamp: String
        data: JSON
        id: String
        oldData: JSON
    }
`;
// 动态创建 store 表的订阅（简化版，避免复杂的指令参数）
const createStoreSubscription = (storeName) => `
    extend type Subscription {
        """订阅 ${storeName} 表的变更"""
        ${storeName}Changed: StoreChangePayload @pgSubscription(topic: "store:${storeName}")
    }
`;
// 创建动态订阅插件
const createDynamicSubscriptionPlugin = (tableNames) => {
    // 为每个动态表生成订阅定义
    const storeSubscriptions = tableNames
        .filter(name => name.startsWith('store_'))
        .map(name => name.replace('store_', ''))
        .map(name => createStoreSubscription(name))
        .join('\n');
    return (0, postgraphile_1.makeExtendSchemaPlugin)(({ pgSql: sql }) => ({
        typeDefs: (0, postgraphile_1.gql) `
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
				订阅所有 store 表的变更
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
                event: (payload) => {
                    const data = parseNotifyPayload(payload);
                    return data.event || data.operation || 'unknown';
                },
                table: (payload) => {
                    const data = parseNotifyPayload(payload);
                    return data.table || data.table_name || 'unknown';
                },
                timestamp: (payload) => {
                    const data = parseNotifyPayload(payload);
                    return data.timestamp || new Date().toISOString();
                },
                data: (payload) => {
                    const data = parseNotifyPayload(payload);
                    return data.data || data.new_record || data;
                },
                id: (payload) => {
                    const data = parseNotifyPayload(payload);
                    return data.id || data.key || null;
                },
            },
            TableChangePayload: {
                event: (payload) => {
                    const data = parseNotifyPayload(payload);
                    return data.event || data.operation || 'unknown';
                },
                table: (payload) => {
                    const data = parseNotifyPayload(payload);
                    return data.table || data.table_name || 'unknown';
                },
                schema: (payload) => {
                    const data = parseNotifyPayload(payload);
                    return data.schema || 'public';
                },
                timestamp: (payload) => {
                    const data = parseNotifyPayload(payload);
                    return data.timestamp || new Date().toISOString();
                },
                data: (payload) => {
                    const data = parseNotifyPayload(payload);
                    return data.data || data.new_record || data;
                },
                id: (payload) => {
                    const data = parseNotifyPayload(payload);
                    return data.id || data.key || null;
                },
            },
        },
    }));
};
exports.createDynamicSubscriptionPlugin = createDynamicSubscriptionPlugin;
// 创建系统表订阅插件（简化版）
exports.SystemTableSubscriptionPlugin = (0, postgraphile_1.makeExtendSchemaPlugin)(({ pgSql: sql }) => ({
    typeDefs: (0, postgraphile_1.gql) `
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
            event: (payload) => {
                console.log('🔍 SystemEventPayload.event:', payload);
                const data = parseNotifyPayload(payload);
                return data.event || data.operation || 'system_event';
            },
            subject: (payload) => {
                const data = parseNotifyPayload(payload);
                return data.subject || data.table || null;
            },
            timestamp: (payload) => {
                const data = parseNotifyPayload(payload);
                return data.timestamp || new Date().toISOString();
            },
            data: (payload) => {
                const data = parseNotifyPayload(payload);
                return data.data || data;
            },
        },
    },
}));
// 辅助函数：解析 PostgreSQL NOTIFY payload
function parseNotifyPayload(payload) {
    console.log('🔍 接收到 payload:', payload);
    try {
        const parsed = JSON.parse(payload);
        console.log('✅ JSON 解析成功:', parsed);
        return parsed;
    }
    catch (e) {
        // 如果不是 JSON，返回原始字符串
        console.log('⚠️  payload 不是有效的 JSON，返回原始数据');
        return { raw: payload, event: 'raw_data', data: payload };
    }
}
// 创建订阅授权函数（可选）
const createSubscriptionAuthorizationFunction = () => {
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
exports.createSubscriptionAuthorizationFunction = createSubscriptionAuthorizationFunction;
//# sourceMappingURL=subscriptions.js.map