#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import { commands } from './commands';
import { logError } from './utils/errors';
import packageJson from '../package.json';

// Load .env file into process.env
import * as dotenv from 'dotenv';
dotenv.config();

yargs(hideBin(process.argv))
  // Explicit name to display in help (by default it's the entry file, which may not be "dubhe" for e.g. ts-node)
  .scriptName('dubhe')
  // Use the commands directory to scaffold
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- command array overload isn't typed, see https://github.com/yargs/yargs/blob/main/docs/advanced.md#esm-hierarchy
  .command(commands as any)
  .version(packageJson.version)
  .demandCommand(1, 'Please provide a command')
  .recommendCommands()
  // Enable strict mode.
  .strict()
  // Custom error handler
  .fail((msg, err) => {
    console.error(chalk.red(msg));

    if (msg.includes('Missing required argument')) {
      console.log(
        chalk.yellow(
          `Run 'pnpm dubhe ${process.argv[2]} --help' for a list of available and required arguments.`
        )
      );
    }
    console.log('');
    // Even though `.fail` type says we should get an `Error`, this can sometimes be undefined
    if (err != null) {
      logError(err);
      console.log('');
    }

    process.exit(1);
  })
  // Useful aliases.
  .alias({ h: 'help' }).argv;
