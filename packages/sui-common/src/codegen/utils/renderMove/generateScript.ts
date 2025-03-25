import { DubheConfig } from '../../types';
import { formatAndWriteMove } from '../formatAndWrite';
import { existsSync } from 'fs';
import { capitalizeAndRemoveUnderscores } from './generateSchema';

import { readFileSync } from 'fs';

export async function generateDeployHook(config: DubheConfig, srcPrefix: string) {
  console.log('\n📝 Starting Deploy Hook Generation...');
  console.log(
    `  └─ Output path: ${srcPrefix}/contracts/${config.name}/sources/scripts/deploy_hook.move`
  );

  const path = `${srcPrefix}/contracts/${config.name}/sources/scripts/deploy_hook.move`;
  if (!existsSync(path)) {
    const code = `module ${config.name}::${config.name}_deploy_hook {
			  use ${config.name}::${config.name}_schema::Schema;

  public(package) fun run(_schema: &mut Schema, _ctx: &mut TxContext) {

  }
}`;
    await formatAndWriteMove(code, path, 'formatAndWriteMove');
  }
  console.log('✅ Deploy Hook Generation Complete\n');
}

export async function generateMigrate(config: DubheConfig, srcPrefix: string) {
  if (!existsSync(`${srcPrefix}/contracts/${config.name}/sources/scripts/migrate.move`)) {
    let code = `module ${config.name}::${config.name}_migrate {
    const ON_CHAIN_VERSION: u32 = 1;

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
