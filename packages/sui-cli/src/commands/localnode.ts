import type { CommandModule } from 'yargs';
import { startLocalNode } from '../utils/startNode';
import {DubheConfig, loadConfig} from "@0xobelisk/sui-common";
import {dubheInstall} from "./install";

type Options = {
	'config-path': string;
};

const commandModule: CommandModule<Options, Options> = {
	command: 'node',

	describe: 'Manage local Sui node',

	builder(yargs) {
		return yargs
			.options({
				'config-path': {
					type: 'string',
					default: 'dubhe.config.ts',
					description: 'Path to the configuration file',
				},
			})
	},

	async handler({ 'config-path': configPath }) {
		try {
			const dubheConfig = (await loadConfig(configPath)) as DubheConfig;
			await dubheInstall(dubheConfig, 'localnet');
			await startLocalNode(dubheConfig);
		} catch (error) {
			console.error('Error executing command:', error);
			process.exit(1);
		}
	},
};

export default commandModule;
