import { gql } from '@apollo/client';
import {
  createDubheGraphqlClient,
  DubheGraphqlClient,
  DubheMetadata,
} from '../src';
import dubheMetadata from '../dubhe.config_1.json';

const CONFIG = {
  endpoint: 'http://localhost:4000/graphql',
  // 只有在支持WebSocket时才设置订阅端点
  subscriptionEndpoint: 'ws://localhost:4000/graphql',
  headers: {
    'Content-Type': 'application/json',
  },
  dubheMetadata,
};

// 主函数
async function main() {
  console.log('🔍 检查运行环境...');
  console.log(`📍 Node.js环境: ${typeof window === 'undefined' ? '是' : '否'}`);

  const client = createDubheGraphqlClient(CONFIG);

  // 测试使用客户端订阅方法（仅在支持WebSocket时运行）
  console.log('\n🔔 === 测试客户端订阅方法 ===');

  console.log('使用 subscribeToTableChanges 方法订阅...');

  // 直接调用subscribe()启动订阅，回调已经在options中处理
  const data = await client.getAllTables('counter1', {
    first: 10,
  });
  // .subscribe({}); // 传递空对象满足linter要求
  console.log(JSON.stringify(data, null, 2));

  const data1 = await client.getTableByCondition('counter1', {
    entityId:
      '0xd7b69493da10a0e733b13d3213b20beb1630a50b949876b352b002f4818a9388',
  });
  // 保存订阅引用
  console.log(JSON.stringify(data1, null, 2));

  console.log('🎯 订阅已成功启动！等待数据更新...');
  console.log('💡 提示：可以在另一个终端中修改数据库来触发订阅事件');
}

main();
