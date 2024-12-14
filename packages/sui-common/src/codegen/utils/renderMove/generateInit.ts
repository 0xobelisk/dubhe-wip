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

		let code = `module ${config.name}::init_test {
    use ${config.name}::dapp_schema::Dapp;
    use sui::clock;
    use sui::test_scenario;
    use sui::test_scenario::Scenario;
    
    public fun deploy_dapp_for_testing(sender: address): (Scenario, Dapp) {
        let mut scenario = test_scenario::begin(sender);
        let ctx = test_scenario::ctx(&mut scenario);
        let clock = clock::create_for_testing(ctx);
        ${config.name}::deploy_hook::run(&clock, ctx);
        clock::destroy_for_testing(clock);
        test_scenario::next_tx(&mut scenario,sender);
        let dapp = test_scenario::take_shared<Dapp>(&scenario);
        (scenario, dapp)
    }
}
`;
		await formatAndWriteMove(
			code,
			`${srcPrefix}/contracts/${config.name}/sources/tests/init.move`,
			'formatAndWriteMove'
		);

	console.log('✅ Deploy Hook Generation Complete\n');
}