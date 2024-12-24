import { BaseType, SchemaType } from '../../types';
import { formatAndWriteMove } from '../formatAndWrite';
import {
	getStructAttrsWithType,
	getStructAttrs,
	getStructTypes,
	getStructAttrsQuery,
} from './common';

export function capitalizeAndRemoveUnderscores(input: string): string {
	return input
		.split('_')
		.map((word, index) => {
			return index === 0
				? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
				: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		})
		.join('');
}

export function renderSetAttrsFunc(
	schemaName: string,
	fields: BaseType | Record<string, BaseType>,
): string {
	return Object.entries(fields)
		.map(
			([key, type]) =>
				`public(package) fun set_${key}(self: &mut ${schemaName}, ${key}: ${type}) {
                        self.${key} = ${key};
                    }`,
		)
		.join('\n');
}

export function renderSetFunc(
	schemaName: string,
	fields: Record<string, string>,
): string {
	return `public(package) fun set(self: &mut ${schemaName}, ${getStructAttrsWithType(
		fields,
	)}) {
            ${Object.entries(fields)
		.map(([fieldName]) => `self.${fieldName} = ${fieldName};`)
		.join('\n')}
            }`;
}

export function renderGetAllFunc(
	schemaName: string,
	fields: Record<string, string>,
): string {
	return `public fun get(self: &${schemaName}): ${getStructTypes(fields)} {
        (${getStructAttrsQuery(fields)})
    }`;
}

export function renderGetAttrsFunc(
	schemaName: string,
	fields: BaseType | Record<string, BaseType>,
): string {
	return Object.entries(fields)
		.map(
			([
				 key,
				 type,
			 ]) => `public fun get_${key}(self: &${schemaName}): ${type} {
                                    self.${key}
                                }`,
		)
		.join('\n');
}

function convertToSnakeCase(input: string): string {
	return input
		.replace(/([A-Z])/g, '_$1')
		.toLowerCase()
		.replace(/^_/, '');
}

export async function generateSchemaData(
	projectName: string,
	schemas: Record<string, SchemaType>,
	path: string,
) {
	console.log('\n📦 Starting Schema Data Generation...');
	for (const schemaName in schemas) {
		const schema = schemas[schemaName];
		if (schema.data) {
			console.log(`  ├─ Processing schema: ${schemaName}`);
			for (const item of schema.data) {
				const name = Object.keys(item)[0];
				const fields = Object.values(item)[0];
				console.log(
					`     └─ Generating ${name} ${
						Array.isArray(fields) ? '(enum)' : '(struct)'
					}`,
				);
				let code = '';

				const enumNames = schema.data
					.filter(item => Array.isArray(Object.values(item)[0]))
					.map(item => Object.keys(item)[0]);

				if (Array.isArray(fields)) {
					code = `module ${projectName}::${schemaName}_${convertToSnakeCase(
						name,
					)} {
                        public enum ${name} has copy, drop , store {
                                ${fields}
                        }
                        
                        ${fields
						.map((field: string) => {
							return `public fun new_${convertToSnakeCase(
								field,
							)}(): ${name} {
                                ${name}::${field}
                            }`;
						})
						.join('')}`;
				} else {
					code = `module ${projectName}::${schemaName}_${convertToSnakeCase(
						name,
					)} {
                            use std::ascii::String;
                            ${enumNames
						.map(
							name =>
								`use ${projectName}::${schemaName}_${convertToSnakeCase(
									name,
								)}::${name};`,
						)
						.join('\n')}

                           public struct ${name} has copy, drop , store {
                                ${getStructAttrsWithType(fields)}
                           }
                        
                           public fun new(${getStructAttrsWithType(
						fields,
					)}): ${name} {
                               ${name} {
                                   ${getStructAttrs(fields)}
                               }
                            }
                        
                           ${renderGetAllFunc(name, fields)}
                           ${renderGetAttrsFunc(name, fields)}
                           ${renderSetAttrsFunc(name, fields)}
                           ${renderSetFunc(name, fields)}
                        }`;
				}

				await formatAndWriteMove(
					code,
					`${path}/contracts/${projectName}/sources/codegen/schemas/${schemaName}_${convertToSnakeCase(
						name,
					)}.move`,
					'formatAndWriteMove',
				);
			}
		}
	}
	console.log('✅ Schema Data Generation Complete\n');
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

export async function generateSchemaStructure(
	projectName: string,
	schemas: Record<string, SchemaType>,
	path: string,
) {
	console.log('\n🔨 Starting Schema Structure Generation...');
	for (const schemaName in schemas) {
		console.log(`  ├─ Generating schema: ${schemaName}`);
		console.log(
			`     ├─ Output path: ${path}/contracts/${projectName}/sources/codegen/schemas/${schemaName}.move`,
		);
		console.log(
			`     └─ Structure fields: ${
				Object.keys(schemas[schemaName].structure).length
			}`,
		);
		const schema = schemas[schemaName];
		const schemaMoudle = `module ${projectName}::${schemaName}_schema {
                    use std::ascii::String;
                    use std::ascii::string;
                    use sui::package::UpgradeCap;
                    use std::type_name; 
                    use dubhe::storage_migration;
                    use dubhe::storage_value::{Self, StorageValue};
                    use dubhe::storage_map::{Self, StorageMap};
                    use dubhe::storage_double_map::{Self, StorageDoubleMap};
                    use sui::dynamic_field as df;
                    use sui::sui::SUI;
                    use sui::coin::Coin;
    				use sui::balance::Balance;
                    ${generateImport(projectName, schemaName, schema)}

                    public struct ${capitalizeAndRemoveUnderscores(
			schemaName,
		)} has key, store {
                        id: UID
											} 
                    
                     ${Object.entries(schema.structure)
			.map(([key, value]) => {
				return `public fun borrow_${key}(self: &${capitalizeAndRemoveUnderscores(
					schemaName,
				)}) : &${value} {
                        storage_migration::borrow_field(&self.id, b"${key}")
                    }
                    
                    public(package) fun ${key}(self: &mut ${capitalizeAndRemoveUnderscores(
					schemaName,
				)}): &mut ${value} {
                        storage_migration::borrow_mut_field(&mut self.id, b"${key}")
                    }
                    `;
			})
			.join('')} 
                     
           
                    public(package) fun create(ctx: &mut TxContext): ${capitalizeAndRemoveUnderscores(
			schemaName,
		)} {
                      let mut id = object::new(ctx);
                      ${Object.entries(schema.structure)
			.map(([key, value]) => {
				let storage_type = '';
				if (value.includes('StorageValue')) {
					storage_type = `storage_value::new()`;
				} else if (value.includes('StorageMap')) {
					storage_type = `storage_map::new()`;
				} else if (
					value.includes('StorageDoubleMap')
				) {
					storage_type = `storage_double_map::new()`;
				}
				return `storage_migration::add_field<${value}>(&mut id, b"${key}", ${storage_type});`;
			})
			.join('')}
                      
                      ${capitalizeAndRemoveUnderscores(schemaName)} { id }
                    }
                    
                    public fun migrate(_${schemaName}: &mut ${capitalizeAndRemoveUnderscores(schemaName)}, _cap: &UpgradeCap) {  }

                    
              
                 // ======================================== View Functions ========================================
                    ${Object.entries(schema.structure)
			.map(([key, value]) => {
				// @ts-ignore
				let all_types = value.match(/<(.+)>/)[1].split(',').map(type => type.trim());
				let para_key: string[] = [];
				let para_value = '';
				let borrow_key = '';
				let extra_code = '';
				if (value.includes('StorageValue')) {
					para_key = [];
					para_value = `${all_types[0]}`;
					borrow_key = 'borrow()';
				} else if (value.includes('StorageMap')) {
					para_key = [`key: ${all_types[0]}`];
					para_value = `${all_types[1]}`;
					borrow_key = 'borrow(key)';
					if (!value.includes('Balance') && !value.includes('Coin')) {
						extra_code = `public fun get_${key}_keys(self: &${capitalizeAndRemoveUnderscores(schemaName)}) : vector<${all_types[0]}> {
									self.borrow_${key}().keys()
								}
							
							public fun get_${key}_values(self: &${capitalizeAndRemoveUnderscores(schemaName)}) : vector<${all_types[1]}> {
									self.borrow_${key}().values()
								}`;
					}
				} else if (value.includes('StorageDoubleMap')) {
					para_key = [`key1: ${all_types[0]}`, `key2: ${all_types[1]}`];
					para_value = `${all_types[2]}`;
					borrow_key = 'borrow(key1, key2)';
					if (!value.includes('Balance') && !value.includes('Coin')) {
						extra_code = `public fun get_${key}_keys(self: &${capitalizeAndRemoveUnderscores(schemaName)}) : (vector<${all_types[0]}>, vector<${all_types[1]}>) {
									self.borrow_${key}().keys()
								}
							
							public fun get_${key}_values(self: &${capitalizeAndRemoveUnderscores(schemaName)}) : vector<${all_types[2]}> {
									self.borrow_${key}().values()
								}`;
					}
				}
				return `public fun get_${key}(self: &${capitalizeAndRemoveUnderscores(schemaName)}, ${para_key}) : &${para_value} {
									self.borrow_${key}().${borrow_key}
								}
								` + extra_code;
			})
			.join('')} 
             // =========================================================================================================
                    
               
           }`;
		await formatAndWriteMove(
			schemaMoudle,
			`${path}/contracts/${projectName}/sources/codegen/schemas/${schemaName}.move`,
			'formatAndWriteMove',
		);
	}
	console.log('✅ Schema Structure Generation Complete\n');
}
