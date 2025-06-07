import { DubheConfig } from '../../types';
import { formatAndWriteMove } from '../formatAndWrite';

export async function generateInitTest(config: DubheConfig, path: string) {
  let init_test_code = `module ${config.name}::${config.name}_init_test {
  use sui::clock;
  use sui::test_scenario;
  use sui::test_scenario::Scenario;
  use dubhe::dapp_hub::{DappHub, Self};

  public fun deploy_dapp_for_testing(scenario: &mut Scenario): DappHub {
    let ctx = test_scenario::ctx(scenario);
    let clock = clock::create_for_testing(ctx);
    let mut dapp_hub = dapp_hub::create_dapp_hub_for_testing(ctx);
    ${config.name}::${config.name}_genesis::run(&mut dapp_hub, &clock, ctx);
    clock::destroy_for_testing(clock);
    test_scenario::next_tx(scenario, ctx.sender());
    dapp_hub
  }
}
`;
  await formatAndWriteMove(
    init_test_code,
    path,
    'formatAndWriteMove'
  );
}
