// 简单的命名插件 - 去掉 "all" 前缀
import { Plugin } from 'postgraphile';

export const SimpleNamingPlugin: Plugin = builder => {
	// 重命名查询字段
	builder.hook('GraphQLObjectType:fields', (fields, build, context) => {
		const {
			scope: { isRootQuery },
		} = context;

		if (!isRootQuery) {
			return fields;
		}

		// 创建重命名的字段映射
		const renamedFields: typeof fields = {};

		Object.keys(fields).forEach(fieldName => {
			let newFieldName = fieldName;

			// 去掉 "all" 前缀，但保留系统字段
			if (
				fieldName.startsWith('all') &&
				!['allRows'].includes(fieldName)
			) {
				// allStoreAccounts -> storeAccounts
				// allStoreEncounters -> storeEncounters
				// allTableFields -> tableFields
				newFieldName = fieldName.replace(/^all/, '');
				// 第一个字母变成小写，保持驼峰命名
				if (newFieldName.length > 0) {
					newFieldName =
						newFieldName.charAt(0).toLowerCase() +
						newFieldName.slice(1);
				}
			}

			renamedFields[newFieldName] = fields[fieldName];
		});

		// console.log(
		// 	'🔄 重命名的查询字段:',
		// 	Object.keys(renamedFields).filter(name => !name.startsWith('all'))
		// );
		return renamedFields;
	});
};

export default SimpleNamingPlugin;
