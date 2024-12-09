import type { CommandModule } from 'yargs';
import { generateAccountHandler } from '../utils/generateAccount';

type Options = {
	force: boolean;
	'output-ts-path': string;
};

const commandModule: CommandModule<Options, Options> = {
	command: 'generate-key',
	describe:
		'Generate a new account key pair to .env file and output to a TypeScript file.',
	builder: {
		force: {
			type: 'boolean',
			default: false,
			desc: 'Force generate a new key pair',
		},
		'output-ts-path': {
			type: 'string',
			desc: 'Path to output the TypeScript file with keys',
		},
	},
	async handler({ force, outputTsPath }) {
		try {
			await generateAccountHandler(force, outputTsPath);
		} catch (error) {
			console.error('Error generating account:', error);
			process.exit(1);
		}
		process.exit(0);
	},
};

export default commandModule;
