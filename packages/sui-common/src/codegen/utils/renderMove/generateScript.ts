import { DubheConfig } from '../../types';
import { formatAndWriteMove } from '../formatAndWrite';
import { existsSync } from 'fs';
import { capitalizeAndRemoveUnderscores } from './generateSchema';

export async function generateDeployHook(
	config: DubheConfig,
	srcPrefix: string
) {
	console.log('\n📝 Starting Deploy Hook Generation...');
	console.log(
		`  └─ Output path: ${srcPrefix}/contracts/${config.name}/sources/scripts/deploy_hook.move`
	);

	if (
		!existsSync(
			`${srcPrefix}/contracts/${config.name}/sources/scripts/deploy_hook.move`
		)
	) {
		let code = `module ${config.name}::deploy_hook {
    use dubhe::dapps_schema::Dapps;
    use dubhe::dapps_system;
    use ${config.name}::schema_hub::SchemaHub;
    use std::ascii::string;
    use sui::clock::Clock;
    use sui::sui::SUI;
    use sui::coin::Coin;
    use sui::package::UpgradeCap;
    use sui::transfer::public_share_object;
    ${Object.keys(config.schemas).map(schemaName => {
			return `use ${config.name}::${schemaName}_schema::${capitalizeAndRemoveUnderscores(schemaName)};`}).join('\n')
		}
      #[test_only]
      use sui::clock;
      #[test_only]
      use sui::coin;
      #[test_only]
      use sui::test_scenario;
      #[test_only]
      use sui::package;
      #[test_only]
      use ${config.name}::schema_hub;      
      #[test_only]
      use dubhe::dapps_schema;
      #[test_only]
      use sui::test_scenario::Scenario;

    public entry fun run(schema_hub: &mut SchemaHub, dapps: &mut Dapps, cap: &UpgradeCap, clock: &Clock, coin: Coin<SUI>, ctx: &mut TxContext) {
        // Register the dapp to dubhe.
        dapps_system::register(dapps,cap,string(b"${config.name}"),string(b"${config.description}"),clock,coin,ctx);
        // Create schemas
        ${Object.keys(config.schemas).map(schemaName => {
				return `let ${schemaName} = ${config.name}::${schemaName}_schema::create(ctx);`;
			}).join('\n')}
        // Logic that needs to be automated once the contract is deployed
				${`\n`}
				${`\n`}
				
        // Authorize schemas and public share objects
        ${Object.keys(config.schemas).map(schemaName => {
				 return `
				 schema_hub.authorize_schema<${capitalizeAndRemoveUnderscores(schemaName)}>();
				 public_share_object(${schemaName});
				 `;
			}).join('\n')}
    }

    #[test_only]
  public fun deploy_hook_for_testing(): (Scenario, SchemaHub, Dapps) {
    let mut scenario = test_scenario::begin(@0xA);
    {
          let ctx = test_scenario::ctx(&mut scenario);
          dapps_schema::init_dapps_for_testing(ctx);
          schema_hub::init_schema_hub_for_testing(ctx);
          test_scenario::next_tx(&mut scenario,@0xA);
      };
    let mut dapps = test_scenario::take_shared<Dapps>(&scenario);
    let mut schema_hub = test_scenario::take_shared<SchemaHub>(&scenario);
    let ctx = test_scenario::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    let upgrade_cap = package::test_publish(@0x42.to_id(), ctx);
    let coin  = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
    run(&mut schema_hub, &mut dapps, &upgrade_cap, &clock, coin, ctx);

    clock::destroy_for_testing(clock);
    upgrade_cap.make_immutable();
    test_scenario::next_tx(&mut scenario,@0xA);
    (scenario, schema_hub, dapps)
  }
}
`;
		await formatAndWriteMove(
			code,
			`${srcPrefix}/contracts/${config.name}/sources/scripts/deploy_hook.move`,
			'formatAndWriteMove'
		);
	}
	console.log('✅ Deploy Hook Generation Complete\n');
}

export async function generateMigrate(config: DubheConfig, srcPrefix: string) {
	if (
		!existsSync(
			`${srcPrefix}/contracts/${config.name}/sources/scripts/migrate.move`
		)
	) {
		let code = `module ${config.name}::migrate {
    const ON_CHAIN_VERSION: u32 = 0;

    public fun on_chain_version(): u32 {
        ON_CHAIN_VERSION
    }
}
`;
		await formatAndWriteMove(
			code,
			`${srcPrefix}/contracts/${config.name}/sources/scripts/migrate.move`,
			'formatAndWriteMove'
		);
	}
}
