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
  let envContent = '';

  // Check if .env file exists
  try {
    envContent = fs.readFileSync(`${path}/.env`, 'utf8');
    // Check for both possible environment variables
    const privateKeyMatch = envContent.match(/^PRIVATE_KEY=(.+)$/m);
    const nextPublicMatch = envContent.match(/^NEXT_PUBLIC_PRIVATE_KEY=(.+)$/m);

    // Prioritize the topmost record
    if (nextPublicMatch && nextPublicMatch[1]) {
      privateKey = nextPublicMatch[1];
    } else if (privateKeyMatch && privateKeyMatch[1]) {
      privateKey = privateKeyMatch[1];
    }

    if (privateKey) {
      // If key exists, decide whether to update keyname based on useNextPublic
      const newKeyName = useNextPublic ? 'NEXT_PUBLIC_PRIVATE_KEY' : 'PRIVATE_KEY';

      // Check if the current keyname is already the target keyname
      const currentKeyName = nextPublicMatch ? 'NEXT_PUBLIC_PRIVATE_KEY' : 'PRIVATE_KEY';
      if (currentKeyName !== newKeyName) {
        // If keyname needs to be updated, update it
        envContent = envContent.replace(
          new RegExp(`^${currentKeyName}=.+$`, 'm'),
          `${newKeyName}=${privateKey}`
        );
        fs.writeFileSync(`${path}/.env`, envContent);
      }

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

    const newKeyName = useNextPublic ? 'NEXT_PUBLIC_PRIVATE_KEY' : 'PRIVATE_KEY';
    const newContent = `${newKeyName}=${privateKey}`;

    // If .env file exists, append new content; otherwise create a new file
    if (envContent) {
      envContent = envContent.trim() + '\n' + newContent;
    } else {
      envContent = newContent;
    }

    fs.writeFileSync(`${path}/.env`, envContent);
    console.log(chalk.green(`File created/updated at: ${path}/.env`));

    console.log(chalk.blue(`New account generated: ${keypair.toSuiAddress()}`));
  }
}
