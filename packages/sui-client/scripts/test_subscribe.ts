import { WebSocket } from 'ws';
import { createClient } from 'graphql-ws';

async function testSubscription() {
  const PORT = process.env.PORT || 3001;

  const client = createClient({
    url: `ws://localhost:${PORT}/graphql`,
    webSocketImpl: WebSocket,
    retryAttempts: 3,
    connectionParams: {},
  });

  console.log(`Connecting to ws://localhost:${PORT}/graphql`);

  try {
    const unsubscribe = client.subscribe(
      {
        query: `
					subscription {
						onNewTransaction {
							id
							checkpoint
							digest
						}
					}
				`,
      },
      {
        next: (data) => {
          console.log('Received new transaction:', data);
        },
        error: (error) => {
          console.error('Subscription error:', error);
        },
        complete: () => {
          console.log('Subscription completed');
        },
      }
    );

    // 60秒后取消订阅
    setTimeout(() => {
      unsubscribe();
      console.log('Subscription canceled');
      process.exit(0); // 正常退出程序
    }, 60000);
  } catch (error) {
    console.error('Connection error:', error);
    process.exit(1); // 错误退出
  }
}

testSubscription().catch((error) => {
  console.error('Program error:', error);
  process.exit(1);
});
