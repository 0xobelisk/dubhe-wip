import { DubheConfig } from '../../types';
import { formatAndWriteMove } from '../formatAndWrite';
import { existsSync } from 'fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function generateSystem(config: DubheConfig, srcPrefix: string) {
  console.log('\n⚙️ Starting System Generation...');
  console.log(`  ├─ Generating systems`);
  console.log(`     └─ Output path: ${srcPrefix}/contracts/${config.name}/sources/systems`);

  if (!existsSync(`${srcPrefix}/contracts/${config.name}/sources/systems`)) {
    await fs.mkdir(`${srcPrefix}/contracts/${config.name}/sources/systems`, { recursive: true });
  }
  console.log('✅ System Generation Complete\n');
}
