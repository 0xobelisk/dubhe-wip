import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import yargsInteractive from 'yargs-interactive';
import { CHAINS } from '../config/chains';
import packageJson from '../../package.json';

const cwd = process.cwd();
const renameFiles: Record<string, string | undefined> = {
  _gitignore: '.gitignore'
};
const defaultTargetDir = 'dubhe-template-project';

interface Choice {
  name: string;
  value: string;
  description: string;
}

const init = async () => {
  // Prepare chain options
  const chainChoices = CHAINS.map(({ title, description, value }) => ({
    name: `${title} - ${description}`,
    value
  }));

  // Step 1: Choose project name and chain
  const firstStep = await yargsInteractive()
    .usage('$0 [args]')
    .interactive({
      interactive: { default: true },
      projectName: {
        describe: 'Name your project',
        type: 'input'
      },
      chain: {
        describe: 'Pick your chain',
        type: 'list',
        choices: chainChoices.map((c) => c.value)
      },
      dubheVersion: {
        describe: 'The version of Dubhe packages to use, defaults to latest',
        type: 'input',
        default: packageJson.version
      }
    });

  const { projectName, chain, dubheVersion } = firstStep;

  // Get available templates based on the selected chain
  const selectedChain = CHAINS.find((c) => c.value === chain);
  if (!selectedChain) {
    console.error('Invalid chain selection');
    process.exit(1);
  }

  // Prepare platform options
  const platformChoices = selectedChain.supportedTemplates.map(({ title, description, value }) => ({
    name: `${title} - ${description}`,
    value
  }));

  // Step 2: Choose platform
  const secondStep = await yargsInteractive()
    .usage('$0 [args]')
    .interactive({
      interactive: { default: true },
      platform: {
        describe: 'Pick your platform',
        type: 'list',
        choices: platformChoices.map((c) => c.value)
      }
    });

  const { platform } = secondStep;

  const selectedTemplate = selectedChain.supportedTemplates.find((t) => t.value === platform);
  if (!selectedTemplate) {
    console.error('Invalid platform selection');
    process.exit(1);
  }

  const target = selectedTemplate.path.replace('{chain}', chain);

  let targetDir = projectName || defaultTargetDir;
  const root = path.join(cwd, targetDir);

  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  const pkgManager = pkgInfo ? pkgInfo.name : 'npm';

  const templateDir = path.resolve(fileURLToPath(import.meta.url), '../..', target);

  if (!fs.existsSync(templateDir)) {
    console.error(`Template directory not found: ${templateDir}`);
    process.exit(1);
  }

  const write = (file: string, content?: string) => {
    const targetPath = path.join(root, renameFiles[file] ?? file);
    if (content) {
      fs.writeFileSync(targetPath, content);
    } else {
      try {
        copy(path.join(templateDir, file), targetPath);
      } catch (error) {
        console.error(`Error copying file ${file}:`, error);
        process.exit(1);
      }
    }
  };

  const files = fs.readdirSync(templateDir);
  for (const file of files.filter((f) => f !== 'package.json' && f !== 'node_modules')) {
    write(file);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(templateDir, `package.json`), 'utf-8'));

  pkg.name = projectName;

  const pkgContent = JSON.stringify(pkg, null, 2);
  const updatedPkgContent = pkgContent.replace(/{{dubhe-version}}/g, dubheVersion);

  write('package.json', updatedPkgContent + '\n');

  const cdProjectName = path.relative(cwd, root);

  const styles = {
    success: '\x1b[32m%s\x1b[0m',
    info: '\x1b[36m%s\x1b[0m',
    command: '\x1b[33m%s\x1b[0m',
    separator: '\x1b[90m%s\x1b[0m'
  };

  console.log('\n' + '='.repeat(60));
  console.log(styles.success, '🎉 Project creation successful!');
  console.log(styles.info, `📁 Project location: ${root}`);
  console.log(styles.separator, '-'.repeat(60));
  console.log(styles.info, 'Next steps:\n');

  if (root !== cwd) {
    console.log(
      styles.command,
      `  cd ${cdProjectName.includes(' ') ? `"${cdProjectName}"` : cdProjectName}`
    );
  }

  const actualTemplate = selectedTemplate.value;

  switch (actualTemplate) {
    case '101':
    case 'web':
      console.log(styles.command, `  ${pkgManager} install`);
      console.log(styles.command, `  ${pkgManager} run dev`);
      break;
    case 'contract':
      console.log(styles.command, `  ${pkgManager} install`);
      break;
    case 'cocos':
      console.log(styles.command, `  import project by cocos create ide`);
      console.log(styles.command, `  ${pkgManager} install`);
      console.log(styles.command, `  ${pkgManager} run dev`);
      console.log(styles.command, `  start your cocos project`);
      break;
  }

  console.log(styles.separator, '\n' + '='.repeat(60) + '\n');
};

function copy(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);
    copy(srcFile, destFile);
  }
}

function pkgFromUserAgent(userAgent: string | undefined) {
  if (!userAgent) return undefined;
  const pkgSpec = userAgent.split(' ')[0];
  const pkgSpecArr = pkgSpec.split('/');
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1]
  };
}

init().catch((e) => {
  console.error(e);
});
