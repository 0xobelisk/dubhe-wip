import type { CommandModule } from 'yargs';
import waitOn from 'wait-on';
import ora from 'ora';
import chalk from 'chalk';

interface WaitOptions {
  url?: string;
  localnet?: boolean;
  timeout: number;
  interval: number;
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

    let resources: string[];
    let description: string;

    if (options.localnet) {
      // Dubhe localnet services
      resources = [
        'http://localhost:9000', // Sui localnode
        'http://localhost:9123', // Sui faucet
        'tcp:localhost:5432', // PostgreSQL database
        'http://localhost:4000' // Dubhe GraphQL server
      ];
      description = 'dubhe localnet services';
    } else {
      // Single URL mode
      resources = [options.url!];
      description = options.url!;
    }

    const spinner = ora({
      text: `Waiting for ${description}...`,
      color: 'cyan'
    });

    spinner.start();

    try {
      await waitOn({
        resources,
        timeout: options.timeout,
        interval: options.interval,
        validateStatus: (status: number) => status === 200
      });

      spinner.succeed(
        chalk.green(
          options.localnet ? 'All dubhe localnet services are ready!' : 'Service is ready!'
        )
      );

      if (options.localnet) {
        console.log(chalk.gray('✓ Sui localnode (9000)'));
        console.log(chalk.gray('✓ Sui faucet (9123)'));
        console.log(chalk.gray('✓ PostgreSQL database (5432)'));
        console.log(chalk.gray('✓ Dubhe GraphQL server (4000)'));
      }

      process.exit(0);
    } catch (error) {
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

      process.exit(1);
    }
  }
};

export default commandModule;
