#!/usr/bin/env node

/**
 * DubheGraphqlClient 查询测试脚本
 *
 * 这个脚本演示了如何使用 DubheGraphqlClient 进行各种查询操作，
 * 基于实际的 dubhe.config.ts 配置文件。
 */

import { DubheGraphqlClient, createDubheGraphqlClient } from '../src/client';
import { dubheConfig } from '../dubhe.config';

// 配置 GraphQL 端点
const config = {
  endpoint: process.env.GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql',
  subscriptionEndpoint:
    process.env.GRAPHQL_WS_ENDPOINT || 'ws://localhost:4000/graphql',
  dubheConfig, // 使用实际的 dubhe 配置
  headers: {
    'Content-Type': 'application/json',
    // 如果需要认证，可以添加 Authorization header
    // 'Authorization': 'Bearer your-token-here',
  },
  retryOptions: {
    attempts: { max: 3 },
    delay: { initial: 1000, max: 5000 },
  },
};

// 创建客户端实例
const client = createDubheGraphqlClient(config);

// 颜色输出辅助函数
const colors = {
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
};

function section(title: string) {
  console.log(
    `\n${colors.cyan('=')} ${colors.blue(title)} ${colors.cyan('='.repeat(50 - title.length))}`
  );
}

function success(text: string) {
  console.log(`${colors.green('✅')} ${text}`);
}

function error(text: string) {
  console.log(`${colors.red('❌')} ${text}`);
}

function info(text: string) {
  console.log(`${colors.yellow('ℹ️')} ${text}`);
}

function result(data: any) {
  console.log(`${colors.magenta('📊')} 结果:`, JSON.stringify(data, null, 2));
}

async function testQueries() {
  console.log(colors.green('🚀 DubheGraphqlClient 查询测试开始\n'));

  section('1. 配置信息检查');

  try {
    // 检查 dubhe 配置
    const dubheConfig = client.getDubheConfig();
    if (dubheConfig) {
      success(`成功加载 Dubhe 配置: ${dubheConfig.name}`);
      info(`描述: ${dubheConfig.description}`);

      // 显示解析的表信息
      console.log('\n📋 解析的表信息:');
      const allTableInfo = client.getAllTableInfo();
      allTableInfo.forEach((info, tableName) => {
        console.log(`  ${colors.cyan(tableName)}:`);
        console.log(`    字段: ${info.fields.join(', ')}`);
        console.log(`    主键: ${info.primaryKeys.join(', ') || '无'}`);
        console.log(`    默认ID: ${info.hasDefaultId ? '是' : '否'}`);
        if (Object.keys(info.enumFields).length > 0) {
          console.log(`    枚举字段: ${JSON.stringify(info.enumFields)}`);
        }
      });
    } else {
      error('未找到 Dubhe 配置');
    }
  } catch (err) {
    error(`配置检查失败: ${err}`);
  }

  section('2. 基础查询测试');

  // 测试查询所有玩家
  try {
    info('查询 players 表...');
    const players = await client.getAllTables('player', {
      first: 10,
      orderBy: [{ field: 'createdAt', direction: 'DESC' }],
    });
    success(`Players 查询成功! 总数: ${players.totalCount || 0}`);
    if (players.edges && players.edges.length > 0) {
      result(players.edges.slice(0, 2)); // 只显示前2条
    }
  } catch (err: any) {
    error(`Players 查询失败: ${err.message}`);
  }

  // 测试查询位置信息
  try {
    info('查询 positions 表...');
    const positions = await client.getAllTables('position', {
      first: 5,
      fields: ['x', 'y', 'createdAt'], // 手动指定字段
    });
    success(`Positions 查询成功! 总数: ${positions.totalCount || 0}`);
    if (positions.edges && positions.edges.length > 0) {
      result(positions.edges.slice(0, 2));
    }
  } catch (err: any) {
    error(`Positions 查询失败: ${err.message}`);
  }

  // 测试查询怪物信息
  try {
    info('查询 monsters 表...');
    const monsters = await client.getAllTables('monster', {
      first: 5,
      filter: {
        monsterType: { equalTo: 'Eagle' }, // 过滤特定类型的怪物
      },
    });
    success(`Monsters 查询成功! 总数: ${monsters.totalCount || 0}`);
    if (monsters.edges && monsters.edges.length > 0) {
      result(monsters.edges.slice(0, 2));
    }
  } catch (err: any) {
    error(`Monsters 查询失败: ${err.message}`);
  }

  section('3. 条件查询测试');

  // 测试通过条件查询单个记录
  try {
    info('通过 ID 查询单个位置...');
    const position = await client.getTableByCondition('position', {
      id: '0xfc8f7d0eec60cc35beb5e0dce4e71a2e245a1f2fbb1ac736c4428e62f36bbe82',
    });
    if (position) {
      success('单个位置查询成功!');
      result(position);
    } else {
      info('未找到指定的位置记录');
    }
  } catch (err: any) {
    error(`单个位置查询失败: ${err.message}`);
  }

  section('4. 批量查询测试');

  try {
    info('执行批量查询...');
    const batchResults = await client.batchQuery([
      {
        key: 'recent_players',
        tableName: 'player',
        params: {
          first: 5,
          orderBy: [{ field: 'createdAt', direction: 'DESC' }],
        },
      },
      {
        key: 'map_configs',
        tableName: 'map_config',
        params: {
          first: 3,
          fields: ['width', 'height', 'terrain'],
        },
      },
      {
        key: 'encounters',
        tableName: 'encounter',
        params: {
          first: 10,
        },
      },
    ]);

    success('批量查询成功!');
    Object.entries(batchResults).forEach(([key, data]) => {
      console.log(`  ${colors.cyan(key)}: ${data.totalCount || 0} 条记录`);
    });
  } catch (err: any) {
    error(`批量查询失败: ${err.message}`);
  }

  section('5. 高级过滤查询测试');

  try {
    info('测试复杂过滤条件...');
    const filteredPositions = await client.getAllTables('position', {
      first: 10,
      filter: {
        and: [{ x: { greaterThan: 0 } }, { y: { lessThan: 100 } }],
      },
      orderBy: [
        { field: 'x', direction: 'ASC' },
        { field: 'y', direction: 'ASC' },
      ],
    });
    success(`复杂过滤查询成功! 总数: ${filteredPositions.totalCount || 0}`);
  } catch (err: any) {
    error(`复杂过滤查询失败: ${err.message}`);
  }

  section('6. 订阅测试');

  try {
    info('测试表变更订阅...');
    const subscription = client.subscribeToTableChanges('player', {
      initialEvent: true,
      first: 5,
      onData: (data) => {
        success('收到订阅数据!');
        console.log('数据:', JSON.stringify(data, null, 2));
      },
      onError: (err) => {
        error(`订阅错误: ${err.message}`);
      },
    });

    success('订阅创建成功! (5秒后将停止)');

    // 启动订阅并在5秒后停止
    const sub = subscription.subscribe({
      next: (result) => {
        // 处理订阅结果
      },
      error: (err) => {
        error(`订阅错误: ${err.message}`);
      },
      complete: () => {
        info('订阅完成');
      },
    });

    setTimeout(() => {
      sub.unsubscribe();
      info('订阅已停止');
    }, 5000);
  } catch (err: any) {
    error(`订阅测试失败: ${err.message}`);
  }

  section('7. 多表订阅测试');

  try {
    info('测试多表订阅...');
    const multiSubscription = client.subscribeToMultipleTables(
      [
        {
          tableName: 'player',
          options: {
            first: 5,
            initialEvent: true,
          },
        },
        {
          tableName: 'monster',
          options: {
            first: 3,
            filter: { monsterType: { equalTo: 'Eagle' } },
          },
        },
      ],
      {
        onData: (allData) => {
          success('收到多表订阅数据!');
          Object.keys(allData).forEach((tableName) => {
            console.log(`  ${tableName}: 有新数据`);
          });
        },
        onError: (err) => {
          error(`多表订阅错误: ${err.message}`);
        },
      }
    );

    success('多表订阅创建成功! (5秒后将停止)');

    // 启动多表订阅并在5秒后停止
    const multiSub = multiSubscription.subscribe({
      next: (allData) => {
        // 处理多表订阅数据
      },
      error: (err) => {
        error(`多表订阅错误: ${err.message}`);
      },
      complete: () => {
        info('多表订阅完成');
      },
    });

    setTimeout(() => {
      multiSub.unsubscribe();
      info('多表订阅已停止');
    }, 5000);
  } catch (err: any) {
    error(`多表订阅测试失败: ${err.message}`);
  }

  section('8. 性能测试');

  try {
    info('执行性能测试...');
    const startTime = Date.now();

    const performanceTest = await Promise.all([
      client.getAllTables('player', { first: 20 }),
      client.getAllTables('position', { first: 20 }),
      client.getAllTables('monster', { first: 20 }),
    ]);

    const endTime = Date.now();
    success(`并发查询完成! 耗时: ${endTime - startTime}ms`);

    performanceTest.forEach((result, index) => {
      const tables = ['player', 'position', 'monster'];
      console.log(`  ${tables[index]}: ${result.totalCount || 0} 条记录`);
    });
  } catch (err: any) {
    error(`性能测试失败: ${err.message}`);
  }

  // 等待订阅测试完成
  await new Promise((resolve) => setTimeout(resolve, 6000));

  section('9. 清理和总结');

  try {
    info('清理缓存...');
    await client.clearCache();
    success('缓存清理完成');

    info('关闭客户端连接...');
    client.close();
    success('客户端连接已关闭');
  } catch (err: any) {
    error(`清理失败: ${err.message}`);
  }

  console.log(`\n${colors.green('🎉 测试完成!')}`);
  console.log(`\n${colors.yellow('💡 提示:')}`);
  console.log('  1. 确保 GraphQL 服务器运行在配置的端点');
  console.log('  2. 检查数据库中是否有测试数据');
  console.log('  3. 根据实际需要调整查询参数和过滤条件');
  console.log('  4. 可以通过环境变量设置不同的端点:');
  console.log('     GRAPHQL_ENDPOINT=http://your-endpoint:port/graphql');
  console.log('     GRAPHQL_WS_ENDPOINT=ws://your-endpoint:port/graphql');
}

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', promise, '原因:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 运行测试
if (require.main === module) {
  testQueries().catch((error) => {
    console.error('测试执行失败:', error);
    process.exit(1);
  });
}

export { testQueries };
