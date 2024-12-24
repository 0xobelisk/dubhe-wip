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
				const name = Object.keys(item)[0]
				const message = Object.values(item)[0]
				console.log(
					`     └─ Generating ${name} message: ${message}`);
				let	code = `module ${projectName}::${convertToSnakeCase(name)}_error {
						#[error]
						const ${name}: vector<u8> = b"${message}";
						/// Get the error message.
            public fun message(): vector<u8> { ${name} }
            /// Abort execution with the given error code.
            public fun emit() { abort ${name} }
            /// Require that the given condition is true, otherwise abort with the given error code.
						public fun require(condition: bool) { if (!condition) { emit() }  }`
				await formatAndWriteMove(
					code,
					`${path}/contracts/${projectName}/sources/codegen/errors/${convertToSnakeCase(
						name
					)}_error.move`,
					'formatAndWriteMove'
				);
			}
		}
	}
	console.log('✅ Schema Error Generation Complete\n');
}