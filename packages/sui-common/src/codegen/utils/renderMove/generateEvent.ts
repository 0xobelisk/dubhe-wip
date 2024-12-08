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
				console.log(
					`     └─ Generating ${item.name} ${
						Array.isArray(item.fields) ? '(enum)' : '(struct)'
					}`
				);

				let	code = `module ${projectName}::${schemaName}_event_${convertToSnakeCase(item.name)} {
						use sui::event;
						use std::ascii::String;
                        public struct ${item.name}Event has copy, drop {
                                ${getStructAttrsWithType(item.fields as Record<string, string>)}
                        }
                        
                        public fun new(${getStructAttrsWithType(item.fields as Record<string, string>)}): ${item.name}Event {
                               ${item.name}Event {
                                   ${getStructAttrs(item.fields as Record<string, string>)}
                               }
                        }
                        
                        public fun emit(${getStructAttrsWithType(item.fields as Record<string, string>)}) {
                               event::emit(${item.name}Event {
                                   ${getStructAttrs(item.fields as Record<string, string>)}
                               });
                        }`;
				await formatAndWriteMove(
					code,
					`${path}/contracts/${projectName}/sources/codegen/events/${schemaName}_event_${convertToSnakeCase(
						item.name
					)}.move`,
					'formatAndWriteMove'
				);
			}
		}
	}
	console.log('✅ Schema Event Generation Complete\n');
}