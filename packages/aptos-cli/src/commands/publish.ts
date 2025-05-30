import type { CommandModule } from 'yargs';
import { logError } from '../utils/errors';
import { publishHandler } from '../utils';
import { loadConfig, DubheConfig } from '@0xobelisk/aptos-common';
import { AccountAddress } from '@0xobelisk/aptos-client';

type Options = {
  network: any;
  'config-path': string;
  'named-addresses'?: string;
};

const commandModule: CommandModule<Options, Options> = {
  command: 'publish',

  describe: 'Publish dubhe move contracts',

  builder(yargs) {
    return yargs.options({
      network: {
        type: 'string',
        choices: ['mainnet', 'testnet', 'devnet', 'localnet', 'movementmainnet', 'movementtestnet'],
        desc: 'Network of the node (mainnet/testnet/devnet/localnet/movementmainnet/movementtestnet)'
      },
      'config-path': {
        type: 'string',
        default: 'dubhe.config.ts',
        desc: 'Path to the config file'
      },
      'named-addresses': {
        type: 'string',
        desc: 'Named addresses in format "name1=address1,name2=address2"',
        optional: true
      }
    });
  },

  async handler({ network, 'config-path': configPath, 'named-addresses': namedAddresses }) {
    try {
      const dubheConfig = (await loadConfig(configPath)) as DubheConfig;

      const parsedAddresses = namedAddresses
        ? namedAddresses.split(',').map((pair) => {
            const [name, address] = pair.split('=');
            return {
              name,
              address: AccountAddress.fromString(address)
            };
          })
        : undefined;

      await publishHandler(dubheConfig.name, network, parsedAddresses);
    } catch (error: any) {
      logError(error);
      process.exit(1);
    }
    process.exit(0);
  }
};

export default commandModule;
