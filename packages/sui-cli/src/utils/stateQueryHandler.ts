import { Dubhe, loadMetadata } from '@0xobelisk/sui-client';
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
	updateDubheDependency,
	switchEnv,
	delay,
	getOldPackageId,
	getObjectId,
} from './utils';
import { DubheConfig } from '@0xobelisk/sui-common';
import * as fs from 'fs';
import * as path from 'path';

export async function stateQueryHandler({
	dubheConfig,
	schema,
	struct,
	network,
	objectId,
	packageId,
	metadataFilePath,
}: {
	dubheConfig: DubheConfig;
	schema: string;
	struct: string;
	network: 'mainnet' | 'testnet' | 'devnet' | 'localnet';
	objectId: string;
	packageId?: string;
	metadataFilePath?: string;
}) {
	await switchEnv(network);

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

	const path = process.cwd();
	const projectPath = `${path}/contracts/${dubheConfig.name}`;

	packageId = packageId || (await getOldPackageId(projectPath, network));

	objectId = objectId || (await getObjectId(projectPath, network, schema));

	let metadata;
	if (metadataFilePath) {
		metadata = await loadMetadataFromFile(metadataFilePath);
	} else {
		metadata = await loadMetadata(network, packageId);
	}
	if (!metadata) {
		throw new DubheCliError(
			`Metadata file not found. Please provide a metadata file path or set the packageId.`
		);
	}

	const dubhe = new Dubhe({
		secretKey: privateKeyFormat,
		networkType: network,
		metadata,
	});

	const result = await dubhe.state({
		schema: schema,
		struct: struct,
		objectId: objectId,
	});

	console.log(result);
}

/**
 * Load metadata from a JSON file and construct the metadata structure
 * @param metadataFilePath Path to the metadata JSON file
 * @param network Network type
 * @param packageId Package ID
 * @returns Constructed metadata object
 */
export async function loadMetadataFromFile(metadataFilePath: string) {
	// Verify file extension is .json
	if (path.extname(metadataFilePath) !== '.json') {
		throw new Error('Metadata file must be in JSON format');
	}

	try {
		// Read JSON file content
		const rawData = fs.readFileSync(metadataFilePath, 'utf8');
		const jsonData = JSON.parse(rawData);

		// Validate JSON structure
		if (!jsonData || typeof jsonData !== 'object') {
			throw new Error('Invalid JSON format');
		}

		// Construct metadata structure
		const metadata = {
			...jsonData,
		};

		return metadata;
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to read metadata file: ${error.message}`);
		}
		throw error;
	}
}
