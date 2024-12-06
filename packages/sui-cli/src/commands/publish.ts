import type { CommandModule } from 'yargs';
import { logError } from '../utils/errors';
import { publishHandler } from '../utils';
import { loadConfig, DubheConfig } from '@0xobelisk/sui-common';

type Options = {
	network: any;
	configPath: string;
	contractName?: string;
};

const commandModule: CommandModule<Options, Options> = {
	command: 'publish',

	describe: 'Publish dubhe move contract',

	builder(yargs) {
		return yargs.options({
			network: {
				type: 'string',
				choices: ['mainnet', 'testnet', 'devnet', 'localnet'],
				desc: 'Node network (mainnet/testnet/devnet/localnet)',
			},
			configPath: {
				type: 'string',
				default: 'dubhe.config.ts',
				desc: 'Configuration file path',
			},
			contractName: {
				type: 'string',
				desc: 'Optional contract name',
			},
		});
	},

	async handler({ network, configPath, contractName }) {
		try {
			const dubheConfig = (await loadConfig(
				configPath
			)) as DubheConfig;
			await publishHandler(dubheConfig, network, contractName);
		} catch (error: any) {
			logError(error);
			process.exit(1);
		}
		process.exit(0);
	},
};

export default commandModule;
