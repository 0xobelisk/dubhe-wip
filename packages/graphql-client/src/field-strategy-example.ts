/**
 * Field Strategy Example - Demonstrates different field query strategies
 * Shows how to query table fields safely based on dubhe configuration
 */

import { createDubheGraphqlClient } from './client';
import { DubheMetadata } from './types';

// Example dubhe metadata containing different types of tables (JSON format)
const dubheMetadata: DubheMetadata = {
  components: [
    {
      // 1. Table with default id field
      Player: {
        fields: [
          { entity_id: 'address' },
          { name: 'string' },
          { level: 'u32' },
        ],
        keys: ['entity_id'], // Empty keys means using default entityId
      },
    },
    {
      // 2. Custom primary key (no id field)
      Position: {
        fields: [{ x: 'u32' }, { y: 'u32' }],
        keys: ['x', 'y'], // Composite primary key, no id field
      },
    },
    {
      // 3. Single custom primary key
      UserProfile: {
        fields: [
          { user_id: 'string' },
          { bio: 'string' },
          { avatar: 'string' },
        ],
        keys: ['user_id'], // Use user_id as primary key
      },
    },
    {
      // 4. No primary key table
      GameLog: {
        fields: [
          { entity_id: 'address' },
          { action: 'string' },
          { timestamp: 'u64' },
          { data: 'string' },
        ],
        keys: ['entity_id'], // No primary key
      },
    },
  ],
  resources: [
    // {
    //   // 4. No primary key table
    //   GameLog: {
    //     fields: [
    //       { action: 'string' },
    //       { timestamp: 'u64' },
    //       { data: 'string' },
    //     ],
    //     keys: [], // No primary key
    //   },
    // },
  ],
  enums: [],
};

const client = createDubheGraphqlClient({
  endpoint: 'http://localhost:4000/graphql',
  dubheMetadata: dubheMetadata,
});

// Field strategy demonstration
function demonstrateFieldStrategies() {
  // 1. Check field configuration for each table
  const tables = ['player', 'position', 'userProfile', 'gameLog'];

  // Analyze table fields and primary keys
  tables.forEach((tableName) => {
    client.getTableFields(tableName);
    client.getTablePrimaryKeys(tableName);
  });

  // 2. Safe query strategy demonstration
  // For unknown tables, only query system fields to avoid GraphQL errors

  // Assume this is a table not defined in dubhe config
  const unknownTableFields = client.getTableFields('unknown_table');
  // Safe: Only includes createdAt and updatedAt, doesn't include potentially non-existent id field

  // 3. Precise query strategy
  // Player table - has default id field
  client.getTableFields('player');

  // Position table - no id field, has composite primary key
  client.getTableFields('position');

  // GameLog table - no primary key
  client.getTableFields('gameLog');

  // 4. Actual query demonstration (pseudocode)
  demonstrateQueries();
}

async function demonstrateQueries() {
  try {
    // Safe: automatically use correct fields
    // Query Player table (automatically include id field)
    // const players = await client.getAllTables('player');
    // Query Position table (automatically exclude id field)
    // const positions = await client.getAllTables('position');
    // Query GameLog table (no primary key table)
    // const gameLogs = await client.getAllTables('gameLog');
    // All queries will use correct field set, avoiding GraphQL errors
  } catch (error: any) {
    // Query example (requires actual GraphQL server)
  }
}

// Best practices recommendations
function bestPractices() {
  // Field strategy best practices would be documented here
}

// Export demonstration functions
export {
  demonstrateFieldStrategies,
  bestPractices,
  dubheMetadata as fieldStrategyDubheMetadata,
};

// Run directly if executed as main module
if (require.main === module) {
  demonstrateFieldStrategies();
  bestPractices();
}
