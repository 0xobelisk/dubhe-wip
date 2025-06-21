import type { CommandModule } from 'yargs';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import Table from 'cli-table3';

// Check result type
interface CheckResult {
  name: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  fixSuggestion?: string;
}

// Execute shell command and return output
async function execCommand(
  command: string,
  args: string[] = []
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: true });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code: code || 0, stdout, stderr });
    });

    child.on('error', () => {
      resolve({ code: -1, stdout, stderr });
    });
  });
}

// Check if command is available in PATH
async function checkCommand(
  command: string,
  versionFlag: string = '--version'
): Promise<CheckResult> {
  try {
    const result = await execCommand(command, [versionFlag]);
    if (result.code === 0) {
      const version = result.stdout.trim().split('\n')[0];
      return {
        name: command,
        status: 'success',
        message: `Installed ${version}`
      };
    } else {
      return {
        name: command,
        status: 'error',
        message: 'Not installed',
        fixSuggestion: getInstallSuggestion(command)
      };
    }
  } catch (error) {
    return {
      name: command,
      status: 'error',
      message: 'Not installed',
      fixSuggestion: getInstallSuggestion(command)
    };
  }
}

// Get installation suggestions
function getInstallSuggestion(command: string): string {
  const suggestions: Record<string, string> = {
    docker: 'Visit https://docs.docker.com/get-docker/ to install Docker',
    'docker-compose': 'Visit https://docs.docker.com/compose/install/ to install Docker Compose',
    sui: 'Visit https://docs.sui.io/guides/developer/getting-started/sui-install to install Sui CLI',
    pnpm: 'Run: npm install -g pnpm',
    node: 'Visit https://nodejs.org/ to download and install Node.js',
    git: 'Visit https://git-scm.com/downloads to install Git'
  };

  return suggestions[command] || `Please install ${command}`;
}

// Check if file exists
function checkFileExists(filePath: string, description: string): CheckResult {
  const exists = existsSync(filePath);
  return {
    name: description,
    status: exists ? 'success' : 'warning',
    message: exists ? 'Available' : 'Not found',
    fixSuggestion: exists ? undefined : `Please create file: ${filePath}`
  };
}

// Check Node.js version
async function checkNodeVersion(): Promise<CheckResult> {
  try {
    const result = await execCommand('node', ['--version']);
    if (result.code === 0) {
      const version = result.stdout.trim();
      const versionNumber = parseFloat(version.replace('v', ''));

      if (versionNumber >= 18) {
        return {
          name: 'Node.js version',
          status: 'success',
          message: `${version} (meets requirement >=18.0)`
        };
      } else {
        return {
          name: 'Node.js version',
          status: 'warning',
          message: `${version} (recommend upgrade to >=18.0)`,
          fixSuggestion: 'Please upgrade Node.js to 18.0 or higher'
        };
      }
    } else {
      return {
        name: 'Node.js version',
        status: 'error',
        message: 'Not installed',
        fixSuggestion: 'Please install Node.js 18.0 or higher'
      };
    }
  } catch (error) {
    return {
      name: 'Node.js version',
      status: 'error',
      message: 'Check failed',
      fixSuggestion: 'Please install Node.js'
    };
  }
}

// Check Docker service status
async function checkDockerService(): Promise<CheckResult> {
  try {
    const result = await execCommand('docker', ['info']);
    if (result.code === 0) {
      return {
        name: 'Docker service',
        status: 'success',
        message: 'Running'
      };
    } else {
      return {
        name: 'Docker service',
        status: 'warning',
        message: 'Not running',
        fixSuggestion: 'Please start Docker service'
      };
    }
  } catch (error) {
    return {
      name: 'Docker service',
      status: 'error',
      message: 'Check failed',
      fixSuggestion: 'Please install and start Docker'
    };
  }
}

// Check NPM configuration
async function checkNpmConfig(): Promise<CheckResult> {
  try {
    const result = await execCommand('npm', ['config', 'get', 'registry']);
    if (result.code === 0) {
      const registry = result.stdout.trim();
      return {
        name: 'NPM configuration',
        status: 'success',
        message: `Configured (${registry})`
      };
    } else {
      return {
        name: 'NPM configuration',
        status: 'warning',
        message: 'Configuration issue',
        fixSuggestion: 'Check NPM config: npm config list'
      };
    }
  } catch (error) {
    return {
      name: 'NPM configuration',
      status: 'warning',
      message: 'Check failed',
      fixSuggestion: 'Please install Node.js and NPM'
    };
  }
}

// Create table row data
function formatTableRow(result: CheckResult): string[] {
  const statusIcon = {
    success: chalk.green('✓'),
    warning: chalk.yellow('!'),
    error: chalk.red('✗')
  };

  const statusText = {
    success: chalk.green('YES'),
    warning: chalk.yellow('WARN'),
    error: chalk.red('NO')
  };

  // Decide what content to display based on status
  let fixContent = '';
  if (result.status === 'success') {
    fixContent = result.message;
  } else {
    fixContent = result.fixSuggestion || result.message;
  }

  return [result.name, `${statusIcon[result.status]} ${statusText[result.status]}`, fixContent];
}

// Main check function
async function runDoctorChecks() {
  console.log(chalk.bold.blue('\n🔍 Dubhe Doctor - Environment Check Tool\n'));
  console.log(chalk.gray('Checking your development environment...\n'));

  const results: CheckResult[] = [];

  // Execute all checks
  console.log('Running checks...\n');

  // Required tools check
  const nodeCheck = await checkNodeVersion();
  results.push(nodeCheck);

  const pnpmCheck = await checkCommand('pnpm');
  results.push(pnpmCheck);

  const gitCheck = await checkCommand('git');
  results.push(gitCheck);

  // Package manager configuration check
  const npmConfigCheck = await checkNpmConfig();
  // Treat npm config as optional, don't affect overall status
  if (npmConfigCheck.status === 'error') {
    npmConfigCheck.status = 'warning';
  }
  results.push(npmConfigCheck);

  // Docker related checks
  const dockerCheck = await checkCommand('docker');
  results.push(dockerCheck);

  let dockerServiceCheck: CheckResult | null = null;
  if (dockerCheck.status === 'success') {
    dockerServiceCheck = await checkDockerService();
    results.push(dockerServiceCheck);
  }

  const dockerComposeCheck = await checkCommand('docker-compose');
  results.push(dockerComposeCheck);

  // Sui CLI check
  const suiCheck = await checkCommand('sui');
  results.push(suiCheck);

  // Configuration files check
  const gitConfigCheck = checkFileExists(join(homedir(), '.gitconfig'), 'Git configuration');
  results.push(gitConfigCheck);

  // Create and display table
  const table = new Table({
    head: [chalk.bold.cyan('Criteria'), chalk.bold.cyan('Result'), chalk.bold.cyan('Fix')],
    colWidths: [25, 15, 50],
    style: {
      head: ['cyan'],
      border: ['grey']
    },
    wordWrap: true
  });

  // Add table rows
  results.forEach((result) => {
    table.push(formatTableRow(result));
  });

  console.log(table.toString());

  // Summarize results
  const summary = {
    success: results.filter((r) => r.status === 'success').length,
    warning: results.filter((r) => r.status === 'warning').length,
    error: results.filter((r) => r.status === 'error').length
  };

  console.log('\n' + chalk.bold('📊 Check Summary:'));
  console.log(`   ${chalk.green('✓ Passed:')} ${summary.success} items`);
  console.log(`   ${chalk.yellow('! Warning:')} ${summary.warning} items`);
  console.log(`   ${chalk.red('✗ Error:')} ${summary.error} items`);

  if (summary.error > 0) {
    console.log(
      chalk.red(
        '\n❌ Your environment has some issues, please fix them according to the suggestions above.'
      )
    );
    process.exit(1);
  } else if (summary.warning > 0) {
    console.log(
      chalk.yellow(
        '\n⚠️  Your environment is basically ready, but it is recommended to fix warning items for a better development experience.'
      )
    );
  } else {
    console.log(chalk.green('\n✅ Congratulations! Your development environment is fully ready!'));
  }

  console.log(
    chalk.gray(
      '\n💡 Tip: For more help, visit https://docs.sui.io/ or https://github.com/0xobelisk/dubhe'
    )
  );
}

const commandModule: CommandModule = {
  command: 'doctor',
  describe: 'Check if local development environment is ready',
  builder(yargs) {
    return yargs.option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Show verbose output',
      default: false
    });
  },
  async handler() {
    try {
      await runDoctorChecks();
    } catch (error) {
      console.error(chalk.red('Error occurred during check:'), error);
      process.exit(1);
    }
  }
};

export default commandModule;
