/**
 * Test script for batchQuery fields functionality
 */

import { createDubheGraphqlClient } from './client';

async function testBatchQueryFields() {
  // Create test client
  const client = createDubheGraphqlClient({
    endpoint: 'http://localhost:3000/graphql',
  });

  try {
    // Test 1: Using custom fields
    const customFieldsResult = await client.batchQuery([
      {
        key: 'counter0_custom',
        tableName: 'Counter0',
        params: {
          first: 5,
          fields: ['entityId', 'value', 'createdAt'], // Custom field selection
        },
      },
      {
        key: 'counter1_custom',
        tableName: 'Counter1',
        params: {
          first: 5,
          fields: ['entityId', 'value'], // Minimal field selection
        },
      },
    ]);

    // Test 2: Using default field parsing from dubhe config
    const defaultFieldsResult = await client.batchQuery([
      {
        key: 'counter0_default',
        tableName: 'Counter0',
        // No fields specified - will use dubhe config or minimal fields
      },
      {
        key: 'counter1_default',
        tableName: 'Counter1',
      },
    ]);

    // Test 3: Mixed usage
    const mixedResult = await client.batchQuery([
      {
        key: 'counter0_full',
        tableName: 'Counter0',
        params: {
          first: 10,
          fields: ['entityId', 'value', 'createdAt', 'updatedAt'],
          filter: { value: { greaterThan: 0 } },
        },
      },
      {
        key: 'counter1_minimal',
        tableName: 'Counter1',
        params: {
          first: 5,
          // Using default field parsing
        },
      },
    ]);

    // Results are ready for processing
    return {
      customFieldsResult,
      defaultFieldsResult,
      mixedResult,
    };
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  } finally {
    client.close();
  }
}

// Export for testing
export { testBatchQueryFields };

// Run test if executed directly
if (require.main === module) {
  testBatchQueryFields()
    .then((results) => {
      console.log('All tests completed successfully');
    })
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}
