import { SchemaType, DubheConfig } from '../../types';
import { rmdirSync, existsSync } from 'fs';
import { deleteFolderRecursive } from './common';
import { generateToml } from './generateToml';
import { generateSchemaData, generateSchemaStructure } from './generateSchema';
import { generateDeployHook, generateMigrate } from './generateScript';
import { generateDappKey } from './generateDappKey';
import { generateSchemaEvent } from './generateEvent';
import { generateSystem } from './generateSystem';
import { generateSchemaHub } from './generateSchemaHub';
import { generateSchemaError } from './generateError';
import { generateDefaultSchema } from './generateDefaultSchema';
import { generateInit } from './generateInit';

export async function schemaGen(
  config: DubheConfig,
  srcPrefix?: string,
  network?: 'mainnet' | 'testnet' | 'devnet' | 'localnet'
) {
  console.log('\n🚀 Starting Schema Generation Process...');
  console.log('📋 Project Configuration:');
  console.log(`  ├─ Name: ${config.name}`);
  console.log(`  ├─ Description: ${config.description || 'No description provided'}`);
  console.log(`  ├─ Network: ${network || 'testnet'}`);

  const path = srcPrefix ?? process.cwd();

  if (existsSync(`${path}/contracts/${config.name}`)) {
    deleteFolderRecursive(`${path}/contracts/${config.name}/sources/codegen`);
  }

  if (!existsSync(`${path}/contracts/${config.name}/Move.toml`)) {
    await generateToml(config, path);
  }

  if (!existsSync(`${path}/contracts/${config.name}/sources/script/deploy_hook.move`)) {
    await generateDeployHook(config, path);
  }

  if (config.events) {
    if (config.data) {
      await generateSchemaEvent(config.name, config.data, config.events, path);
    } else {
      await generateSchemaEvent(config.name, null, config.events, path);
    }
  }

  if (config.data) {
    await generateSchemaData(config.name, config.data, path);
    await generateSchemaStructure(config.name, config.data, config.schemas, path);
  } else {
    await generateSchemaStructure(config.name, null, config.schemas, path);
  }

  if (config.errors) {
    await generateSchemaError(config.name, config.errors, path);
  }

  await generateDefaultSchema(config, path);
  await generateInit(config, path);
  await generateSystem(config, path);
  await generateMigrate(config, path);

  console.log('✅ Schema Generation Process Complete!\n');
}
