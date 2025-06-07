import {
  Dubhe,
  NetworkType,
  TransactionArgument,
  loadMetadata,
  Transaction,
  DevInspectResults,
  bcs,
} from '../src/index';
import { gql } from '@apollo/client';
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
多层级延迟统计日志文件 (分阶段统计)
开始时间: ${new Date(this.startTime).toLocaleString()}
统计层级: 30秒(小) | 10分钟(中) | 30分钟(大)
时间阶段: 交易阶段 | 索引阶段 | 总延迟
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
    subscriptionEndpoint: 'ws://localhost:4000/graphql',
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
  console.log('📊 新增功能: 分阶段时间记录 (交易阶段 + 索引阶段)');
  console.log('⚠️  按 Ctrl+C 可安全退出并生成最终统计报告');
  console.log('=======================================================\n');

  // 创建subscription来监听数据变化
  const LISTEN_SUBSCRIPTION = gql`
    subscription {
      listen(topic: "store_encounter") {
        query {
          encounters(first: 1, orderBy: UPDATED_AT_DESC) {
            totalCount
            nodes {
              player
              createdAt
              updatedAt
              monster
              catchAttempts
            }
          }
        }
      }
    }
  `;

  console.log('🔔 开始监听 store_encounter 事件...');

  // 用于存储等待匹配的交易（包含分阶段时间信息）
  const pendingTransactions = new Map<
    number,
    {
      startTime: number;
      txSubmitTime?: number;
    }
  >();

  // 订阅数据变化
  const subscription = client.subscribe(
    LISTEN_SUBSCRIPTION,
    {},
    {
      onData: (data) => {
        console.log('📨 收到subscription数据:', JSON.stringify(data, null, 2));

        if (data?.listen?.query?.encounters?.nodes) {
          const encounters = data.listen.query.encounters.nodes;

          encounters.forEach((encounter: any) => {
            const catchAttempts = parseInt(encounter.catchAttempts);
            const txInfo = pendingTransactions.get(catchAttempts);

            if (txInfo) {
              // 计算各阶段延迟
              const endTime = Date.now();
              const totalDuration = endTime - txInfo.startTime;
              const txDuration = txInfo.txSubmitTime
                ? txInfo.txSubmitTime - txInfo.startTime
                : 0;
              const indexDuration = txInfo.txSubmitTime
                ? endTime - txInfo.txSubmitTime
                : totalDuration;

              // 添加总延迟到统计数据中（保持原有统计功能）
              latencyStats.addDuration(totalDuration);

              console.log('✅ 匹配到交易记录!');
              console.log(`📊 分阶段时间统计:`);
              console.log(`   - Catch Attempts: ${catchAttempts}`);
              console.log(
                `   - 🕐 总耗时: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}秒)`
              );
              console.log(
                `   - 🔄 交易阶段: ${txDuration}ms (${(txDuration / 1000).toFixed(2)}秒)`
              );
              console.log(
                `   - 🔍 索引阶段: ${indexDuration}ms (${(indexDuration / 1000).toFixed(2)}秒)`
              );

              // 计算阶段占比
              const txPercentage =
                totalDuration > 0
                  ? ((txDuration / totalDuration) * 100).toFixed(1)
                  : '0.0';
              const indexPercentage =
                totalDuration > 0
                  ? ((indexDuration / totalDuration) * 100).toFixed(1)
                  : '0.0';
              console.log(
                `   - 📈 阶段占比: 交易${txPercentage}% | 索引${indexPercentage}%`
              );

              console.log(`📋 记录内容:`);
              console.log(`   - Player: ${encounter.player}`);
              console.log(`   - Monster: ${encounter.monster}`);
              console.log(`   - Catch Attempts: ${encounter.catchAttempts}`);
              console.log(`   - Created At: ${encounter.createdAt}`);
              console.log(`   - Updated At: ${encounter.updatedAt}`);

              // 移除已匹配的交易
              pendingTransactions.delete(catchAttempts);
            }
          });
        }
      },
      onError: (error) => {
        console.error('❌ Subscription错误:', error);
      },
      onComplete: () => {
        console.log('🏁 Subscription完成');
      },
    }
  );

  // 开始订阅
  const subscriptionObserver = subscription.subscribe({
    next: (result: any) => {
      // console.log('📡 Subscription结果:', result);
    },
    error: (error: any) => {
      console.error('❌ Subscription流错误:', error);
    },
  });

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

    // 取消订阅
    subscriptionObserver.unsubscribe();
    client.close();

    latencyStats.writeFinalStats(); // 写入最终统计到日志文件
    process.exit(0);
  });

  let i = 0;
  while (true) {
    const tx = new Transaction();

    // 记录交易开始时间
    const startTime = Date.now();
    pendingTransactions.set(i, { startTime });

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
        // 记录交易提交完成时间
        const txSubmitTime = Date.now();
        const txInfo = pendingTransactions.get(i);
        if (txInfo) {
          txInfo.txSubmitTime = txSubmitTime;
          pendingTransactions.set(i, txInfo);
        }
        console.log('🎯 交易成功提交:', res.digest, '等待 catchAttempts:', i);
      },
      onError: (err) => {
        console.log('❌ 交易失败:', err);
        // 移除失败的交易
        pendingTransactions.delete(i);
      },
    });

    i++;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

init();
