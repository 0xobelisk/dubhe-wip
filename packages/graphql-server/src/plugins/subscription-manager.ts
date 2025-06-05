import { makePluginHook } from 'postgraphile';
import {
	createDynamicSubscriptionPlugin,
	SystemTableSubscriptionPlugin,
} from '../subscriptions';

export interface SubscriptionConfig {
	enableSubscriptions: string;
	tableNames: string[];
}

export class SubscriptionManager {
	constructor(private config: SubscriptionConfig) {}

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
			const dynamicSubscriptionPlugin =
				createDynamicSubscriptionPlugin(tableNames);
			appendPlugins.push(dynamicSubscriptionPlugin);
			appendPlugins.push(SystemTableSubscriptionPlugin);

			const pluginHook = makePluginHook([PgPubsub, ...appendPlugins]);

			return { pluginHook, success: true };
		} catch (error) {
			console.warn(
				'⚠️  无法加载 @graphile/pg-pubsub 插件，将禁用 subscription 功能'
			);
			console.warn('   请运行: npm install @graphile/pg-pubsub');
			console.warn('   错误详情:', error);

			// 临时禁用订阅功能
			process.env.ENABLE_SUBSCRIPTIONS = 'false';

			return { pluginHook: null, success: false };
		}
	}
}
