import { gql } from '@apollo/client';
import { createDubheGraphqlClient, DubheGraphqlClient } from '../src';
import { dubheConfig } from '../dubhe.config';

const CONFIG = {
  endpoint: 'http://localhost:4000/graphql',
  // 只有在支持WebSocket时才设置订阅端点
  subscriptionEndpoint: 'ws://localhost:4000/graphql',
  headers: {
    'Content-Type': 'application/json',
  },
  dubheConfig,
};

class GraphQLTester {
  private client: DubheGraphqlClient;
  private activeSubscriptions: any[] = []; // 保存活跃的订阅

  constructor() {
    console.log('🚀 初始化 GraphQL 客户端...');

    this.client = createDubheGraphqlClient(CONFIG);
  }

  // 测试使用客户端订阅方法（仅在支持WebSocket时运行）
  async testClientSubscription() {
    console.log('\n🔔 === 测试客户端订阅方法 ===');

    console.log('使用 subscribeToTableChanges 方法订阅...');

    try {
      // 直接调用subscribe()启动订阅，回调已经在options中处理
      const subscription = this.client.subscribeToTableChanges('counter1', {
        onData: (data: any) => {
          console.log('✅ 收到订阅数据:', JSON.stringify(data, null, 2));
        },
        onError: (error: any) => {
          console.error('❌ 订阅错误:', error);
        },
        onComplete: () => {
          console.log('✅ 订阅完成');
        },
      });
      // .subscribe({}); // 传递空对象满足linter要求

      const sub = subscription.subscribe({});
      // 保存订阅引用
      this.activeSubscriptions.push(sub);

      console.log('🎯 订阅已成功启动！等待数据更新...');
      console.log('💡 提示：可以在另一个终端中修改数据库来触发订阅事件');

      return sub;
    } catch (error) {
      console.error('❌ 客户端订阅启动失败:', error);
    }
  }

  // 清理所有订阅
  cleanup() {
    console.log('🧹 清理所有订阅...');
    this.activeSubscriptions.forEach((sub) => {
      try {
        sub.unsubscribe();
      } catch (error) {
        console.error('清理订阅时出错:', error);
      }
    });
    this.activeSubscriptions = [];
    this.client.close();
  }
}

// 主函数
async function main() {
  console.log('🔍 检查运行环境...');
  console.log(`📍 Node.js环境: ${typeof window === 'undefined' ? '是' : '否'}`);

  const tester = new GraphQLTester();

  // 启动订阅测试
  await tester.testClientSubscription();

  // 保持程序运行，让订阅可以接收数据
  console.log('\n⏰ 程序将保持运行以接收订阅数据...');
  console.log('🔄 按 Ctrl+C 退出程序');

  // 设置定时器定期输出状态，保持程序活跃
  const statusInterval = setInterval(() => {
    console.log(`⚡ 订阅状态检查 - ${new Date().toLocaleTimeString()}`);
  }, 30000); // 每30秒输出一次状态

  // 优雅退出处理
  const gracefulShutdown = () => {
    console.log('\n👋 收到退出信号，正在清理资源...');
    clearInterval(statusInterval);
    tester.cleanup();
    console.log('✅ 清理完成，程序退出');
    process.exit(0);
  };

  // 监听退出信号
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

// 错误处理
process.on('unhandledRejection', (error) => {
  console.error('❌ 未处理的Promise拒绝:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n👋 收到中断信号，正在退出...');
  process.exit(0);
});

// 运行测试
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 主函数执行失败:', error);
    process.exit(1);
  });
}

export { GraphQLTester, main };
