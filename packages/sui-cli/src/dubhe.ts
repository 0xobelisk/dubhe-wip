#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { commands } from './commands';
import { logError } from './utils/errors';

// Load .env file into process.env
import * as dotenv from 'dotenv';
import chalk from 'chalk';
dotenv.config();

yargs(hideBin(process.argv))
  // Explicit name to display in help (by default it's the entry file, which may not be "dubhe" for e.g. ts-node)
  .scriptName('dubhe')
  // Use the commands directory to scaffold
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- command array overload isn't typed, see https://github.com/yargs/yargs/blob/main/docs/advanced.md#esm-hierarchy
  .command(commands as any)
  .demandCommand(1, 'Please provide a command')
  .recommendCommands()
  // Enable strict mode.
  .strict()
  // Custom error handler
  .fail((msg, err, yargsInstance) => {
    console.error(chalk.red(msg));

    if (msg.includes('Missing required argument')) {
      console.log(
        chalk.yellow(
          `Run 'pnpm dubhe ${process.argv[2]} --help' for a list of available and required arguments.`
        )
      );
    }

    if (err) {
      console.log('');
      logError(err);
      console.log('');
    }

    yargsInstance.showHelp();

    process.exit(1);
  })
  // Useful aliases.
  .alias({ h: 'help' }).argv;
