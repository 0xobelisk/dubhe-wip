import type { CommandModule } from 'yargs';
import { logError } from '../utils/errors';
import { queryStorage } from '../utils';
import { loadConfig, DubheConfig } from '@0xobelisk/sui-common';

type Options = {
	network: 'mainnet' | 'testnet' | 'devnet' | 'localnet';
	'config-path': string;
	schema: string;
	struct: string;
	'object-id'?: string;
	'package-id'?: string;
	'metadata-path'?: string;
	params?: any[];
};

/**
 * CLI command module for querying schema struct state
 *
 * Examples:
 *
 * 1. Query StorageValue (no params required):
 * ```bash
 * dubhe query --config-path dubhe.config.ts --network devnet --schema counter --struct value
 * ```
 *
 * 2. Query StorageMap (one param required):
 * ```bash
 * dubhe query --config-path dubhe.config.ts --network devnet --schema token --struct balances \
 *   --params "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
 * ```
 *
 * 3. Query StorageDoubleMap (two params required):
 * ```bash
 * dubhe query --config-path dubhe.config.ts --network devnet --schema game --struct player_relations \
 *   --params "0x123...456" "0x789...abc"
 * ```
 */
const commandModule: CommandModule<Options, Options> = {
	command: 'query',

	describe: 'Query dubhe schema struct state',

	builder: {
		network: {
			type: 'string',
			choices: ['mainnet', 'testnet', 'devnet', 'localnet'],
			desc: 'Node network (mainnet/testnet/devnet/localnet)',
			demandOption: true,
		},
		'config-path': {
			type: 'string',
			default: 'dubhe.config.ts',
			desc: 'Configuration file path',
		},
		schema: {
			type: 'string',
			desc: 'Schema name',
			demandOption: true,
		},
		struct: {
			type: 'string',
			desc: 'Struct name',
			demandOption: true,
		},
		'object-id': {
			type: 'string',
			desc: 'Object ID (optional)',
		},
		'package-id': {
			type: 'string',
			desc: 'Package ID (optional)',
		},
		'metadata-path': {
			type: 'string',
			desc: 'Path to metadata JSON file (optional)',
		},
		params: {
			type: 'array',
			desc: 'Params for storage type: StorageValue(no params), StorageMap(1 param), StorageDoubleMap(2 params)',
		},
	},

	async handler({
		network,
		'config-path': configPath,
		schema,
		struct,
		'object-id': objectId,
		'package-id': packageId,
		'metadata-path': metadataPath,
		params,
	}) {
		try {
			const dubheConfig = (await loadConfig(configPath)) as DubheConfig;

			await queryStorage({
				dubheConfig,
				schema,
				struct,
				objectId,
				network,
				packageId,
				metadataFilePath: metadataPath,
				params,
			});
		} catch (error: any) {
			logError(error);
			process.exit(1);
		}
		process.exit(0);
	},
};

export default commandModule;
