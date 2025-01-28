import { DubheConfig } from '../../types';
import { formatAndWriteMove } from '../formatAndWrite';
import { existsSync } from 'fs';
import { capitalizeAndRemoveUnderscores } from './generateSchema';

export async function generateInit(
	config: DubheConfig,
	srcPrefix: string
) {
	console.log('\n📝 Starting Init Generation...');
	console.log(
		`  └─ Output path: ${srcPrefix}/contracts/${config.name}/sources/tests/init.move`
	);

		let init_test_code = `module ${config.name}::init_test {
    use ${config.name}::dapp_schema::Dapp;
    use sui::clock;
    use sui::test_scenario;
    use sui::test_scenario::Scenario;
    
    public fun deploy_dapp_for_testing(sender: address): (Scenario, Dapp) {
        let mut scenario = test_scenario::begin(sender);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        ${config.name}::init::run(&clock, ctx);
        clock::destroy_for_testing(clock);
        test_scenario::next_tx(&mut scenario,sender);
        let dapp = test_scenario::take_shared<Dapp>(&scenario);
        (scenario, dapp)
    }
}
`;
		await formatAndWriteMove(
			init_test_code,
			`${srcPrefix}/contracts/${config.name}/sources/tests/init.move`,
			'formatAndWriteMove'
		);

	let init_code = `module ${config.name}::genesis {
      use std::ascii::string;

  use sui::clock::Clock;

  use ${config.name}::dapp_system;

  public entry fun run(clock: &Clock, ctx: &mut TxContext) {
    // Create a dapp.
    let mut dapp = dapp_system::create(string(b"${config.name}"),string(b"${config.description}"), clock , ctx);
    // Create schemas
    let mut schema = ${config.name}::schema::create(ctx);
    // Logic that needs to be automated once the contract is deployed
    ${config.name}::deploy_hook::run(&mut schema, ctx);
    // Authorize schemas and public share objects
    dapp.add_schema(schema);
    sui::transfer::public_share_object(dapp);
  }
}
`;
	await formatAndWriteMove(
		init_code,
		`${srcPrefix}/contracts/${config.name}/sources/codegen/genesis.move`,
		'formatAndWriteMove'
	);

	console.log('✅ Init Generation Complete\n');
}