#!/usr/bin/env node

import yargs, { Argv } from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as dotenv from 'dotenv';
import { startServer, ServerConfig } from './server';
import { systemLogger } from './utils/logger';

// Load environment variables
dotenv.config();

// Helper function to get environment variable or default value
const getEnvOrDefault = (envKey: string, defaultValue: string): string => {
  return process.env[envKey] || defaultValue;
};

const getBooleanEnvOrDefault = (envKey: string, defaultValue: boolean): boolean => {
  const envValue = process.env[envKey];
  if (envValue === undefined) return defaultValue;
  return envValue.toLowerCase() === 'true';
};

interface StartArgs {
  port: string;
  'database-url': string;
  schema: string;
  endpoint: string;
  cors: boolean;
  subscriptions: boolean;
  env: string;
}

interface HealthArgs {
  url: string;
}

interface InitArgs {
  output: string;
}

const cli = yargs(hideBin(process.argv))
  .scriptName('dubhe-graphql-server')
  .usage('$0 <command> [options]')
  .version('1.2.0')
  .help('help')
  .alias('h', 'help')
  .alias('v', 'version')
  .demandCommand(1, 'You need to specify a command')
  .recommendCommands()
  .strict();

// Start command
cli.command(
  'start',
  'Start GraphQL server',
  (yargs: Argv) => {
    return yargs
      .option('port', {
        alias: 'p',
        type: 'string',
        default: getEnvOrDefault('PORT', '4000'),
        describe: 'Server port (env: PORT)'
      })
      .option('database-url', {
        alias: 'd',
        type: 'string',
        default: getEnvOrDefault(
          'DATABASE_URL',
          'postgres://postgres:postgres@127.0.0.1:5432/postgres'
        ),
        describe: 'Database connection URL (env: DATABASE_URL)'
      })
      .option('schema', {
        alias: 's',
        type: 'string',
        default: getEnvOrDefault('PG_SCHEMA', 'public'),
        describe: 'PostgreSQL schema name (env: PG_SCHEMA)'
      })
      .option('endpoint', {
        alias: 'e',
        type: 'string',
        default: getEnvOrDefault('GRAPHQL_ENDPOINT', '/graphql'),
        describe: 'GraphQL endpoint path (env: GRAPHQL_ENDPOINT)'
      })
      .option('cors', {
        type: 'boolean',
        default: getBooleanEnvOrDefault('ENABLE_CORS', true),
        describe: 'Enable CORS (env: ENABLE_CORS)'
      })
      .option('subscriptions', {
        type: 'boolean',
        default: getBooleanEnvOrDefault('ENABLE_SUBSCRIPTIONS', true),
        describe: 'Enable GraphQL subscriptions (env: ENABLE_SUBSCRIPTIONS)'
      })
      .option('env', {
        type: 'string',
        default: getEnvOrDefault('NODE_ENV', 'development'),
        choices: ['development', 'production'],
        describe: 'Environment mode (env: NODE_ENV)'
      })
      .example(
        '$0 start -p 4000 -d postgres://user:pass@localhost/db',
        'Start server with custom port and database'
      )
      .example(
        '$0 start --no-cors --no-subscriptions',
        'Start server with CORS and subscriptions disabled'
      );
  },
  async (argv: StartArgs) => {
    try {
      systemLogger.info('🚀 Starting Dubhe GraphQL server via CLI...', {
        port: argv.port,
        schema: argv.schema,
        endpoint: argv.endpoint,
        environment: argv.env
      });

      // Build server configuration object
      const serverConfig: ServerConfig = {
        port: argv.port,
        databaseUrl: argv['database-url'],
        schema: argv.schema,
        endpoint: argv.endpoint,
        cors: argv.cors,
        subscriptions: argv.subscriptions,
        env: argv.env
      };

      // Pass configuration object directly to startServer
      await startServer(serverConfig);
    } catch (error: unknown) {
      systemLogger.error('Failed to start server via CLI', error);
      process.exit(1);
    }
  }
);

// Parse command line arguments
cli.parse();
