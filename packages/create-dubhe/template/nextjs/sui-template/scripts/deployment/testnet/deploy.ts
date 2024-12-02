import chalk from 'chalk';
import { deployContract } from '../common';
import { dubheConfig } from '../../../dubhe.config';
import fs from 'fs/promises';
import path from 'path';

const TESTNET_FRAMEWORK_ID = '0x417ad1864a56a29ad0b5aaddd2e11bac1eeab6a68883ef53184a4cc5c293fec6';

async function updateDubheMoveToml(projectName: string) {
  try {
    console.log(chalk.blue(`\n🔍 Updating Move.toml...`));
    const moveTomlPath = path.join(process.cwd(), `contracts/${projectName}/Move.toml`);
    let content = await fs.readFile(moveTomlPath, 'utf8');

    content = content.replace(
      /Dubhe = \{[^}]+\}/,
      `Dubhe = { git = "https://github.com/0xobelisk/dubhe-framework.git", rev = "release-dubhe-v1.0.0-rc1" }`,
    );

    content = content.replace(/^dubhe\s+=\s+"0x[0-9a-fA-F]+"/m, `dubhe = "${TESTNET_FRAMEWORK_ID}"`);

    await fs.writeFile(moveTomlPath, content);
    console.log(chalk.green('  ✅ Move.toml updated successfully'));
  } catch (error) {
    throw new Error(`Failed to update Move.toml: ${error}`);
  }
}

async function main() {
  try {
    await updateDubheMoveToml(dubheConfig.name);
    await deployContract('testnet');
    console.log(chalk.green('\n✅ All operations completed successfully'));
  } catch (error) {
    console.error(chalk.red(`\n❌ Execution failed: ${error}`));
    process.exit(1);
  }
}

// Use IIFE (Immediately Invoked Function Expression) to ensure async code executes correctly
(async () => {
  try {
    await main();
  } catch (error) {
    console.error(chalk.red(`\n❌ Main program execution failed: ${error}`));
    process.exit(1);
  }
})();
