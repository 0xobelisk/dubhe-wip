import { Dubhe } from '@0xobelisk/sui-client';
import { Transaction, UpgradePolicy } from '@mysten/sui/transactions';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { DubheCliError, UpgradeError } from './errors';
import {
	updateVersionInFile,
	getOldPackageId,
	getVersion,
	getUpgradeCap,
	saveContractData,
	validatePrivateKey, getOnchainSchemas, getSchemaHub,
} from './utils';
import * as fs from 'fs';
import * as path from 'path';
import { DubheConfig } from '@0xobelisk/sui-common';

type ObjectContent = {
	type: string;
	fields: Record<string, any>;
	hasPublicTransfer: boolean;
	dataType: string;
};

type Field = {
	name: string;
	type: string;
}

type Migration = {
	schemaName: string;
	fields: Field[];
};

function updateMigrateMethod(projectPath: string, migrations: Migration[]): void {
	migrations.forEach((migration) => {
		let filePath = `${projectPath}/sources/codegen/schemas/${migration.schemaName}.move`;
		const fileContent = fs.readFileSync(filePath, 'utf-8');
		const migrateMethodRegex = new RegExp(`public fun migrate\\(_${migration.schemaName}: &mut ${capitalizeAndRemoveUnderscores(migration.schemaName)}, _cap: &UpgradeCap\\) {[^}]*}`);
		const newMigrateMethod = `
public fun migrate(${migration.schemaName}: &mut ${capitalizeAndRemoveUnderscores(migration.schemaName)}, _cap: &UpgradeCap) {
${migration.fields.map((field) => {
			let storage_type = '';
			if (field.type.includes('StorageValue')) {
				storage_type = `storage_value::new()`;
			} else if (field.type.includes('StorageMap')) {
				storage_type = `storage_map::new()`;
			} else if (
				field.type.includes('StorageDoubleMap')
			) {
				storage_type = `storage_double_map::new()`;
			}
			return `storage_migrate::add_field<${field.type}>(&mut ${migration.schemaName}.id, b"${field.name}", ${storage_type});`;
		}).join('')}
}
`;

		const updatedContent = fileContent.replace(migrateMethodRegex, newMigrateMethod);
		fs.writeFileSync(filePath, updatedContent, 'utf-8');
	});


}

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

function getLastSegment(input: string): string {
	const segments = input.split('::');
	return segments.length > 0 ? segments[segments.length - 1] : '';
}

export async function upgradeHandler(
	config: DubheConfig,
	name: string,
	network: 'mainnet' | 'testnet' | 'devnet' | 'localnet',
) {
	const path = process.cwd();
	const projectPath = `${path}/contracts/${name}`;
	const privateKey = process.env.PRIVATE_KEY;
	if (!privateKey)
		throw new DubheCliError(
			`Missing PRIVATE_KEY environment variable.
Run 'echo "PRIVATE_KEY=YOUR_PRIVATE_KEY" > .env'
in your contracts directory to use the default sui private key.`,
		);

	const privateKeyFormat = validatePrivateKey(privateKey);
	if (privateKeyFormat === false) {
		throw new DubheCliError(`Please check your privateKey.`);
	}
	const dubhe = new Dubhe({
		secretKey: privateKeyFormat,
	});
	const keypair = dubhe.getKeypair();

	const client = new SuiClient({
		url: getFullnodeUrl(network),
	});

	let oldVersion = Number(await getVersion(projectPath, network));
	let oldPackageId = await getOldPackageId(projectPath, network);
	let schemaHub = await getSchemaHub(projectPath, network);
	let upgradeCap = await getUpgradeCap(projectPath, network);
	// let adminCap = await getAdminCap(projectPath, network);

	let pendingMigration: Migration[] = [];
	let schemas = await getOnchainSchemas(projectPath, network);
	for (let schemaKey in config.schemas) {
		schemas.forEach((schema) => {
			if (capitalizeAndRemoveUnderscores(schemaKey) == getLastSegment(schema.name)) {
				let migrate: Migration = { schemaName: '', fields: [] };
				let fields: Field[] = [];
				let isMigration = false;
				for (const key in config.schemas[schemaKey].structure) {
					if (!(key in schema.structure)) {
						isMigration = true;
						fields.push({
							name: key,
							type: config.schemas[schemaKey].structure[key],
						});
						schema.structure[key] = config.schemas[schemaKey].structure[key];
					}
				}
				if (isMigration) {
					migrate.schemaName = schemaKey;
					migrate.fields = fields;
					pendingMigration.push(migrate);
				}
			}
		});
	}


	pendingMigration.forEach((migration) => {
		console.log(`\n🚀 Starting Migration for ${migration.schemaName}...`);
		console.log('📋 Migration Fields:', migration.fields);
	});
	updateMigrateMethod(projectPath, pendingMigration);

	try {
		let modules: any, dependencies: any, digest: any;
		try {
			const {
				modules: extractedModules,
				dependencies: extractedDependencies,
				digest: extractedDigest,
			} = JSON.parse(
				execSync(
					`sui move build --dump-bytecode-as-base64 --path ${path}/contracts/${name}`,
					{
						encoding: 'utf-8',
					},
				),
			);

			modules = extractedModules;
			dependencies = extractedDependencies;
			digest = extractedDigest;
		} catch (error: any) {
			throw new UpgradeError(error.stdout);
		}

		console.log('\n🚀 Starting Upgrade Process...');
		console.log('📋 OldPackageId:', oldPackageId);
		console.log('📋 UpgradeCap Object Id:', upgradeCap);
		console.log('📋 OldVersion:', oldVersion);

		const tx = new Transaction();
		const ticket = tx.moveCall({
			target: '0x2::package::authorize_upgrade',
			arguments: [
				tx.object(upgradeCap),
				tx.pure.u8(UpgradePolicy.COMPATIBLE),
				tx.pure.vector('u8', digest),
			],
		});

		const receipt = tx.upgrade({
			modules,
			dependencies,
			package: oldPackageId,
			ticket,
		});

		tx.moveCall({
			target: '0x2::package::commit_upgrade',
			arguments: [tx.object(upgradeCap), receipt],
		});

		const result = await client.signAndExecuteTransaction({
			signer: keypair,
			transaction: tx,
			options: {
				showObjectChanges: true,
			},
		});

		let newPackageId = '';
		result.objectChanges!.map(object => {
			if (object.type === 'published') {
				console.log(
					chalk.blue(`${name} PackageId: ${object.packageId}`),
				);
				console.log(
					chalk.blue(`${name} Version: ${oldVersion + 1}`),
				);
				newPackageId = object.packageId;
			}
		});

		console.log(
			chalk.green(`Upgrade Transaction Digest: ${result.digest}`),
		);

		saveContractData(
			name,
			network,
			newPackageId,
			upgradeCap,
			schemaHub,
			oldVersion + 1,
			schemas,
		);

	} catch (error: any) {
		console.log(chalk.red('Upgrade failed!'));
		console.error(error.message);
	}
}
