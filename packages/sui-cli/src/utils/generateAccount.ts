import { Dubhe } from '@0xobelisk/sui-client';
import * as fs from 'fs';
import chalk from 'chalk';

export async function generateAccountHandler(
  force: boolean = false,
  useNextPublic: boolean = false
) {
  if (useNextPublic) {
    console.log(
      chalk.gray(
        'Note: The generated account will be stored in the .env file with NEXT_PUBLIC_ prefix for client-side usage.'
      )
    );
    console.log(
      chalk.yellow('Warning: Do not expose the .env file, it is intended for local testing only.\n')
    );
  }
  const path = process.cwd();
  let privateKey: string | undefined;

  // Check if .env file exists
  try {
    const envContent = fs.readFileSync(`${path}/.env`, 'utf8');
    // Check for both possible environment variables
    const privateKeyMatch = envContent.match(/PRIVATE_KEY=(.+)/);
    const nextPublicMatch = envContent.match(/NEXT_PUBLIC_PRIVATE_KEY=(.+)/);

    if (privateKeyMatch && privateKeyMatch[1]) {
      privateKey = privateKeyMatch[1];
    } else if (nextPublicMatch && nextPublicMatch[1]) {
      privateKey = nextPublicMatch[1];
    }

    if (privateKey) {
      // If a key exists, decide which form to use based on the useNextPublic parameter
      const envContent = useNextPublic
        ? `NEXT_PUBLIC_PRIVATE_KEY=${privateKey}`
        : `PRIVATE_KEY=${privateKey}`;
      fs.writeFileSync(`${path}/.env`, envContent);

      const dubhe = new Dubhe({ secretKey: privateKey });
      const keypair = dubhe.getSigner();
      console.log(chalk.blue(`Using existing account: ${keypair.toSuiAddress()}`));
      return;
    }
  } catch (error) {
    // .env file doesn't exist or failed to read, continue to generate new account
  }

  // Generate a new account if no existing key is found or force generation is requested
  if (force || !privateKey) {
    const dubhe = new Dubhe();
    const keypair = dubhe.getSigner();
    privateKey = keypair.getSecretKey();

    const envContent = useNextPublic
      ? `NEXT_PUBLIC_PRIVATE_KEY=${privateKey}`
      : `PRIVATE_KEY=${privateKey}`;
    fs.writeFileSync(`${path}/.env`, envContent);
    console.log(chalk.green(`File created at: ${path}/.env`));

    console.log(chalk.blue(`New account generated: ${keypair.toSuiAddress()}`));
  }
}
