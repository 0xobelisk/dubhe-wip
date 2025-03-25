import { Dubhe, NetworkType } from '@0xobelisk/sui-client';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { validatePrivateKey } from './utils';
import { DubheCliError } from './errors';
dotenv.config();

export async function checkBalanceHandler(network: 'mainnet' | 'testnet' | 'devnet' | 'localnet') {
  try {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new DubheCliError(
        `Missing PRIVATE_KEY environment variable.
  Run 'echo "PRIVATE_KEY=YOUR_PRIVATE_KEY" > .env'
  in your contracts directory to use the default sui private key.`
      );
    }
    const privateKeyFormat = validatePrivateKey(privateKey);
    if (privateKeyFormat === false) {
      throw new DubheCliError(`Please check your privateKey.`);
    }

    const dubhe = new Dubhe({
      secretKey: process.env.PRIVATE_KEY,
      networkType: network as NetworkType
    });

    const balance = await dubhe.getBalance();
    const balanceInSUI = Number(balance.totalBalance) / 1_000_000_000;

    if (balanceInSUI === 0) {
      throw new DubheCliError(`Your account balance is 0 SUI. Please get some SUI to proceed.`);
    }

    console.log(chalk.green(`Current account balance: ${balanceInSUI.toFixed(4)} SUI`));
  } catch (error) {
    throw new DubheCliError('Failed to check balance: ' + error);
  }
}
