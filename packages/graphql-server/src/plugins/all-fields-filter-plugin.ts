import { Plugin } from 'postgraphile';

// 全字段过滤插件 - 确保所有字段都支持过滤
export const AllFieldsFilterPlugin: Plugin = builder => {
	// 扩展过滤器输入类型，为所有字段添加过滤支持
	builder.hook('GraphQLInputObjectType:fields', (fields, build, context) => {
		const {
			scope: { isPgConnectionFilter, pgIntrospection: table },
		} = context;

		// 只处理连接过滤器
		if (!isPgConnectionFilter || !table || table.kind !== 'class') {
			return fields;
		}

		const enhancedFields = { ...fields };

		// 为表的每个字段添加过滤器
		table.attributes.forEach((attr: any) => {
			const fieldName = build.inflection.column(attr);

			// 跳过已经存在的字段
			if (enhancedFields[fieldName]) {
				return;
			}

			// 根据字段类型确定过滤器类型
			let filterType;
			const pgType = attr.type;

			// 根据PostgreSQL类型映射到GraphQL过滤器类型
			switch (pgType.category) {
				case 'S': // 字符串类型
					filterType = build.getTypeByName('StringFilter');
					break;
				case 'N': // 数值类型
					if (pgType.name.includes('int')) {
						filterType = build.getTypeByName('IntFilter');
					} else {
						filterType = build.getTypeByName('FloatFilter');
					}
					break;
				case 'B': // 布尔类型
					filterType = build.getTypeByName('BooleanFilter');
					break;
				case 'D': // 日期时间类型
					filterType = build.getTypeByName('DatetimeFilter');
					break;
				default:
					// 对于其他类型，使用字符串过滤器作为默认
					filterType = build.getTypeByName('StringFilter');
			}

			// 如果找不到特定的过滤器类型，使用字符串过滤器
			if (!filterType) {
				filterType = build.getTypeByName('StringFilter');
			}

			// 添加字段过滤器
			if (filterType) {
				enhancedFields[fieldName] = {
					type: filterType,
					description: `Filter by the object's \`${attr.name}\` field.`,
				};
			}
		});

		return enhancedFields;
	});

	// 确保为所有字段生成排序选项
	builder.hook('GraphQLEnumType:values', (values, build, context) => {
		const {
			scope: { isPgRowSortEnum, pgIntrospection: table },
		} = context;

		if (!isPgRowSortEnum || !table || table.kind !== 'class') {
			return values;
		}

		const enhancedValues = { ...values };

		// 为每个字段添加ASC和DESC排序选项
		table.attributes.forEach((attr: any) => {
			const columnName = build.inflection.column(attr);
			const enumName = build.inflection.constantCase(columnName);

			// 添加升序排序
			const ascKey = `${enumName}_ASC`;
			if (!enhancedValues[ascKey]) {
				enhancedValues[ascKey] = {
					value: {
						alias: `${attr.name.toLowerCase()}_ASC`,
						specs: [[attr.name, true]],
					},
					description: `Sorts by ${attr.name} in ascending order.`,
				};
			}

			// 添加降序排序
			const descKey = `${enumName}_DESC`;
			if (!enhancedValues[descKey]) {
				enhancedValues[descKey] = {
					value: {
						alias: `${attr.name.toLowerCase()}_DESC`,
						specs: [[attr.name, false]],
					},
					description: `Sorts by ${attr.name} in descending order.`,
				};
			}
		});

		return enhancedValues;
	});

	// 扩展条件过滤器以支持所有字段
	builder.hook('GraphQLInputObjectType:fields', (fields, build, context) => {
		const {
			scope: { isPgCondition, pgIntrospection: table },
		} = context;

		if (!isPgCondition || !table || table.kind !== 'class') {
			return fields;
		}

		const enhancedFields = { ...fields };

		// 为每个字段添加条件过滤
		table.attributes.forEach((attr: any) => {
			const fieldName = build.inflection.column(attr);

			// 跳过已经存在的字段
			if (enhancedFields[fieldName]) {
				return;
			}

			// 获取GraphQL类型
			const gqlType = build.pgGetGqlTypeByTypeIdAndModifier(
				attr.typeId,
				attr.typeModifier
			);

			if (gqlType) {
				enhancedFields[fieldName] = {
					type: gqlType,
					description: `Checks for equality with the object's \`${attr.name}\` field.`,
				};
			}
		});

		return enhancedFields;
	});
};

export default AllFieldsFilterPlugin;
