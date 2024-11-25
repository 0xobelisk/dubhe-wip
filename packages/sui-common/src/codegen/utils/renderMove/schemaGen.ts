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

function matchFrameworkId(
    network: 'mainnet' | 'testnet' | 'devnet' | 'localnet',
): string {
    switch (network) {
        case 'testnet':
            return '0x417ad1864a56a29ad0b5aaddd2e11bac1eeab6a68883ef53184a4cc5c293fec6';
        case 'localnet':
            return '0x417ad1864a56a29ad0b5aaddd2e11bac1eeab6a68883ef53184a4cc5c293fec6';
        default:
            return '0x417ad1864a56a29ad0b5aaddd2e11bac1eeab6a68883ef53184a4cc5c293fec6';
    }
}

export async function schemaGen(
    config: DubheConfig,
    srcPrefix?: string,
    network?: 'mainnet' | 'testnet' | 'devnet' | 'localnet',
    frameworkId?: string,
) {
    console.log('\n🚀 Starting Schema Generation Process...');
    console.log('📋 Project Configuration:');
    console.log(`  ├─ Name: ${config.name}`);
    console.log(
        `  ├─ Description: ${config.description || 'No description provided'}`,
    );
    console.log(`  ├─ Network: ${network || 'testnet'}`);
    console.log(
        `  └─ Framework ID: ${
            frameworkId || matchFrameworkId(network ?? 'testnet')
        }\n`,
    );

    const path = srcPrefix ?? process.cwd();

    frameworkId = frameworkId || matchFrameworkId(network ?? 'testnet');

    if (existsSync(`${path}/contracts/${config.name}`)) {
        deleteFolderRecursive(
            `${path}/contracts/${config.name}/sources/codegen`,
        );
    }

    if (!existsSync(`${path}/contracts/${config.name}/Move.toml`)) {
        await generateToml(config, path, frameworkId);
    }

    if (
        !existsSync(
            `${path}/contracts/${config.name}/sources/script/deploy_hook.move`,
        )
    ) {
        await generateDeployHook(config, path);
    }

    await generateSchemaData(config.name, config.schemas, path);
    await generateSchemaStructure(config.name, config.schemas, path);
    await generateSchemaEvent(config.name, config.schemas, path);
    await generateDappKey(config, path);
    await generateSchemaHub(config, path);
    await generateSystem(config, path);
    await generateMigrate(config, path);

    console.log('✅ Schema Generation Process Complete!\n');
}
