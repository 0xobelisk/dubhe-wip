import type { CommandModule } from 'yargs';
import { startLocalNode } from '../utils/startNode';


type Options = {
  data_dir: string;
};

const commandModule: CommandModule<Options, Options> = {
  command: 'node',

  describe: 'Manage local Sui node',

  builder: {
    data_dir: {
      type: 'string',
      default: '.chk',
      desc: 'Path to the data directory'
    },
  },

  async handler({ data_dir }) {
    try {
      await startLocalNode(data_dir);
    } catch (error) {
      console.error('Error executing command:', error);
      process.exit(1);
    }
  }
};

export default commandModule;
