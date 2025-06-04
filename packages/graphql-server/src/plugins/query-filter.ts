// PostGraphile 插件用于过滤查询
import { Plugin } from 'postgraphile';

// 查询过滤插件 - 只保留table相关的有用查询
export const QueryFilterPlugin: Plugin = builder => {
	// 过滤查询字段
	builder.hook('GraphQLObjectType:fields', (fields, build, context) => {
		const {
			scope: { isRootQuery },
		} = context;

		if (!isRootQuery) {
			return fields;
		}

		// 定义要保留的查询类型
		const allowedQueries = new Set<string>();

		// 获取所有表相关的查询
		Object.keys(fields).forEach(fieldName => {
			// 保留PostGraphile必需的系统字段
			if (['query', 'nodeId', 'node'].includes(fieldName)) {
				allowedQueries.add(fieldName);
			}

			// 保留store表相关的查询
			if (fieldName.match(/^(allStore|store)/i)) {
				allowedQueries.add(fieldName);
			}

			// 保留table_fields表的查询
			if (fieldName.match(/^(allTable|table)/i)) {
				allowedQueries.add(fieldName);
			}
		});

		// 过滤字段，只保留允许的查询
		const filteredFields: typeof fields = {};
		Object.keys(fields).forEach(fieldName => {
			if (allowedQueries.has(fieldName)) {
				filteredFields[fieldName] = fields[fieldName];
			}
		});

		// console.log('🔍 过滤后的查询字段:', Object.keys(filteredFields));
		return filteredFields;
	});
};

export default QueryFilterPlugin;
