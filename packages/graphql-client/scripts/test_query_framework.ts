import { createDubheGraphqlClient } from '../src';
import dubheMetadata from '../dubhe.config_1.json';
import dubheFrameworkMetadata from '../dubhe.config_framework.json';

const CONFIG = {
  endpoint: 'https://dubhe-framework-testnet-api.obelisk.build/graphql',
  // Only set subscription endpoint when WebSocket is supported
  subscriptionEndpoint: 'wss://dubhe-framework-testnet-api.obelisk.build/graphql',
  headers: {
    'Content-Type': 'application/json'
  },
  dubheMetadata: dubheFrameworkMetadata
};

// Main function
async function main() {
  console.log('🔍 Checking runtime environment...');
  console.log(`📍 Node.js environment: ${typeof window === 'undefined' ? 'Yes' : 'No'}`);

  const client = createDubheGraphqlClient(CONFIG);

  // Test using client subscription methods (only runs when WebSocket is supported)
  console.log('\n🔔 === Testing Client Subscription Methods ===');

  console.log('Using subscribeToTableChanges method to subscribe...');

  // // Call subscribe() directly to start subscription, callbacks are already handled in options
  // const data = await client.getAllTables('asset_supply', {
  //   first: 10
  // });
  // // .subscribe({}); // Pass empty object to satisfy linter requirements
  // console.log(JSON.stringify(data, null, 2));

  // const data1 = await client.getTableByCondition('asset_supply', {
  //   asset_id: '0x357cb71d44a3fe292623a589e44f6a4f704d39d64a916bde9f81b78ce7ffac5c'
  // });
  // // Save subscription reference
  // console.log(JSON.stringify(data1, null, 2));

  // console.log('🔍 === Testing Single Data Query ===');

  const item = await client.getTableByCondition('dubhe_asset_id', {
    uniqueResourceId: 1
  });
  console.log(JSON.stringify(item, null, 2));

  console.log('🎯 Subscription started successfully! Waiting for data updates...');
  console.log(
    '💡 Tip: You can modify the database in another terminal to trigger subscription events'
  );
}

main();
