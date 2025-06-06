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
		const originalFieldNames = Object.keys(fields);

		console.log('🔍 原始字段列表:', originalFieldNames);

		// 用于跟踪重命名的映射
		const renameMap: Record<string, string> = {};

		originalFieldNames.forEach(fieldName => {
			let newFieldName = fieldName;

			// 去掉 "all" 前缀，但保留系统字段
			if (
				fieldName.startsWith('all') &&
				!['allRows', 'allTableFields'].includes(fieldName) // 扩展保留列表
			) {
				// allStoreAccounts -> storeAccounts
				// allStoreEncounters -> storeEncounters
				newFieldName = fieldName.replace(/^all/, '');
				// 第一个字母变成小写，保持驼峰命名
				if (newFieldName.length > 0) {
					newFieldName =
						newFieldName.charAt(0).toLowerCase() +
						newFieldName.slice(1);
				}
			}

			// 去掉 "store" 前缀 (注意小写的s，因为前面已经处理过了)
			if (newFieldName.startsWith('store') && newFieldName !== 'store') {
				// storeAccounts -> accounts
				// storeAccount -> account
				// storeEncounters -> encounters
				// storeEncounter -> encounter
				const withoutStore = newFieldName.replace(/^store/, '');
				// 第一个字母变成小写，保持驼峰命名
				if (withoutStore.length > 0) {
					const finalName =
						withoutStore.charAt(0).toLowerCase() +
						withoutStore.slice(1);

					// 检查是否会产生字段名冲突
					if (
						!renamedFields[finalName] &&
						!originalFieldNames.includes(finalName)
					) {
						newFieldName = finalName;
					}
					// 如果有冲突，保持原来的名字（去掉all但保留store）
				}
			}

			// 检查最终的字段名是否会冲突
			if (renamedFields[newFieldName]) {
				console.warn(
					`⚠️ 字段名冲突: ${newFieldName}，保持原始名称 ${fieldName}`
				);
				newFieldName = fieldName; // 保持原始名称避免冲突
			}

			renameMap[fieldName] = newFieldName;
			renamedFields[newFieldName] = fields[fieldName];
		});

		const renamedCount = Object.entries(renameMap).filter(
			([old, newName]) => old !== newName
		).length;
		const finalFieldNames = Object.keys(renamedFields);

		console.log('🔄 字段重命名统计:', {
			原始字段数: originalFieldNames.length,
			最终字段数: finalFieldNames.length,
			重命名字段数: renamedCount,
		});

		if (renamedCount > 0) {
			console.log(
				'📝 重命名映射:',
				Object.entries(renameMap)
					.filter(([old, newName]) => old !== newName)
					.reduce(
						(acc, [old, newName]) => ({ ...acc, [old]: newName }),
						{}
					)
			);
		}

		// 确保字段数量没有丢失
		if (finalFieldNames.length !== originalFieldNames.length) {
			console.error(
				'❌ 字段丢失！原始:',
				originalFieldNames.length,
				'最终:',
				finalFieldNames.length
			);
			// 如果有字段丢失，返回原始字段以避免破坏
			return fields;
		}

		return renamedFields;
	});
};

export default SimpleNamingPlugin;
