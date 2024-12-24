import { BaseType, SchemaType } from '../../types';
import { formatAndWriteMove } from '../formatAndWrite';
import {
	getStructAttrsWithType,
	getStructAttrs,
	getStructTypes,
	getStructAttrsQuery,
} from './common';

function capitalizeAndRemoveUnderscores(input: string): string {
	return input
		.split('_')
		.map((word, index) => {
			return index === 0
				? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
				: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		})
		.join('');
}

function convertToSnakeCase(input: string): string {
	return input
		.replace(/([A-Z])/g, '_$1')
		.toLowerCase()
		.replace(/^_/, '');
}

function generateImport(
	projectName: string,
	schemaName: string,
	schema: SchemaType,
) {
	if (schema.data) {
		return schema.data
			.map(item => {
				const name = Object.keys(item)[0]
				return `use ${projectName}::${schemaName}_${convertToSnakeCase(
					name,
				)}::${name};`;
			})
			.join('\n');
	} else {
		return '';
	}
}

export async function generateSchemaEvent(
	projectName: string,
	schemas: Record<string, SchemaType>,
	path: string
) {
	console.log('\n📦 Starting Schema Event Generation...');
	for (const schemaName in schemas) {
		const schema = schemas[schemaName];
		if (schema.events) {
			console.log(`  ├─ Processing schema: ${schemaName}`);
			for (const item of schema.events) {
				const name = Object.keys(item)[0];
				const fields = Object.values(item)[0];
				console.log(
					`     └─ Generating ${name} event: ${fields}`
				);

				let	code = `module ${projectName}::${convertToSnakeCase(name)}_event {
						use sui::event;
						use std::ascii::String;
						${generateImport(projectName, schemaName, schema)}

                        public struct ${name}Event has copy, drop {
                                ${getStructAttrsWithType(fields as Record<string, string>)}
                        }

                        public fun new(${getStructAttrsWithType(fields as Record<string, string>)}): ${name}Event {
                               ${name}Event {
                                   ${getStructAttrs(fields as Record<string, string>)}
                               }
                        }

                        public fun emit(${getStructAttrsWithType(fields as Record<string, string>)}) {
                               event::emit(${name}Event {
                                   ${getStructAttrs(fields as Record<string, string>)}
                               });
                        }`;
				await formatAndWriteMove(
					code,
					`${path}/contracts/${projectName}/sources/codegen/events/${convertToSnakeCase(
						name
					)}_event.move`,
					'formatAndWriteMove'
				);
			}
		}
	}
	console.log('✅ Schema Event Generation Complete\n');
}