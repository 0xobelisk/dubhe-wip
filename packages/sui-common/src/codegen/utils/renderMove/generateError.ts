import { BaseType, SchemaType } from '../../types';
import { formatAndWriteMove } from '../formatAndWrite';
import {
	getStructAttrsWithType,
	getStructAttrs,
	getStructTypes,
	getStructAttrsQuery,
} from './common';

function convertToSnakeCase(input: string): string {
	return input
		.replace(/([A-Z])/g, '_$1')
		.toLowerCase()
		.replace(/^_/, '');
}

export async function generateSchemaError(
	projectName: string,
	schemas: Record<string, SchemaType>,
	path: string
) {
	console.log('\n📦 Starting Schema Error Generation...');
	for (const schemaName in schemas) {
		const schema = schemas[schemaName];
		if (schema.errors) {
			console.log(`  ├─ Processing schema: ${schemaName}`);
			for (const item of schema.errors) {
				console.log(
					`     └─ Generating ${item.name} code: ${item.code}`);

				let	code = `module ${projectName}::${schemaName}_error_${convertToSnakeCase(item.name)} {
						const ${item.name}: u64 = ${item.code};
						/// Get the error code.
            public fun code(): u64 { ${item.name} }
            /// Abort execution with the given error code.
            public fun emit() { abort ${item.name} }
            /// Require that the given condition is true, otherwise abort with the given error code.
						public fun require(condition: bool) { if (!condition) { emit() }  }`
				await formatAndWriteMove(
					code,
					`${path}/contracts/${projectName}/sources/codegen/errors/${schemaName}_error_${convertToSnakeCase(
						item.name
					)}.move`,
					'formatAndWriteMove'
				);
			}
		}
	}
	console.log('✅ Schema Error Generation Complete\n');
}