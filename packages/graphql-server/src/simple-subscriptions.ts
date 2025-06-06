import {
	makeExtendSchemaPlugin,
	gql,
	makeAddInflectorsPlugin,
} from 'postgraphile';
import { subscriptionLogger } from './utils/logger';

// 简化的表名映射插件 - 将store_xxx表映射为xxx
export const TableNamingPlugin = makeAddInflectorsPlugin(
	(inflection: any) => ({
		// 重写表类型名称生成
		tableType(table: any): string {
			const tableName = table.name;
			if (tableName.startsWith('store_')) {
				const cleanName = tableName.replace('store_', '');
				return inflection.camelCase(cleanName, true); // Encounter
			}
			return inflection.camelCase(tableName, true);
		},

		// 重写表字段名称生成（复数形式）
		tableFieldName(table: any): string {
			const tableName = table.name;
			if (tableName.startsWith('store_')) {
				const cleanName = tableName.replace('store_', '');
				return inflection.pluralize(inflection.camelCase(cleanName)); // encounters
			}
			return inflection.pluralize(inflection.camelCase(tableName));
		},

		// 重写单个记录字段名称生成
		singleTableFieldName(table: any): string {
			const tableName = table.name;
			if (tableName.startsWith('store_')) {
				const cleanName = tableName.replace('store_', '');
				return inflection.camelCase(cleanName); // encounter
			}
			return inflection.camelCase(tableName);
		},
	}),
	true // 第二个参数为true表示覆盖现有的inflector
);

// 实时更新插件 - 为所有store表启用live queries
export const LiveQueriesPlugin = makeExtendSchemaPlugin(() => {
	subscriptionLogger.info('启用PostGraphile原生Live Queries功能');

	return {
		typeDefs: gql`
			# 空的schema定义 - PostGraphile自动处理live queries
			scalar LiveSchema
		`,
	};
});

// 创建简化的订阅插件
export const createSimpleSubscriptionPlugin = (tableNames: string[]) => {
	const storeTableNames = tableNames.filter(name =>
		name.startsWith('store_')
	);

	subscriptionLogger.info('创建简化订阅插件', {
		totalTables: tableNames.length,
		storeTables: storeTableNames.length,
		storeTableNames: storeTableNames.slice(0, 5), // 显示前5个
	});

	return [TableNamingPlugin, LiveQueriesPlugin];
};
