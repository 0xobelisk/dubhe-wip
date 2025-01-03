import { Dubhe, loadMetadata, Transaction } from '@0xobelisk/sui-client';
import { DubheCliError } from './errors';
import { validatePrivateKey, getOldPackageId, getObjectId } from './utils';
import { DubheConfig } from '@0xobelisk/sui-common';
import * as fs from 'fs';
import * as path from 'path';

// param:
// u8:1
// u16:1
// u32:1
// u64:1
// u128:1
// u256:1
// object:0x1
// address:0x1
// bool:true
// string:"hello"
// array:[1,2,3]

function formatBCSParams(params: any[]) {
	return params;
}

export async function callHandler({
	dubheConfig,
	moduleName,
	funcName,
	params,
	network,
	objectId,
	packageId,
	metadataFilePath,
}: {
	dubheConfig: DubheConfig;
	moduleName: string;
	funcName: string;
	params?: any[];
	network: 'mainnet' | 'testnet' | 'devnet' | 'localnet';
	objectId?: string;
	packageId?: string;
	metadataFilePath?: string;
}) {
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

	// objectId = objectId || (await getObjectId(projectPath, network, schema));

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

	// if (!dubheConfig.schemas[schema]) {
	// 	throw new DubheCliError(
	// 		`Schema "${schema}" not found in dubhe config. Available schemas: ${Object.keys(
	// 			dubheConfig.schemas
	// 		).join(', ')}`
	// 	);
	// }

	// if (!dubheConfig.schemas[schema].structure[struct]) {
	// 	throw new DubheCliError(
	// 		`Struct "${struct}" not found in schema "${schema}". Available structs: ${Object.keys(
	// 			dubheConfig.schemas[schema].structure
	// 		).join(', ')}`
	// 	);
	// }

	// const storageType = dubheConfig.schemas[schema].structure[struct];

	const processedParams = params || [];
	if (!validateParams(processedParams)) {
		throw new Error(
			`Invalid params count for ${moduleName}. `
			// `Expected: ${getExpectedParamsCount(moduleName)}, ` +
			// `Got: ${processedParams.length}`
		);
	}

	const dubhe = new Dubhe({
		secretKey: privateKeyFormat,
		networkType: network,
		packageId,
		metadata,
	});
	const tx = new Transaction();

	const result = await dubhe.tx[moduleName][funcName]({
		tx,
		params: processedParams,
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
