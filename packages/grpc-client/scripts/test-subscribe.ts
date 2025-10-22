#!/usr/bin/env node

/**
 * resource0 table subscription test script
 * Used to test gRPC client subscription functionality, monitoring real-time data changes in resource0 table
 */

import { DubheGrpcClient } from '../src/index';
import type { SubscribeRequest, TableChange } from '../src/index';

async function main() {
  const client = new DubheGrpcClient({ baseUrl: 'http://localhost:8080' });
  const subscription = client.dubheGrpcClient.subscribeTable({
    tableIds: []
  });
  for await (const change of subscription.responses) {
    console.log(`--------------------------------`);
    console.log(`Table: ${change.tableId}`);
    console.log(`Data: ${JSON.stringify(change.data, null, 2)}`);
    console.log(`--------------------------------`);
  }
}

main();
