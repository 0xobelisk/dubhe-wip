import { execSync, spawn } from 'child_process';
import chalk from 'chalk';
import { printDubhe } from './printDubhe';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

function isSuiStartRunning(): boolean {
  try {
    const cmd =
      process.platform === 'win32'
        ? `tasklist /FI "IMAGENAME eq sui.exe" /FO CSV /NH`
        : 'pgrep -f "sui start"';

    const result = execSync(cmd).toString().trim();
    return process.platform === 'win32'
      ? result.toLowerCase().includes('sui.exe')
      : result.length > 0;
  } catch (error) {
    return false;
  }
}

async function printAccounts() {
  // These private keys are used for testing purposes only, do not use them in production.
  const accounts = [
    { 
      privateKey: 'suiprivkey1qq3ez3dje66l8pypgxynr7yymwps6uhn7vyczespj84974j3zya0wdpu76v', 
      address: '0xe7f93ad7493035bcd674f287f78526091e195a6df9d64f23def61a7ce3adada9' 
    },
    { 
      privateKey: 'suiprivkey1qp6vcyg8r2x88fllmjmxtpzjl95gd9dugqrgz7xxf50w6rqdqzetg7x4d7s', 
      address: '0x492404a537c32b46610bd6ae9f7f16ba16ff5a607d272543fe86cada69d8cf44' 
    },
    { 
      privateKey: 'suiprivkey1qpy3a696eh3m55fwa8h38ss063459u4n2dm9t24w2hlxxzjp2x34q8sdsnc', 
      address: '0xd27e203483700d837a462d159ced6104619d8e36f737bf2a20c251153bf39f24' 
    },
    { 
      privateKey: 'suiprivkey1qzxwp29favhzrjd95f6uj9nskjwal6nh9g509jpun395y6g72d6jqlmps4c', 
      address: '0x018f1f175c9b6739a14bc9c81e7984c134ebf9031015cf796fefcef04b8c4990' 
    },
    { 
      privateKey: 'suiprivkey1qzhq4lv38sesah4uzsqkkmeyjx860xqjdz8qgw36tmrdd5tnle3evxpng57', 
      address: '0x932f6aab2bc636a25374f99794dc8451c4e27c91e87083e301816ed08bc98ed0' 
    },
    { 
      privateKey: 'suiprivkey1qzez45sjjsepjgtksqvpq6jw7dzw3zq0dx7a4sulfypd73acaynw5jl9x2c', 
      address: '0x9a66b2da3036badd22529e3de8a00b0cd7dbbfe589873aa03d5f885f5f8c6501' 
    }
  ];
  console.log('📝Accounts');
  console.log('==========');
  accounts.forEach((account, index) => {
    console.log(`  ┌─ Account #${index}: ${account.address}(100000 SUI)`);
    console.log(`  └─ Private Key: ${account.privateKey}`);
  });
  console.log('==========');
  console.log(
    chalk.yellow('ℹ️ WARNING: These accounts, and their private keys, are publicly known.')
  );
  console.log(
    chalk.yellow('Any funds sent to them on Mainnet or any other live network WILL BE LOST.')
  );
}

export async function startLocalNode(options: { forceRegenesis?: boolean } = {}) {
  if (isSuiStartRunning()) {
    console.log(chalk.yellow('\n⚠️  Warning: Local Node Already Running'));
    console.log(chalk.yellow('  ├─ Cannot start a new instance'));
    console.log(chalk.yellow('  └─ Please stop the existing process first'));
    return;
  }

  // 确保 node_logs 目录存在
  const nodeLogsDir = join(process.cwd(), 'node_logs');
  if (!existsSync(nodeLogsDir)) {
    console.log(chalk.yellow('  ├─ Creating node_logs directory...'));
    mkdirSync(nodeLogsDir, { recursive: true });
  }

  printDubhe();
  console.log('🚀 Starting Local Node...');
  let suiProcess: ReturnType<typeof spawn> | null = null;

  try {
    if (options.forceRegenesis) {
      console.log('  ├─ Force Regenesis: Yes');
      // 执行 genesis 命令
      execSync(`sui genesis --working-dir node_logs -f --from-config sui.yaml`);
    } else {
      console.log('  ├─ Force Regenesis: No');
    }
    
    console.log('  ├─ Faucet: Enabled');
    console.log('  └─ HTTP server: http://127.0.0.1:9000/');
    console.log('  └─ Faucet server: http://127.0.0.1:9123/');
    printAccounts();
    console.log(chalk.green('🎉 Local environment is ready!'));

    // 在前台启动 sui 节点，但不显示日志
    suiProcess = spawn('sui', ['start', '--with-faucet', '--network.config', 'node_logs/network.yaml'], {
      env: { ...process.env, RUST_LOG: 'off,sui_node=info' },
      stdio: 'ignore'  // 使用 ignore 隐藏日志输出
    });

    // 处理中断信号
    const handleSigInt = () => {
      console.log(chalk.yellow('\n🔔 Stopping Local Node...'));
      if (suiProcess) {
        suiProcess.kill('SIGINT');
      }
      process.exit(0);
    };

    process.on('SIGINT', handleSigInt);
    process.on('SIGTERM', handleSigInt);

    // 等待进程结束
    await new Promise<void>((resolve) => {
      suiProcess?.on('exit', () => resolve());
    });
  } catch (error: any) {
    console.error(chalk.red('\n❌ Failed to Start Local Node'));
    console.error(chalk.red(`  └─ Error: ${error.message}`));
    if (suiProcess) {
      suiProcess.kill('SIGINT');
    }
    process.exit(1);
  }
}
