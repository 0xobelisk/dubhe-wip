import type { CommandModule } from 'yargs';
import waitOn from 'wait-on';
import ora from 'ora';
import chalk from 'chalk';
import net from 'net';
import { handler_exit } from './shell';

interface WaitOptions {
  url?: string;
  localnet?: boolean;
  timeout: number;
  interval: number;
}

// Check if PostgreSQL port is occupied (service is running)
async function checkPostgreSQLRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    // Set timeout for connection attempt
    const timeout = setTimeout(() => {
      socket.destroy();
      if (!isConnected) {
        resolve(false);
      }
    }, 2000);

    socket.connect(5432, '127.0.0.1', () => {
      isConnected = true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(true); // Port is occupied, PostgreSQL is running
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      if (!isConnected) {
        resolve(false); // Connection failed, PostgreSQL not running
      }
    });
  });
}

// Wait for all localnet services with custom checks
async function waitForLocalnetServices(options: WaitOptions): Promise<void> {
  const spinner = ora({
    text: 'Waiting for dubhe localnet services...',
    color: 'cyan'
  });

  spinner.start();

  const startTime = Date.now();

  while (Date.now() - startTime < options.timeout) {
    try {
      // Check HTTP services using wait-on (excluding 9000 port)
      await waitOn({
        resources: [
          'http://127.0.0.1:9123', // Sui faucet
          'http://127.0.0.1:4000' // GraphQL server
        ],
        timeout: options.interval,
        interval: 500,
        validateStatus: (status: number) => status === 200
      });

      // Check PostgreSQL separately
      const postgresRunning = await checkPostgreSQLRunning();

      if (postgresRunning) {
        spinner.succeed(chalk.green('All dubhe localnet services are ready!'));
        return;
      }
    } catch (error) {
      // Continue waiting...
    }

    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, options.interval));
  }

  // Timeout reached
  throw new Error('Timeout waiting for services');
}

const commandModule: CommandModule = {
  command: 'wait',
  describe: 'Wait for service(s) to be ready',
  builder(yargs) {
    return yargs
      .option('url', {
        type: 'string',
        description: 'URL to wait for (single service)'
      })
      .option('localnet', {
        type: 'boolean',
        description:
          'Wait for all dubhe localnet services (sui localnode:9000&9123, postgres:5432, graphql:4000)',
        default: false
      })
      .option('timeout', {
        type: 'number',
        description: 'Timeout (in milliseconds)',
        default: 180000
      })
      .option('interval', {
        type: 'number',
        description: 'Check interval (in milliseconds)',
        default: 1000
      })
      .check((argv) => {
        if (!argv.url && !argv.localnet) {
          throw new Error('Please provide either --url or --localnet option');
        }
        if (argv.url && argv.localnet) {
          throw new Error('Cannot use both --url and --localnet options together');
        }
        return true;
      });
  },
  async handler(argv) {
    const options = argv as unknown as WaitOptions;

    try {
      if (options.localnet) {
        await waitForLocalnetServices(options);
      } else {
        // Single URL mode - use original wait-on logic
        const spinner = ora({
          text: `Waiting for ${options.url}...`,
          color: 'cyan'
        });

        spinner.start();

        await waitOn({
          resources: [options.url!],
          timeout: options.timeout,
          interval: options.interval,
          validateStatus: (status: number) => status === 200
        });

        spinner.succeed(chalk.green('Service is ready!'));
      }

      handler_exit();
    } catch (error) {
      const spinner = ora();
      spinner.fail(
        chalk.red(
          options.localnet
            ? 'Timeout waiting for dubhe localnet services'
            : 'Timeout waiting for service'
        )
      );

      if (options.localnet) {
        console.error(chalk.yellow('Please make sure all required services are running:'));
        console.error(chalk.yellow('- Sui localnode on port 9000'));
        console.error(chalk.yellow('- Sui faucet on port 9123'));
        console.error(chalk.yellow('- PostgreSQL database on port 5432'));
        console.error(chalk.yellow('- Dubhe GraphQL server on port 4000'));
      } else {
        console.error(chalk.yellow('Please make sure the service is running...'));
      }

      handler_exit(1);
    }
  }
};

export default commandModule;
