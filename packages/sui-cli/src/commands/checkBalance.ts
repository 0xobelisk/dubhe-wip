import type { CommandModule } from 'yargs';
import { checkBalanceHandler } from '../utils/checkBalance';

type Options = {
	network: 'mainnet' | 'testnet' | 'devnet' | 'localnet';
	amount: number;
};

const commandModule: CommandModule<Options, Options> = {
	command: 'check-balance',
	describe: 'Check the balance of the account',
	builder: {
		network: {
			type: 'string',
			choices: ['mainnet', 'testnet', 'devnet', 'localnet'],
			desc: 'Network to check balance on',
		},
		amount: {
			type: 'number',
			default: 2,
			desc: 'Amount of SUI to check balance for',
		},
	},
	async handler({ network, amount }) {
		try {
			await checkBalanceHandler(network, amount);
		} catch (error) {
			console.error('Error checking balance:', error);
			process.exit(1);
		}
		process.exit(0);
	},
};

export default commandModule;
