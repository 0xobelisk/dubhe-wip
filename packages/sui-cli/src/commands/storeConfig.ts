import type { CommandModule } from 'yargs';
import { storeConfigHandler } from '../utils/storeConfig';
import { loadConfig, DubheConfig } from '@0xobelisk/sui-common';

type Options = {
	'config-path': string;
	network: 'mainnet' | 'testnet' | 'devnet' | 'localnet';
	'output-path': string;
};

const commandModule: CommandModule<Options, Options> = {
	command: 'store-config',

	describe: 'Store configuration for the Dubhe project',

	builder: {
		'config-path': {
			type: 'string',
			default: 'dubhe.config.ts',
			desc: 'Path to the config file',
		},
		network: {
			type: 'string',
			choices: ['mainnet', 'testnet', 'devnet', 'localnet'],
			desc: 'Network to store config for',
		},
		'output-path': {
			type: 'string',
			desc: 'Path to output the configuration',
		},
	},
	async handler({ 'config-path': configPath, network, outputPath }) {
		try {
			const dubheConfig = (await loadConfig(configPath)) as DubheConfig;
			await storeConfigHandler(dubheConfig, network, outputPath);
		} catch (error) {
			console.error('Error storing config:', error);
			process.exit(1);
		}
		process.exit(0);
	},
};

export default commandModule;
