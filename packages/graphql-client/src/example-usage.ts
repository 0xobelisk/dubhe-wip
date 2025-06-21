/**
 * DubheGraphqlClient usage example - Support automatic dubhe config parsing
 *
 * This example demonstrates how to use the new dubhe config automatic parsing feature,
 * allowing the client to automatically identify table field information without manual specification.
 */

import { createDubheGraphqlClient } from './client';
import { DubheMetadata } from './types';

// 1. Import JSON format dubhe configuration
import dubheConfigJson from '../dubhe.config_1.json';

// 2. Create client instance
const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:3000/graphql',
  subscriptionEndpoint: 'ws://localhost:3000/graphql',
  headers: {
    Authorization: 'Bearer your-token',
  },
});

// 3. Usage example
async function exampleUsage() {
  try {
    // Query Counter0 table data
    const result = await client.getAllTables('Counter0', {
      first: 10,
      orderBy: [{ field: 'updatedAt', direction: 'DESC' }],
    });

    // Query Counter1 table data
    const counter1Result = await client.getAllTables('Counter1', {
      filter: { value: { greaterThan: 10 } },
      first: 5,
    });

    // Query single record by condition
    const singleRecord = await client.getTableByCondition('Counter0', {
      entityId: 'some-entity-id',
    });

    // Subscribe to data changes
    const subscription = client.subscribeToTableChanges('Counter0', {
      onData: (data) => {
        // Handle data changes
      },
      onError: (error) => {
        // Handle errors
      },
      initialEvent: true,
    });

    // Batch query multiple tables
    const batchResult = await client.batchQuery([
      { key: 'counter0', tableName: 'Counter0', params: { first: 10 } },
      { key: 'counter1', tableName: 'Counter1', params: { first: 5 } },
    ]);

    // Get table field information
    const counter0Fields = client.getTableFields('Counter0');

    // Get primary key information
    const counter0PrimaryKeys = client.getTablePrimaryKeys('Counter0');

    // Multi-table subscription
    const multiSub = client.subscribeToTableList(['Counter0', 'Counter1'], {
      initialEvent: true,
      first: 10,
    });

    // Get table information and metadata
    const metadata = client.getDubheMetadata();
    const allTableInfo = client.getAllTableInfo();

    // Clean up
    subscription.subscribe().unsubscribe();
    multiSub.subscribe().unsubscribe();
    client.close();
  } catch (error) {
    console.error('Usage error:', error);
  }
}

export { exampleUsage };

// Run example if module is executed directly
if (require.main === module) {
  exampleUsage().catch(console.error);
}
