import type { CommandModule } from 'yargs';
import { requestSuiFromFaucetV0, getFaucetHost } from '@mysten/sui/faucet';
import { SuiClient, getFullnodeUrl, GetBalanceParams } from '@mysten/sui/client';
import { initializeDubhe } from '../utils';

type Options = {
  network: any;
  recipient?: string;
};

const MAX_RETRIES = 60; // 60s timeout
const RETRY_INTERVAL = 1000; // 1s retry interval
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const commandModule: CommandModule<Options, Options> = {
  command: 'faucet',

  describe: 'Interact with a Dubhe faucet',

  builder(yargs) {
    return yargs.options({
      network: {
        type: 'string',
        desc: 'URL of the Dubhe faucet',
        choices: ['testnet', 'devnet', 'localnet'],
        default: 'localnet'
      },
      recipient: {
        type: 'string',
        desc: 'Sui address to fund'
      }
    });
  },

  async handler({ network, recipient }) {
    let faucet_address = '';
    if (recipient === undefined) {
      const dubhe = initializeDubhe(network);
      faucet_address = dubhe.getAddress();
    } else {
      faucet_address = recipient;
    }

    console.log('\n🌊 Starting Faucet Operation...');
    console.log(`  ├─ Network: ${network}`);

    if (recipient === undefined) {
      console.log('  ├─ Using Environment PrivateKey');
      console.log(`  ├─ Generated Address: ${faucet_address}`);
    } else {
      console.log(`  ├─ Using Provided Address: ${faucet_address}`);
    }

    console.log('  ├─ Requesting funds from faucet...');

    let retryCount = 0;
    let success = false;
    let spinnerIndex = 0;
    const startTime = Date.now();
    let isInterrupted = false;

    const handleInterrupt = () => {
      isInterrupted = true;
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
      console.log('\n  └─ Operation cancelled by user');
      process.exit(0);
    };
    process.on('SIGINT', handleInterrupt);

    try {
      while (retryCount < MAX_RETRIES && !success && !isInterrupted) {
        try {
          await requestSuiFromFaucetV0({
            host: getFaucetHost(network),
            recipient: faucet_address
          });
          success = true;
        } catch (error) {
          if (isInterrupted) break;

          retryCount++;
          if (retryCount === MAX_RETRIES) {
            console.log(`  └─ Failed to request funds after ${MAX_RETRIES} attempts.`);
            console.log('  └─ Please check your network connection and try again later.');
            process.exit(1);
          }

          const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
          const spinner = SPINNER[spinnerIndex % SPINNER.length];
          spinnerIndex++;

          process.stdout.write(`\r  ├─ ${spinner} Retrying... (${elapsedTime}s)`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL));
        }
      }
    } finally {
      process.removeListener('SIGINT', handleInterrupt);
    }

    if (isInterrupted) {
      process.exit(0);
    }
    process.stdout.write('\r' + ' '.repeat(50) + '\r');

    console.log('  └─ Checking balance...');
    const client = new SuiClient({ url: getFullnodeUrl(network) });
    let params = {
      owner: faucet_address
    } as GetBalanceParams;

    const balance = await client.getBalance(params);

    console.log('\n💰 Account Summary');
    console.log(`  ├─ Address: ${faucet_address}`);
    console.log(`  └─ Balance: ${(Number(balance.totalBalance) / 1_000_000_000).toFixed(4)} SUI`);

    console.log('\n✅ Faucet Operation Complete\n');
    process.exit(0);
  }
};

export default commandModule;
