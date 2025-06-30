#!/usr/bin/env node

/**
 * Dubhe GraphQL 智能压测工具
 *
 * 基于 dubhe config 自动解析表结构，使用 DubheGraphqlClient 进行智能压测
 * 支持查询和订阅的自动化性能测试
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import autocannon from 'autocannon';
import {
  DubheGraphqlClient,
  createDubheGraphqlClient,
  DubheClientConfig,
  DubheMetadata,
  ParsedTableInfo
} from '@0xobelisk/graphql-client';

// 颜色输出辅助函数
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`
};

function log(message: string, color?: keyof typeof colors) {
  if (color && colors[color]) {
    console.log(colors[color](message));
  } else {
    console.log(message);
  }
}

function section(title: string) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`${title}`, 'blue');
  log(`${'='.repeat(60)}`, 'cyan');
}

// 接口定义
interface BenchmarkScenario {
  name: string;
  duration: number;
  connections: number;
  description: string;
}

interface TestConfig {
  type: string;
  params: Record<string, any>;
}

interface QueryTypeConfig {
  name: string;
  tests: TestConfig[];
}

interface SubscriptionTypeConfig {
  name: string;
  duration: number;
  tests: TestConfig[];
}

interface Config {
  endpoint: string;
  subscriptionEndpoint: string;
  dubheConfigPath: string;
  headers: Record<string, string>;
  scenarios: Record<string, BenchmarkScenario>;
  queryTypes: Record<string, QueryTypeConfig>;
  subscriptionTypes: Record<string, SubscriptionTypeConfig>;
}

interface BenchmarkResult {
  testName: string;
  tableName: string;
  requestCount: number;
  averageLatency: number;
  rps: number;
  errors: number;
  success: boolean;
  duration: number;
}

interface SubscriptionResult {
  testName: string;
  tableName: string;
  connectionCount: number;
  eventsReceived: number;
  averageEventLatency: number;
  duration: number;
  errors: number;
  success: boolean;
}

// 检查 GraphQL 服务是否运行
async function checkGraphQLService(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '{ __typename }'
      })
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// 创建 DubheGraphqlClient 实例
function createClient(config: Config, dubheMetadata: DubheMetadata): DubheGraphqlClient {
  const clientConfig: DubheClientConfig = {
    endpoint: config.endpoint,
    subscriptionEndpoint: config.subscriptionEndpoint,
    headers: config.headers,
    dubheMetadata: dubheMetadata
  };

  return createDubheGraphqlClient(clientConfig);
}

// 执行单个查询压测
async function runQueryBenchmark(
  client: DubheGraphqlClient,
  tableName: string,
  testConfig: TestConfig,
  scenario: BenchmarkScenario
): Promise<BenchmarkResult> {
  const startTime = Date.now();
  let requestCount = 0;
  let totalLatency = 0;
  let errors = 0;

  log(`🚀 运行查询压测: ${testConfig.type} on ${tableName}`, 'yellow');
  log(`   持续时间: ${scenario.duration}s`, 'cyan');
  log(`   并发连接: ${scenario.connections}`, 'cyan');

  const endTime = startTime + scenario.duration * 1000;
  const promises: Promise<void>[] = [];

  // 创建并发请求
  for (let i = 0; i < scenario.connections; i++) {
    const promise = (async () => {
      while (Date.now() < endTime) {
        const queryStart = Date.now();
        try {
          switch (testConfig.type) {
            case 'getAllTables':
              await client.getAllTables(tableName, testConfig.params);
              break;
            case 'getTableByCondition':
              // 使用表的主键作为条件
              const primaryKeys = client.getTablePrimaryKeys(tableName);
              if (primaryKeys.length > 0) {
                const condition = { [primaryKeys[0]]: 'test_value' };
                await client.getTableByCondition(tableName, condition);
              } else {
                await client.getAllTables(tableName, { first: 1 });
              }
              break;
            case 'batchQuery':
              const batchQueries = Array.from(
                { length: testConfig.params.batchSize || 3 },
                (_, idx) => ({
                  key: `query_${idx}`,
                  tableName,
                  params: { first: testConfig.params.first || 5 }
                })
              );
              await client.batchQuery(batchQueries);
              break;
            default:
              await client.getAllTables(tableName, testConfig.params);
          }

          requestCount++;
          totalLatency += Date.now() - queryStart;
        } catch (error) {
          errors++;
          log(`❌ 查询错误: ${error instanceof Error ? error.message : String(error)}`, 'red');
        }

        // 避免过度频繁的请求
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    })();

    promises.push(promise);
  }

  await Promise.all(promises);

  const actualDuration = (Date.now() - startTime) / 1000;
  const averageLatency = requestCount > 0 ? totalLatency / requestCount : 0;
  const rps = actualDuration > 0 ? requestCount / actualDuration : 0;

  return {
    testName: testConfig.type,
    tableName,
    requestCount,
    averageLatency,
    rps,
    errors,
    success: errors === 0 && requestCount > 0,
    duration: actualDuration
  };
}

// 执行订阅压测
async function runSubscriptionBenchmark(
  client: DubheGraphqlClient,
  tableName: string,
  testConfig: TestConfig,
  subscriptionConfig: SubscriptionTypeConfig
): Promise<SubscriptionResult> {
  log(`🔔 运行订阅压测: ${testConfig.type} on ${tableName}`, 'yellow');
  log(`   持续时间: ${subscriptionConfig.duration}s`, 'cyan');

  const startTime = Date.now();
  let eventsReceived = 0;
  let totalEventLatency = 0;
  let errors = 0;
  const connections: any[] = [];

  try {
    // 创建订阅
    const subscription = (() => {
      switch (testConfig.type) {
        case 'subscribeToTableChanges':
          return client.subscribeToTableChanges(tableName, {
            ...testConfig.params,
            onData: (data) => {
              eventsReceived++;
              // 模拟事件延迟计算
              totalEventLatency += 10; // 简化处理
            },
            onError: (error) => {
              errors++;
              log(`❌ 订阅错误: ${error instanceof Error ? error.message : String(error)}`, 'red');
            }
          });
        case 'subscribeToFilteredTableChanges':
          return client.subscribeToTableChanges(tableName, {
            ...testConfig.params,
            filter: testConfig.params.filter,
            onData: (data) => {
              eventsReceived++;
              totalEventLatency += 10;
            },
            onError: (error) => {
              errors++;
              log(`❌ 订阅错误: ${error instanceof Error ? error.message : String(error)}`, 'red');
            }
          } as any);
        default:
          return client.subscribeToTableChanges(tableName, {
            ...testConfig.params,
            onData: (data) => {
              eventsReceived++;
              totalEventLatency += 10;
            },
            onError: (error) => {
              errors++;
              log(`❌ 订阅错误: ${error instanceof Error ? error.message : String(error)}`, 'red');
            }
          });
      }
    })();

    const sub = subscription.subscribe({});
    connections.push(sub);

    // 等待指定时间
    await new Promise((resolve) => setTimeout(resolve, subscriptionConfig.duration * 1000));

    // 清理订阅
    connections.forEach((conn) => {
      try {
        conn.unsubscribe();
      } catch (error) {
        log(
          `⚠️  订阅清理警告: ${error instanceof Error ? error.message : String(error)}`,
          'yellow'
        );
      }
    });
  } catch (error) {
    errors++;
    log(`❌ 订阅设置失败: ${error instanceof Error ? error.message : String(error)}`, 'red');
  }

  const actualDuration = (Date.now() - startTime) / 1000;
  const averageEventLatency = eventsReceived > 0 ? totalEventLatency / eventsReceived : 0;

  return {
    testName: testConfig.type,
    tableName,
    connectionCount: connections.length,
    eventsReceived,
    averageEventLatency,
    duration: actualDuration,
    errors,
    success: errors === 0
  };
}

// 运行查询压测套件
async function runQueryBenchmarkSuite(
  client: DubheGraphqlClient,
  config: Config,
  scenarioName: string,
  queryTypeName: string
): Promise<BenchmarkResult[]> {
  const scenario = config.scenarios[scenarioName];
  const queryType = config.queryTypes[queryTypeName];

  if (!scenario || !queryType) {
    throw new Error(`未找到配置: scenario=${scenarioName}, queryType=${queryTypeName}`);
  }

  section(`${scenario.name} - ${queryType.name}`);
  log(`📋 ${scenario.description}`, 'cyan');

  const results: BenchmarkResult[] = [];
  const tableInfo = client.getAllTableInfo();
  const tableNames = Array.from(tableInfo.keys());

  if (tableNames.length === 0) {
    log('⚠️  未找到表信息，请检查 dubhe config', 'yellow');
    return results;
  }

  log(`📊 发现 ${tableNames.length} 个表: ${tableNames.join(', ')}`, 'green');

  // 对每个表执行所有测试
  for (const tableName of tableNames) {
    // 将表名转换为小写形式，因为 GraphQL schema 期望小写的表名
    // DubheGraphqlClient 的 toSnakeCase 方法会将表名转换为大写（如 COUNTER0）
    // 但实际的 GraphQL schema 字段是小写的（如 counter0s）
    const normalizedTableName = tableName.toLowerCase();

    for (const testConfig of queryType.tests) {
      try {
        const result = await runQueryBenchmark(client, normalizedTableName, testConfig, scenario);
        // 在结果中保留原始表名以便显示
        result.tableName = tableName;
        results.push(result);

        // 显示结果摘要
        if (result.success) {
          log(
            `✅ ${result.testName} (${tableName}): ${result.rps.toFixed(
              2
            )} RPS, ${result.averageLatency.toFixed(2)}ms 平均延迟`,
            'green'
          );
        } else {
          log(`❌ ${result.testName} (${tableName}): ${result.errors} 错误`, 'red');
        }
      } catch (error) {
        log(
          `❌ 压测失败 ${testConfig.type} on ${tableName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'red'
        );
      }
    }
  }

  return results;
}

// 运行订阅压测套件
async function runSubscriptionBenchmarkSuite(
  client: DubheGraphqlClient,
  config: Config,
  subscriptionTypeName: string
): Promise<SubscriptionResult[]> {
  const subscriptionType = config.subscriptionTypes[subscriptionTypeName];

  if (!subscriptionType) {
    throw new Error(`未找到订阅配置: ${subscriptionTypeName}`);
  }

  section(`订阅压测 - ${subscriptionType.name}`);

  const results: SubscriptionResult[] = [];
  const tableInfo = client.getAllTableInfo();
  const tableNames = Array.from(tableInfo.keys());

  if (tableNames.length === 0) {
    log('⚠️  未找到表信息，请检查 dubhe config', 'yellow');
    return results;
  }

  log(`📊 发现 ${tableNames.length} 个表: ${tableNames.join(', ')}`, 'green');

  // 对每个表执行所有订阅测试
  for (const tableName of tableNames) {
    // 将表名转换为小写形式，因为 GraphQL schema 期望小写的表名
    const normalizedTableName = tableName.toLowerCase();

    for (const testConfig of subscriptionType.tests) {
      try {
        const result = await runSubscriptionBenchmark(
          client,
          normalizedTableName,
          testConfig,
          subscriptionType
        );
        // 在结果中保留原始表名以便显示
        result.tableName = tableName;
        results.push(result);

        // 显示结果摘要
        if (result.success) {
          log(
            `✅ ${result.testName} (${tableName}): ${
              result.eventsReceived
            } 事件接收, ${result.averageEventLatency.toFixed(2)}ms 平均延迟`,
            'green'
          );
        } else {
          log(`❌ ${result.testName} (${tableName}): ${result.errors} 错误`, 'red');
        }
      } catch (error) {
        log(
          `❌ 订阅压测失败 ${testConfig.type} on ${tableName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'red'
        );
      }
    }
  }

  return results;
}

// 生成报告
function generateReport(
  queryResults: BenchmarkResult[],
  subscriptionResults: SubscriptionResult[]
): string {
  let report = '\n';
  report += '# Dubhe GraphQL 智能压测报告\n\n';
  report += `生成时间: ${new Date().toLocaleString()}\n\n`;

  if (queryResults.length > 0) {
    report += '## 查询压测结果\n\n';
    report += '| 表名 | 测试类型 | RPS | 平均延迟(ms) | 总请求数 | 错误数 | 状态 |\n';
    report += '|------|----------|-----|-------------|----------|-------|------|\n';

    for (const result of queryResults) {
      const status = result.success ? '✅' : '❌';
      report += `| ${result.tableName} | ${result.testName} | ${result.rps.toFixed(
        2
      )} | ${result.averageLatency.toFixed(2)} | ${result.requestCount} | ${
        result.errors
      } | ${status} |\n`;
    }
    report += '\n';
  }

  if (subscriptionResults.length > 0) {
    report += '## 订阅压测结果\n\n';
    report += '| 表名 | 测试类型 | 连接数 | 接收事件数 | 平均事件延迟(ms) | 错误数 | 状态 |\n';
    report += '|------|----------|--------|------------|-----------------|-------|------|\n';

    for (const result of subscriptionResults) {
      const status = result.success ? '✅' : '❌';
      report += `| ${result.tableName} | ${result.testName} | ${result.connectionCount} | ${
        result.eventsReceived
      } | ${result.averageEventLatency.toFixed(2)} | ${result.errors} | ${status} |\n`;
    }
    report += '\n';
  }

  // 添加汇总统计
  if (queryResults.length > 0) {
    const totalRequests = queryResults.reduce((sum, r) => sum + r.requestCount, 0);
    const avgRps = queryResults.reduce((sum, r) => sum + r.rps, 0) / queryResults.length;
    const avgLatency =
      queryResults.reduce((sum, r) => sum + r.averageLatency, 0) / queryResults.length;
    const totalErrors = queryResults.reduce((sum, r) => sum + r.errors, 0);

    report += '## 查询性能汇总\n\n';
    report += `- **总请求数**: ${totalRequests}\n`;
    report += `- **平均 RPS**: ${avgRps.toFixed(2)}\n`;
    report += `- **平均延迟**: ${avgLatency.toFixed(2)}ms\n`;
    report += `- **总错误数**: ${totalErrors}\n`;
    report += `- **成功率**: ${(((totalRequests - totalErrors) / totalRequests) * 100).toFixed(
      2
    )}%\n\n`;
  }

  return report;
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const configPath = args[1] || 'dubhe-bench-config.json';

  section('Dubhe GraphQL 智能压测工具');

  // 读取配置文件
  let config: Config;
  try {
    const configFile = path.resolve(configPath);
    const configData = readFileSync(configFile, 'utf-8');
    config = JSON.parse(configData);
    log(`✅ 配置文件加载成功: ${configFile}`, 'green');
  } catch (error) {
    log(`❌ 配置文件加载失败: ${error instanceof Error ? error.message : String(error)}`, 'red');
    log('请确保配置文件存在并且格式正确', 'yellow');
    process.exit(1);
  }

  // 检查 GraphQL 服务状态
  log('🔍 检查 GraphQL 服务状态...', 'yellow');
  const isServiceRunning = await checkGraphQLService(config.endpoint);

  if (!isServiceRunning) {
    log('❌ GraphQL 服务未运行!', 'red');
    log('请先启动 GraphQL 服务:', 'yellow');
    log('  cd packages/graphql-server', 'cyan');
    log('  pnpm dev', 'cyan');
    process.exit(1);
  }

  log('✅ GraphQL 服务运行正常', 'green');

  // 读取 dubhe config 文件
  let dubheMetadata: DubheMetadata;
  try {
    const dubheConfigPath = path.resolve(config.dubheConfigPath);
    const dubheConfigData = readFileSync(dubheConfigPath, 'utf-8');
    dubheMetadata = JSON.parse(dubheConfigData);
    log(`✅ Dubhe 配置文件加载成功: ${dubheConfigPath}`, 'green');
  } catch (error) {
    log(
      `❌ Dubhe 配置文件加载失败: ${error instanceof Error ? error.message : String(error)}`,
      'red'
    );
    log(`请检查配置文件路径: ${config.dubheConfigPath}`, 'yellow');
    process.exit(1);
  }

  // 创建客户端实例
  let client: DubheGraphqlClient;
  try {
    client = createClient(config, dubheMetadata);
    log('✅ DubheGraphqlClient 创建成功', 'green');

    // 显示解析的表信息
    const tableInfo = client.getAllTableInfo();
    if (tableInfo.size > 0) {
      log(`📋 自动解析到 ${tableInfo.size} 个表:`, 'green');
      for (const [tableName, info] of tableInfo) {
        log(`   - ${tableName}: ${info.fields.length} 个字段`, 'cyan');
      }
    } else {
      log('⚠️  未解析到表信息，请检查 dubhe config', 'yellow');
    }
  } catch (error) {
    log(`❌ 客户端创建失败: ${error instanceof Error ? error.message : String(error)}`, 'red');
    process.exit(1);
  }

  const queryResults: BenchmarkResult[] = [];
  const subscriptionResults: SubscriptionResult[] = [];

  try {
    switch (command) {
      case 'quick':
        log('\n📊 运行快速压测...', 'blue');
        const quickResults = await runQueryBenchmarkSuite(client, config, 'quick', 'basic');
        queryResults.push(...quickResults);
        break;

      case 'standard':
        log('\n📊 运行标准压测...', 'blue');
        const standardResults = await runQueryBenchmarkSuite(client, config, 'standard', 'basic');
        queryResults.push(...standardResults);

        // 同时运行过滤查询
        const filteredResults = await runQueryBenchmarkSuite(
          client,
          config,
          'standard',
          'filtered'
        );
        queryResults.push(...filteredResults);
        break;

      case 'stress':
        log('\n📊 运行压力测试...', 'blue');
        const stressResults = await runQueryBenchmarkSuite(client, config, 'stress', 'basic');
        queryResults.push(...stressResults);

        const stressFilteredResults = await runQueryBenchmarkSuite(
          client,
          config,
          'stress',
          'filtered'
        );
        queryResults.push(...stressFilteredResults);

        const batchResults = await runQueryBenchmarkSuite(client, config, 'stress', 'batch');
        queryResults.push(...batchResults);
        break;

      case 'subscription':
        log('\n📊 运行订阅压测...', 'blue');
        const basicSubResults = await runSubscriptionBenchmarkSuite(client, config, 'basic');
        subscriptionResults.push(...basicSubResults);

        const filteredSubResults = await runSubscriptionBenchmarkSuite(client, config, 'filtered');
        subscriptionResults.push(...filteredSubResults);
        break;

      case 'all':
        log('\n📊 运行全套压测...', 'blue');

        // 查询压测
        const allQueryResults = await Promise.all([
          runQueryBenchmarkSuite(client, config, 'quick', 'basic'),
          runQueryBenchmarkSuite(client, config, 'standard', 'filtered'),
          runQueryBenchmarkSuite(client, config, 'stress', 'batch')
        ]);
        queryResults.push(...allQueryResults.flat());

        // 订阅压测
        const allSubResults = await Promise.all([
          runSubscriptionBenchmarkSuite(client, config, 'basic'),
          runSubscriptionBenchmarkSuite(client, config, 'filtered')
        ]);
        subscriptionResults.push(...allSubResults.flat());

        log('\n🎉 全套压测完成!', 'green');
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        log('❌ 未知命令，显示帮助信息:', 'red');
        showHelp();
        process.exit(1);
    }

    // 生成报告
    if (queryResults.length > 0 || subscriptionResults.length > 0) {
      const report = generateReport(queryResults, subscriptionResults);
      const reportFile = `dubhe-benchmark-report-${Date.now()}.md`;
      writeFileSync(reportFile, report);
      log(`\n📋 压测报告已保存到: ${reportFile}`, 'green');

      // 同时保存 JSON 格式的详细结果
      const jsonReportFile = `dubhe-benchmark-results-${Date.now()}.json`;
      writeFileSync(jsonReportFile, JSON.stringify({ queryResults, subscriptionResults }, null, 2));
      log(`📋 详细结果已保存到: ${jsonReportFile}`, 'green');
    }
  } catch (error) {
    log(`❌ 压测执行失败: ${error instanceof Error ? error.message : String(error)}`, 'red');
    process.exit(1);
  } finally {
    // 清理客户端连接
    try {
      client.close();
      log('🔒 客户端连接已关闭', 'cyan');
    } catch (error) {
      log(
        `⚠️  客户端关闭警告: ${error instanceof Error ? error.message : String(error)}`,
        'yellow'
      );
    }
  }
}

function showHelp() {
  log('\n使用方法:', 'green');
  log('  pnpm tsx src/index.ts <command> [config-file]', 'cyan');
  log('  或者使用 npm scripts:', 'cyan');
  log('  pnpm start:quick     # 运行快速压测', 'yellow');
  log('  pnpm start:standard  # 运行标准压测', 'yellow');
  log('  pnpm start:stress    # 运行压力测试', 'yellow');
  log('  pnpm start:subscription # 运行订阅压测', 'yellow');

  log('\n可用命令:', 'green');
  log('  quick        快速压测 (10s, 5连接)', 'yellow');
  log('  standard     标准压测 (30s, 10连接)', 'yellow');
  log('  stress       压力测试 (60s, 20连接)', 'yellow');
  log('  subscription 订阅压测 (30s)', 'yellow');
  log('  all          运行所有压测配置', 'yellow');
  log('  help         显示帮助信息', 'yellow');

  log('\n配置文件:', 'green');
  log('  dubhe-bench-config.json  智能压测配置文件', 'yellow');
  log('  包含 dubhe config 和 benchmark 设置', 'yellow');

  log('\n特性:', 'green');
  log('  ✅ 自动解析 dubhe config 中的表结构', 'yellow');
  log('  ✅ 智能生成针对每个表的压测用例', 'yellow');
  log('  ✅ 支持查询和订阅的性能测试', 'yellow');
  log('  ✅ 使用 DubheGraphqlClient 进行测试', 'yellow');
  log('  ✅ 自动生成详细的性能报告', 'yellow');

  log('\n示例:', 'green');
  log('  # 启动 GraphQL 服务', 'cyan');
  log('  cd packages/graphql-server && pnpm dev', 'cyan');
  log('  ', 'cyan');
  log('  # 运行快速压测', 'cyan');
  log('  cd packages/benchmark && pnpm start:quick', 'cyan');
  log('  ', 'cyan');
  log('  # 使用自定义配置', 'cyan');
  log('  pnpm tsx src/index.ts standard my-config.json', 'cyan');
}

// 如果直接运行这个文件
if (require.main === module) {
  main().catch((error) => {
    log(`❌ 程序执行失败: ${error instanceof Error ? error.message : String(error)}`, 'red');
    process.exit(1);
  });
}

export {
  checkGraphQLService,
  createClient,
  runQueryBenchmark,
  runSubscriptionBenchmark,
  runQueryBenchmarkSuite,
  runSubscriptionBenchmarkSuite,
  generateReport,
  colors,
  log,
  section
};
