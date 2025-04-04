import { DubheConfig } from '../../types';
import { formatAndWriteMove } from '../formatAndWrite';
import { existsSync } from 'fs';
import { capitalizeAndRemoveUnderscores } from './generateSchema';

export async function generateInit(config: DubheConfig, srcPrefix: string) {
  let init_test_code = `module ${config.name}::${config.name}_init_test {
    use sui::clock;
    use sui::test_scenario;
    use sui::test_scenario::Scenario;
    
    public fun deploy_dapp_for_testing(sender: address): Scenario {
        let mut scenario = test_scenario::begin(sender);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        ${config.name}::${config.name}_genesis::run(&clock, ctx);
        clock::destroy_for_testing(clock);
        test_scenario::next_tx(&mut scenario,sender);
        scenario
    }
}
`;
  await formatAndWriteMove(
    init_test_code,
    `${srcPrefix}/contracts/${config.name}/sources/codegen/core/init_test.move`,
    'formatAndWriteMove'
  );

  let init_code = `module ${config.name}::${config.name}_genesis {
      use std::ascii::string;

  use sui::clock::Clock;

  use ${config.name}::${config.name}_dapp_system;

  public entry fun run(clock: &Clock, ctx: &mut TxContext) {
    // Create schemas
    let mut schema = ${config.name}::${config.name}_schema::create(ctx);
    // Setup default storage
    ${config.name}_dapp_system::create(&mut schema, string(b"${config.name}"),string(b"${config.description}"), clock , ctx);
    // Logic that needs to be automated once the contract is deployed
    ${config.name}::${config.name}_deploy_hook::run(&mut schema, ctx);
    // Authorize schemas and public share objects
    sui::transfer::public_share_object(schema);
  }
}
`;
  await formatAndWriteMove(
    init_code,

    `${srcPrefix}/contracts/${config.name}/sources/codegen/core/genesis.move`,
    'formatAndWriteMove'
  );
}
