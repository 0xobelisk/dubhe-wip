import { Dubhe } from '@0xobelisk/sui-client';
import { Transaction } from '@mysten/sui/transactions';
import {
	getFullnodeUrl,
	SuiClient,
	SuiTransactionBlockResponse,
} from '@mysten/sui/client';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { DubheCliError } from './errors';
import {
	updateVersionInFile,
	saveContractData,
	validatePrivateKey,
	schema,
} from './utils';
import { DubheConfig } from '@0xobelisk/sui-common';

async function getDappsObjectId(
	network: 'mainnet' | 'testnet' | 'devnet' | 'localnet'
) {
	switch (network) {
		case 'testnet':
			return '0x181befc40b3dafe2740b41d5a970e49bed2cca20205506ee6be2cfb73ff2d3e9';
		default:
			return '0x181befc40b3dafe2740b41d5a970e49bed2cca20205506ee6be2cfb73ff2d3e9';
	}
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

export async function publishHandler(
	dubheConfig: DubheConfig,
	network: 'mainnet' | 'testnet' | 'devnet' | 'localnet',
	dappsObjectId?: string
) {


	const path = process.cwd();
	const projectPath = `${path}/contracts/${dubheConfig.name}`;
	dappsObjectId = dappsObjectId || (await getDappsObjectId(network));

	console.log('\n🚀 Starting Contract Publication...');
	console.log(`  ├─ Project: ${projectPath}`);
	console.log(`  ├─ Network: ${network}`);
	console.log('  ├─ Validating Environment...');
	const privateKey = process.env.PRIVATE_KEY;
	if (!privateKey) {
		throw new DubheCliError(
			`Missing PRIVATE_KEY environment variable.
Run 'echo "PRIVATE_KEY=YOUR_PRIVATE_KEY" > .env'
in your contracts directory to use the default sui private key.`
		);
	}

	const privateKeyFormat = validatePrivateKey(privateKey);
	if (privateKeyFormat === false) {
		throw new DubheCliError(`Please check your privateKey.`);
	}

	const dubhe = new Dubhe({ secretKey: privateKeyFormat });
	const keypair = dubhe.getKeypair();
	console.log(`  └─ Account: ${keypair.toSuiAddress()}`);

	const client = new SuiClient({ url: getFullnodeUrl(network) });

	console.log('\n📦 Building Contract...');
	let modules: any, dependencies: any;
	try {
		const buildResult = JSON.parse(
			execSync(
				`sui move build --dump-bytecode-as-base64 --path ${projectPath}`,
				{
					encoding: 'utf-8',
				}
			)
		);
		modules = buildResult.modules;
		dependencies = buildResult.dependencies;
		console.log('  └─ Build successful');
	} catch (error: any) {
		console.error(chalk.red('  └─ Build failed'));
		console.error(error.stdout);
		process.exit(1);
	}

	console.log('\n🔄 Publishing Contract...');
	const tx = new Transaction();
	const [upgradeCap] = tx.publish({ modules, dependencies });
	tx.transferObjects([upgradeCap], keypair.toSuiAddress());

	let result: SuiTransactionBlockResponse;
	try {
		result = await client.signAndExecuteTransaction({
			signer: keypair,
			transaction: tx,
			options: { showObjectChanges: true },
		});
	} catch (error: any) {
		console.error(chalk.red('  └─ Publication failed'));
		console.error(error.message);
		process.exit(1);
	}

	if (result.effects?.status.status === 'failure') {
		console.log(chalk.red('  └─ Publication failed'));
		process.exit(1);
	}

	console.log('  ├─ Processing publication results...');
	let version = 1;
	let packageId = '';
	let schemas: schema[] = [];
	let upgradeCapId = '';
	let schemaHubId = '';

	result.objectChanges!.map(object => {
		if (object.type === 'published') {
			console.log(`  ├─ Package ID: ${object.packageId}`);
			packageId = object.packageId;
		}
		if (
			object.type === 'created' &&
			object.objectType === '0x2::package::UpgradeCap'
		) {
			console.log(`  ├─ Upgrade Cap: ${object.objectId}`);
			upgradeCapId = object.objectId;
		}
		if (
			object.type === 'created' &&
			object.objectType.includes("schema_hub")
		) {
			console.log(`  ├─ Schema Hub: ${object.objectId}`);
			schemaHubId = object.objectId;
		}
	});

	console.log(`  └─ Transaction: ${result.digest}`);

	console.log('\n⚡ Executing Deploy Hook...');
	await new Promise(resolve => setTimeout(resolve, 5000));

	const deployHookTx = new Transaction();
	deployHookTx.moveCall({
		target: `${packageId}::deploy_hook::run`,
		arguments: [
			deployHookTx.object(schemaHubId),
			deployHookTx.object(dappsObjectId),
			deployHookTx.object(upgradeCapId),
			deployHookTx.object('0x6'),
		],
	});

	let deployHookResult: SuiTransactionBlockResponse;
	try {
		deployHookResult = await client.signAndExecuteTransaction({
			signer: keypair,
			transaction: deployHookTx,
			options: { showEffects: true, showObjectChanges: true },
		});
	} catch (error: any) {
		console.error(chalk.red('  └─ Deploy hook execution failed'));
		console.error(error.message);
		process.exit(1);
	}

	if (deployHookResult.effects?.status.status === 'success') {
		console.log('  ├─ Hook execution successful');
		console.log(`  ├─ Transaction: ${deployHookResult.digest}`);

		console.log('\n📋 Created Schemas:');
		deployHookResult.objectChanges?.map(object => {
			if (
				object.type === 'created' &&
				object.objectType.includes('_schema') && !object.objectType.includes("dynamic_field")
			) {
				console.log(`  ├─ ${object.objectType}`);
				console.log(`     └─ ID: ${object.objectId}`);

				let structure: Record<string, string> = {};
				for (let schemaKey in dubheConfig.schemas) {
					if (capitalizeAndRemoveUnderscores(schemaKey) === getLastSegment(object.objectType)) {
						structure = dubheConfig.schemas[schemaKey].structure;
					}
				}

				schemas.push({
					name: object.objectType,
					objectId: object.objectId,
					structure,
				});
			}
		});

		saveContractData(
			dubheConfig.name,
			network,
			packageId,
			upgradeCapId,
			schemaHubId,
			version,
			schemas,
		);
		console.log('\n✅ Contract Publication Complete\n');
	} else {
		console.log(chalk.yellow('  └─ Deploy hook execution failed'));
		console.log(
			chalk.yellow(
				'     Please republish or manually call deploy_hook::run'
			)
		);
	}
}
