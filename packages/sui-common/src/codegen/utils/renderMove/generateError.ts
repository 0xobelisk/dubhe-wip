import {BaseType, ErrorData, SchemaType} from '../../types';
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
	errors: ErrorData,
	path: string
) {
	console.log('\n📦 Starting Schema Error Generation...');
	for (const key of Object.keys(errors)) {
				const name = key
				const message = errors[key]
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
	console.log('✅ Schema Error Generation Complete\n');
}