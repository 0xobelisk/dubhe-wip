import type { CommandModule } from 'yargs';
import { startLocalNode } from '../utils/startNode';

const commandModule: CommandModule = {
  command: 'node',

  describe: 'Manage local Sui node',

  builder(yargs) {
    return yargs
      .option('force-regenesis', {
        alias: 'f',
        type: 'boolean',
        description: 'Force regenesis the local node',
        default: true
      });
  },

  async handler(argv) {
    try {
      await startLocalNode({ forceRegenesis: argv['force-regenesis'] as boolean });
    } catch (error) {
      console.error('Error executing command:', error);
      process.exit(1);
    }
  }
};

export default commandModule;
