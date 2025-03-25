import type { CommandModule } from 'yargs';
import { generateAccountHandler } from '../utils/generateAccount';

type Options = {
  force?: boolean;
  'output-ts-path'?: string;
};

const commandModule: CommandModule<Options, Options> = {
  command: 'generate-key',
  describe:
    'Generate a new account key pair and save it to a .env file, with an option to output to a TypeScript file.',
  builder: {
    force: {
      type: 'boolean',
      default: false,
      desc: 'Force generate a new key pair'
    },
    'output-ts-path': {
      type: 'string',
      desc: 'Specify the path to output the TypeScript file containing the key pair (e.g., ./src/config/key.ts)'
    }
  },
  async handler({ force, 'output-ts-path': outputTsPath }) {
    try {
      await generateAccountHandler(force, outputTsPath);
    } catch (error) {
      console.error('Error generating account:', error);
      process.exit(1);
    }
    process.exit(0);
  }
};

export default commandModule;
