"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionManager = void 0;
const postgraphile_1 = require("postgraphile");
const subscriptions_1 = require("../subscriptions");
class SubscriptionManager {
    config;
    constructor(config) {
        this.config = config;
    }
    // 加载并配置订阅插件
    async loadSubscriptionPlugins() {
        const { enableSubscriptions, tableNames } = this.config;
        if (enableSubscriptions !== 'true') {
            return { pluginHook: null, success: false };
        }
        try {
            console.log('🔌 正在加载 subscription 插件...');
            // 尝试加载 @graphile/pg-pubsub 插件
            const PgPubsub = require('@graphile/pg-pubsub').default;
            // 加载自定义订阅插件
            const appendPlugins = [];
            const dynamicSubscriptionPlugin = (0, subscriptions_1.createDynamicSubscriptionPlugin)(tableNames);
            appendPlugins.push(dynamicSubscriptionPlugin);
            appendPlugins.push(subscriptions_1.SystemTableSubscriptionPlugin);
            const pluginHook = (0, postgraphile_1.makePluginHook)([PgPubsub, ...appendPlugins]);
            console.log('✅ Subscription 插件加载成功');
            console.log('✅ 自定义订阅插件已启用');
            return { pluginHook, success: true };
        }
        catch (error) {
            console.warn('⚠️  无法加载 @graphile/pg-pubsub 插件，将禁用 subscription 功能');
            console.warn('   请运行: npm install @graphile/pg-pubsub');
            console.warn('   错误详情:', error);
            // 临时禁用订阅功能
            process.env.ENABLE_SUBSCRIPTIONS = 'false';
            return { pluginHook: null, success: false };
        }
    }
    // 输出订阅功能状态信息
    logSubscriptionStatus(success) {
        if (success) {
            console.log('✅ 实时查询功能已启用 (live queries)');
            console.log('   注意：使用实时查询而不是传统的 WebSocket 订阅');
            console.log('   这提供了类似的实时数据更新功能');
        }
        else {
            console.log('⚠️ 订阅功能已禁用');
        }
    }
}
exports.SubscriptionManager = SubscriptionManager;
//# sourceMappingURL=subscription-manager.js.map