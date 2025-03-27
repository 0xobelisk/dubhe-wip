import { DubheConfig } from '../../types';
import { formatAndWriteMove } from '../formatAndWrite';
import { existsSync } from 'fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function generateSystem(config: DubheConfig, srcPrefix: string) {
  if (!existsSync(`${srcPrefix}/contracts/${config.name}/sources/systems`)) {
    await fs.mkdir(`${srcPrefix}/contracts/${config.name}/sources/systems`, { recursive: true });
  }
}
