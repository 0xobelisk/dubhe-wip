import type { CommandModule } from 'yargs';
import { logError } from '../utils/errors';
import { stateQueryHandler } from '../utils';
import { loadConfig, DubheConfig } from '@0xobelisk/sui-common';

type Options = {
	network: 'mainnet' | 'testnet' | 'devnet' | 'localnet';
	'config-path': string;
	'schema-name': string;
	'struct-name': string;
	'object-id': string;
	'package-id'?: string;
	'metadata-path'?: string;
};

/**
 * CLI command module for querying schema struct state
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
		'schema-name': {
			type: 'string',
			desc: 'Schema name',
			demandOption: true,
		},
		'struct-name': {
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
	},

	async handler({
		network,
		'config-path': configPath,
		'schema-name': schemaName,
		'struct-name': structName,
		'object-id': objectId,
		'package-id': packageId,
		'metadata-path': metadataPath,
	}) {
		try {
			const dubheConfig = (await loadConfig(configPath)) as DubheConfig;

			await stateQueryHandler({
				dubheConfig,
				schema: schemaName,
				struct: structName,
				objectId,
				network,
				packageId,
				metadataFilePath: metadataPath,
			});
		} catch (error: any) {
			logError(error);
			process.exit(1);
		}
		process.exit(0);
	},
};

export default commandModule;
