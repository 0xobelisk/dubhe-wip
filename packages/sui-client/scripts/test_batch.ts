import {
  Dubhe,
  NetworkType,
  TransactionArgument,
  loadMetadata,
  Transaction,
  DevInspectResults,
  bcs,
} from '../src/index';
import dotenv from 'dotenv';
import { createDubheGraphqlClient } from '../src/libs/dubheGraphqlClient';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config();

// 工具函数：将数字转换为64位字符串格式（不转换进制，直接补0）
function toHex64String(num: number): string {
  // 将数字转换为字符串，然后补齐到64位（前面补0）
  const numStr = num.toString();
  const padded = numStr.padStart(64, '0');
  return `0x${padded}`;
}

// 延迟统计类
class LatencyStats {
  private durations: number[] = []; // 30秒周期的数据
  private mediumTermDurations: number[] = []; // 10分钟周期的数据
  private longTermDurations: number[] = []; // 30分钟周期的数据
  private totalTransactions: number = 0;
  private startTime: number;
  private logFilePath: string;

  constructor() {
    this.startTime = Date.now();

    // 创建logs目录
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // 创建日志文件路径，使用时间戳作为文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFilePath = path.join(logsDir, `latency-stats-${timestamp}.log`);

    // 写入初始日志头部
    this.writeLogHeader();
  }

  private writeLogHeader() {
    const header = `
========================================
多层级延迟统计日志文件
开始时间: ${new Date(this.startTime).toLocaleString()}
统计层级: 30秒(小) | 10分钟(中) | 30分钟(大)
========================================

`;
    fs.writeFileSync(this.logFilePath, header);
  }

  addDuration(duration: number) {
    this.durations.push(duration);
    this.mediumTermDurations.push(duration);
    this.longTermDurations.push(duration);
    this.totalTransactions++;
  }

  private calculateStats(durations: number[]) {
    if (durations.length === 0) {
      return {
        count: 0,
        avgLatency: 0,
        minLatency: 0,
        maxLatency: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);

    // 计算百分位数
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    const p95 = sorted[p95Index] || 0;
    const p99 = sorted[p99Index] || 0;

    return {
      count: durations.length,
      avgLatency: avg,
      minLatency: min,
      maxLatency: max,
      p95,
      p99,
    };
  }

  getStats(type: 'short' | 'medium' | 'long' = 'short') {
    let durations;
    switch (type) {
      case 'medium':
        durations = this.mediumTermDurations;
        break;
      case 'long':
        durations = this.longTermDurations;
        break;
      default:
        durations = this.durations;
    }

    const stats = this.calculateStats(durations);
    return {
      ...stats,
      totalTransactions: this.totalTransactions,
      uptime: Date.now() - this.startTime,
    };
  }

  resetShort() {
    this.durations = [];
  }

  resetMedium() {
    this.mediumTermDurations = [];
  }

  resetLong() {
    this.longTermDurations = [];
  }

  private writeToLog(
    stats: any,
    type: 'small' | 'medium' | 'large',
    duration: string
  ) {
    const timestamp = new Date().toLocaleString();
    const uptimeMinutes = (stats.uptime / 1000 / 60).toFixed(2);

    const typeEmojis = {
      small: '🔹',
      medium: '🔸',
      large: '🔶',
    };

    const typeNames = {
      small: '小统计(30秒)',
      medium: '中统计(10分钟)',
      large: '大统计(30分钟)',
    };

    let logEntry = `\n${typeEmojis[type]} [${timestamp}] ${typeNames[type]} - ${duration}:\n`;
    logEntry += `运行时间: ${uptimeMinutes} 分钟\n`;
    logEntry += `总交易数: ${stats.totalTransactions}\n`;
    logEntry += `本周期样本数: ${stats.count}\n`;

    if (stats.count > 0) {
      logEntry += `平均延迟: ${stats.avgLatency.toFixed(2)}ms (${(stats.avgLatency / 1000).toFixed(2)}秒)\n`;
      logEntry += `最小延迟: ${stats.minLatency}ms (${(stats.minLatency / 1000).toFixed(2)}秒)\n`;
      logEntry += `最大延迟: ${stats.maxLatency}ms (${(stats.maxLatency / 1000).toFixed(2)}秒)\n`;
      logEntry += `P95延迟: ${stats.p95}ms (${(stats.p95 / 1000).toFixed(2)}秒)\n`;
      logEntry += `P99延迟: ${stats.p99}ms (${(stats.p99 / 1000).toFixed(2)}秒)\n`;

      const periodSeconds =
        type === 'small' ? 30 : type === 'medium' ? 600 : 1800;
      const tps = stats.count / periodSeconds;
      logEntry += `TPS: ${tps.toFixed(2)}\n`;
    } else {
      logEntry += `本周期内没有完成的交易\n`;
    }
    logEntry += `${'-'.repeat(50)}\n`;

    // 追加写入日志文件
    fs.appendFileSync(this.logFilePath, logEntry);
  }

  printShortStats() {
    const stats = this.getStats('short');
    const uptimeMinutes = (stats.uptime / 1000 / 60).toFixed(2);

    console.log('\n🔹 =============== 小统计报告 (30秒) ===============');
    console.log(`🕐 运行时间: ${uptimeMinutes} 分钟`);
    console.log(`📈 总交易数: ${stats.totalTransactions}`);
    console.log(`📋 本周期样本数: ${stats.count}`);

    if (stats.count > 0) {
      console.log(
        `⚡ 平均延迟: ${stats.avgLatency.toFixed(2)}ms (${(stats.avgLatency / 1000).toFixed(2)}秒)`
      );
      console.log(
        `🚀 最小延迟: ${stats.minLatency}ms (${(stats.minLatency / 1000).toFixed(2)}秒)`
      );
      console.log(
        `🐌 最大延迟: ${stats.maxLatency}ms (${(stats.maxLatency / 1000).toFixed(2)}秒)`
      );
      console.log(
        `📊 P95延迟: ${stats.p95}ms (${(stats.p95 / 1000).toFixed(2)}秒)`
      );
      console.log(
        `📊 P99延迟: ${stats.p99}ms (${(stats.p99 / 1000).toFixed(2)}秒)`
      );

      const tps = stats.count / 30;
      console.log(`⚡ TPS: ${tps.toFixed(2)}`);
    } else {
      console.log('❌ 本周期内没有完成的交易');
    }
    console.log('=================================================\n');

    this.writeToLog(stats, 'small', '30秒周期');
  }

  printMediumStats() {
    const stats = this.getStats('medium');
    const uptimeMinutes = (stats.uptime / 1000 / 60).toFixed(2);

    console.log('\n🔸 =============== 中统计报告 (10分钟) ===============');
    console.log(`🕐 运行时间: ${uptimeMinutes} 分钟`);
    console.log(`📈 总交易数: ${stats.totalTransactions}`);
    console.log(`📋 10分钟样本数: ${stats.count}`);

    if (stats.count > 0) {
      console.log(
        `⚡ 平均延迟: ${stats.avgLatency.toFixed(2)}ms (${(stats.avgLatency / 1000).toFixed(2)}秒)`
      );
      console.log(
        `🚀 最小延迟: ${stats.minLatency}ms (${(stats.minLatency / 1000).toFixed(2)}秒)`
      );
      console.log(
        `🐌 最大延迟: ${stats.maxLatency}ms (${(stats.maxLatency / 1000).toFixed(2)}秒)`
      );
      console.log(
        `📊 P95延迟: ${stats.p95}ms (${(stats.p95 / 1000).toFixed(2)}秒)`
      );
      console.log(
        `📊 P99延迟: ${stats.p99}ms (${(stats.p99 / 1000).toFixed(2)}秒)`
      );

      const tps = stats.count / 600; // 10分钟 = 600秒
      console.log(`⚡ 平均TPS: ${tps.toFixed(2)}`);
    } else {
      console.log('❌ 10分钟内没有完成的交易');
    }
    console.log('===================================================\n');

    this.writeToLog(stats, 'medium', '10分钟周期');
  }

  printLongStats() {
    const stats = this.getStats('long');
    const uptimeMinutes = (stats.uptime / 1000 / 60).toFixed(2);

    console.log('\n🔶 =============== 大统计报告 (30分钟) ===============');
    console.log(`🕐 运行时间: ${uptimeMinutes} 分钟`);
    console.log(`📈 总交易数: ${stats.totalTransactions}`);
    console.log(`📋 30分钟样本数: ${stats.count}`);

    if (stats.count > 0) {
      console.log(
        `⚡ 平均延迟: ${stats.avgLatency.toFixed(2)}ms (${(stats.avgLatency / 1000).toFixed(2)}秒)`
      );
      console.log(
        `🚀 最小延迟: ${stats.minLatency}ms (${(stats.minLatency / 1000).toFixed(2)}秒)`
      );
      console.log(
        `🐌 最大延迟: ${stats.maxLatency}ms (${(stats.maxLatency / 1000).toFixed(2)}秒)`
      );
      console.log(
        `📊 P95延迟: ${stats.p95}ms (${(stats.p95 / 1000).toFixed(2)}秒)`
      );
      console.log(
        `📊 P99延迟: ${stats.p99}ms (${(stats.p99 / 1000).toFixed(2)}秒)`
      );

      const tps = stats.count / 1800; // 30分钟 = 1800秒
      console.log(`⚡ 平均TPS: ${tps.toFixed(2)}`);
    } else {
      console.log('❌ 30分钟内没有完成的交易');
    }
    console.log('====================================================\n');

    this.writeToLog(stats, 'large', '30分钟周期');
  }

  // 程序退出时写入最终统计
  writeFinalStats() {
    const stats = this.getStats('long');
    const timestamp = new Date().toLocaleString();
    const uptimeMinutes = (stats.uptime / 1000 / 60).toFixed(2);
    const uptimeHours = (stats.uptime / 1000 / 60 / 60).toFixed(2);

    let finalEntry = `\n${'='.repeat(60)}\n`;
    finalEntry += `[${timestamp}] 程序结束 - 最终统计报告:\n`;
    finalEntry += `总运行时间: ${uptimeMinutes} 分钟 (${uptimeHours} 小时)\n`;
    finalEntry += `总交易数: ${stats.totalTransactions}\n`;

    if (stats.totalTransactions > 0) {
      const totalTPS = stats.totalTransactions / (stats.uptime / 1000);
      finalEntry += `整体平均TPS: ${totalTPS.toFixed(2)}\n`;

      if (stats.count > 0) {
        finalEntry += `整体平均延迟: ${stats.avgLatency.toFixed(2)}ms\n`;
        finalEntry += `整体P95延迟: ${stats.p95}ms\n`;
        finalEntry += `整体P99延迟: ${stats.p99}ms\n`;
      }
    }

    finalEntry += `日志文件位置: ${this.logFilePath}\n`;
    finalEntry += `${'='.repeat(60)}\n`;

    fs.appendFileSync(this.logFilePath, finalEntry);
    console.log(`📄 完整日志已保存到: ${this.logFilePath}`);
  }
}

async function init() {
  const network = 'testnet';
  const packageId =
    '0x7c3dca4b87464f7e1900c50303a0e5eb02ca4f5f1d9bc742c75259e415a95e5f';

  const metadata = await loadMetadata(network as NetworkType, packageId);

  const privateKey = process.env.PRIVATE_KEY;

  const dubhe = new Dubhe({
    networkType: network as NetworkType,
    packageId: packageId,
    metadata: metadata,
    secretKey: privateKey,
  });

  console.log(dubhe.getAddress());
  // await dubhe.requestFaucet();
  let balance = await dubhe.getBalance();
  console.log('balance', balance);

  const CONFIG = {
    endpoint: 'http://localhost:4000/graphql',
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const client = createDubheGraphqlClient(CONFIG);

  // 创建延迟统计实例
  const latencyStats = new LatencyStats();

  // 设置30秒定时器来输出统计信息
  const statsInterval = setInterval(() => {
    latencyStats.printShortStats();
    latencyStats.resetShort(); // 重置统计数据，开始新的30秒周期
  }, 30000); // 30秒 = 30000毫秒

  // 设置10分钟定时器来输出中统计
  const mediumStatsInterval = setInterval(() => {
    latencyStats.printMediumStats();
    latencyStats.resetMedium(); // 重置10分钟数据
  }, 600000); // 10分钟 = 600000毫秒

  // 设置30分钟定时器来输出大统计
  const longStatsInterval = setInterval(() => {
    latencyStats.printLongStats();
    latencyStats.resetLong(); // 重置30分钟数据
  }, 1800000); // 30分钟 = 1800000毫秒

  // 打印多层级统计设置信息
  console.log('\n🚀 =============== 多层级统计系统已启动 ===============');
  console.log('📊 统计层级设置:');
  console.log('   🔹 小统计: 每30秒输出一次 (短期性能监控)');
  console.log('   🔸 中统计: 每10分钟输出一次 (中期趋势分析)');
  console.log('   🔶 大统计: 每30分钟输出一次 (长期性能评估)');
  console.log('📄 所有统计数据将自动保存到日志文件');
  console.log('⚠️  按 Ctrl+C 可安全退出并生成最终统计报告');
  console.log('=======================================================\n');

  // 添加进程退出时清理定时器
  process.on('SIGINT', () => {
    console.log('\n🛑 程序正在退出...');

    // 输出最后的统计信息
    latencyStats.printShortStats();
    latencyStats.printMediumStats();
    latencyStats.printLongStats();

    // 清理所有定时器
    clearInterval(statsInterval);
    clearInterval(mediumStatsInterval);
    clearInterval(longStatsInterval);

    latencyStats.writeFinalStats(); // 写入最终统计到日志文件
    process.exit(0);
  });

  let i = 0;
  while (true) {
    const tx = new Transaction();
    await dubhe.tx.dapp_system.hello_encounter({
      tx,
      params: [
        tx.object(
          '0x071886c22bc3726c4f29373825738a84c3c9de47a65adb3b242b31c9491a3f0f'
        ),
        tx.pure.address(`0x${i}`),
        tx.pure.bool(true),
        tx.pure.address('0x0'),
        tx.pure.u256(i),
      ],
      onSuccess: async (res) => {
        console.log('success', res.digest);

        // 开始计时
        const startTime = Date.now();
        const targetPlayer = toHex64String(i);
        console.log(`🔍 开始查询 player: ${targetPlayer}`);

        let record: any = null;
        let attempts = 0;

        // 重试查询直到找到记录
        while (!record) {
          attempts++;

          try {
            const singleRecord = await client.getAllTables('encounters', {
              first: 1,
              filter: {
                catchAttempts: { equalTo: i.toString() },
              },
              fields: ['player', 'monster', 'catchAttempts', 'exists'],
            });
            // console.log('singleRecord', singleRecord);

            record = singleRecord.edges[0]?.node || null;

            if (record) {
              // 计算总耗时
              const endTime = Date.now();
              const duration = endTime - startTime;

              // 添加到统计数据中
              latencyStats.addDuration(duration);

              console.log('✅ 成功查询到记录!');
              console.log(`📊 查询统计:`);
              console.log(`   - 尝试次数: ${attempts}`);
              console.log(
                `   - 总耗时: ${duration}ms (${(duration / 1000).toFixed(2)}秒)`
              );
              console.log(
                `   - 平均每次: ${(duration / attempts).toFixed(2)}ms`
              );
              console.log(`📋 记录内容:`);
              console.log(`   - Player: ${record.player}`);
              console.log(`   - Monster: ${record.monster}`);
              console.log(`   - Catch Attempts: ${record.catchAttempts}`);
              console.log(`   - Exists: ${record.exists}`);
            } else {
              // // 没找到记录，等待后重试
              // console.log(
              //   `⏳ 第${attempts}次查询未找到记录，等待indexer同步...`
              // );
              // await new Promise((resolve) => setTimeout(resolve, 50)); // 等待500ms后重试
            }
          } catch (error: any) {
            console.log(`❌ 第${attempts}次查询出错:`, error.message);
            // await new Promise((resolve) => setTimeout(resolve, 1000)); // 出错时等待1秒后重试
          }
        }

        i++;
      },
      onError: (err) => {
        console.log('error', err);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

init();
