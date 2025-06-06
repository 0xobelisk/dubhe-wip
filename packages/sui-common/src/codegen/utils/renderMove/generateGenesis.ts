import { DubheConfig } from '../../types';
import { formatAndWriteMove } from '../formatAndWrite';
import { existsSync } from 'fs';
import { capitalizeAndRemoveUnderscores } from './generateSchema';
import path from 'node:path';

function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function generateGenesis(config: DubheConfig, path: string) {
  // Generate register table code
  const registerTablesCode = Object.keys(config.components || {})
    .map(componentName => `    ${config.name}_${componentName}::register_table(dapp_hub, ctx);`)
    .join('\n');

  let genesis_code = `module ${config.name}::${config.name}_genesis {
      use std::ascii::string;
      use sui::clock::Clock;
      use dubhe::dapp_hub::DappHub;
      use ${config.name}::${config.name}_dapp_key;
      ${Object.keys(config.components || {}).map(componentName => `use ${config.name}::${config.name}_${componentName};`).join('\n      ')}

  public entry fun run(dapp_hub: &mut DappHub, clock: &Clock, ctx: &mut TxContext) {
    // Create Dapp
    let dapp_key = ${config.name}_dapp_key::new();
    dapp_hub.create_dapp(dapp_key, b"${config.name}", b"${config.description}", clock, ctx);

    // Register tables
${registerTablesCode}

    // Logic that needs to be automated once the contract is deployed
    ${config.name}::${config.name}_deploy_hook::run(dapp_hub, ctx);
  }
}
`;
  await formatAndWriteMove(
    genesis_code,
    path,
    'formatAndWriteMove'
  );
}
