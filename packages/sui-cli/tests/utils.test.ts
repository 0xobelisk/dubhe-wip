import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateConfigJson, updateMoveTomlAddress } from '../src/utils/utils';
import { DubheConfig } from '@0xobelisk/sui-common';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('generateConfigJson', () => {
  it('should generate correct JSON for string type component', () => {
    const config: DubheConfig = {
      name: 'test_project',
      description: 'Test project',
      components: {
        owned_by: 'address'
      },
      resources: {},
      enums: {},
      errors: {}
    };

    const result = generateConfigJson(config);
    const parsed = JSON.parse(result);

    expect(parsed.components).toHaveLength(1);
    expect(parsed.components[0].owned_by).toEqual({
      fields: [
        { entity_id: 'address' },
        { value: 'address' }
      ],
      keys: ['entity_id']
    });
  });

  it('should generate correct JSON for empty object component', () => {
    const config: DubheConfig = {
      name: 'test_project',
      description: 'Test project',
      components: {
        player: {}
      },
      resources: {},
      enums: {},
      errors: {}
    };

    const result = generateConfigJson(config);
    const parsed = JSON.parse(result);

    expect(parsed.components).toHaveLength(1);
    expect(parsed.components[0].player).toEqual({
      fields: [
        { entity_id: 'address' }
      ],
      keys: ['entity_id']
    });
  });

  it('should generate correct JSON for component with fields and keys', () => {
    const config: DubheConfig = {
      name: 'test_project',
      description: 'Test project',
      components: {
        position: {
          fields: {
            id: 'address',
            x: 'u64',
            y: 'u64'
          },
          keys: ['id']
        }
      },
      resources: {},
      enums: {},
      errors: {}
    };

    const result = generateConfigJson(config);
    const parsed = JSON.parse(result);

    expect(parsed.components).toHaveLength(1);
    expect(parsed.components[0].position).toEqual({
      fields: [
        { id: 'address' },
        { x: 'u64' },
        { y: 'u64' }
      ],
      keys: ['id']
    });
  });

  it('should generate correct JSON for string type resource', () => {
    const config: DubheConfig = {
      name: 'test_project',
      description: 'Test project',
      components: {},
      resources: {
        counter: 'u32'
      },
      enums: {},
      errors: {}
    };

    const result = generateConfigJson(config);
    const parsed = JSON.parse(result);

    expect(parsed.resources).toHaveLength(1);
    expect(parsed.resources[0].counter).toEqual({
      fields: [
        { value: 'u32' }
      ],
      keys: []
    });
  });

  it('should generate correct JSON for string type resource without entity_id', () => {
    const config: DubheConfig = {
      name: 'test_project',
      description: 'Test project',
      components: {},
      resources: {
        counter: 'u32'
      },
      enums: {},
      errors: {}
    };

    const result = generateConfigJson(config);
    const parsed = JSON.parse(result);

    expect(parsed.resources).toHaveLength(1);
    expect(parsed.resources[0].counter).toEqual({
      fields: [
        { value: 'u32' }
      ],
      keys: []
    });
  });

  it('should generate correct JSON for empty object resource', () => {
    const config: DubheConfig = {
      name: 'test_project',
      description: 'Test project',
      components: {},
      resources: {
        counter: {
          fields: {},
          keys: []
        }
      },
      enums: {},
      errors: {}
    };

    const result = generateConfigJson(config);
    const parsed = JSON.parse(result);

    expect(parsed.resources).toHaveLength(1);
    expect(parsed.resources[0].counter).toEqual({
      fields: [],
      keys: []
    });
  });

  it('should generate correct JSON for resource with fields and keys', () => {
    const config: DubheConfig = {
      name: 'test_project',
      description: 'Test project',
      components: {},
      resources: {
        counter: {
          fields: {
            id: 'address',
            value: 'u32'
          },
          keys: ['id']
        }
      },
      enums: {},
      errors: {}
    };

    const result = generateConfigJson(config);
    const parsed = JSON.parse(result);

    expect(parsed.resources).toHaveLength(1);
    expect(parsed.resources[0].counter).toEqual({
      fields: [
        { id: 'address' },
        { value: 'u32' }
      ],
      keys: ['id']
    });
  });

  it('should generate correct JSON for resource with custom fields without entity_id', () => {
    const config: DubheConfig = {
      name: 'test_project',
      description: 'Test project',
      components: {},
      resources: {
        counter: {
          fields: {
            value: 'u32',
            owner: 'address'
          },
          keys: ['owner']
        }
      },
      enums: {},
      errors: {}
    };

    const result = generateConfigJson(config);
    const parsed = JSON.parse(result);

    expect(parsed.resources).toHaveLength(1);
    expect(parsed.resources[0].counter).toEqual({
      fields: [
        { value: 'u32' },
        { owner: 'address' }
      ],
      keys: ['owner']
    });
  });

  it('should handle complex config with multiple components and resources', () => {
    const config: DubheConfig = {
      name: 'test_project',
      description: 'Test project',
      enums: {
        Direction: ["North", "East", "South", "West"],
        MonsterCatchResult: ["Missed", "Caught", "Fled"],
        MonsterType: ["Eagle", "Rat", "Caterpillar"],
        TerrainType: ["None", "TallGrass", "Boulder"]
      },
      components: {
        player: {},
        position: {
          fields: {
            player: 'address',
            x: 'u64',
            y: 'u64'
          },
          keys: ['player']
        },
        owned_by: 'address'
      },
      resources: {
        counter: {
          fields: {
            id: 'u256',
            player: 'address',
            value: 'u32'
          },
          keys: ['id', 'player']
        },
        balance: 'u256'
      },
      errors: {}
    };

    const result = generateConfigJson(config);
    const parsed = JSON.parse(result);

    expect(parsed.components).toHaveLength(3);
    expect(parsed.resources).toHaveLength(2);

    // validate components
    expect(parsed.components[0].player).toEqual({
      fields: [{ entity_id: 'address' }],
      keys: ['entity_id']
    });

    expect(parsed.components[1].position).toEqual({
      fields: [
        { player: 'address' },
        { x: 'u64' },
        { y: 'u64' }
      ],
      keys: ['player']
    });

    expect(parsed.components[2].owned_by).toEqual({
      fields: [
        { entity_id: 'address' },
        { value: 'address' }
      ],
      keys: ['entity_id']
    });

    // validate resources
    expect(parsed.resources[0].counter).toEqual({
      fields: [
        { id: 'u256' },
        { player: 'address' },
        { value: 'u32' }
      ],
      keys: ['id', 'player']
    });

    expect(parsed.resources[1].balance).toEqual({
      fields: [
        { value: 'u256' }
      ],
      keys: []
    });
  });
});

describe('updateMoveTomlAddress', () => {
  let tempDir: string;
  let moveTomlPath: string;

  beforeEach(() => {
    // Create temporary directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updateMoveTomlAddress-test-'));
    moveTomlPath = path.join(tempDir, 'Move.toml');
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should update dubhe address in Move.toml file', () => {
    // Create test Move.toml file
    const originalContent = `[package]
name = "dubhe"
version = "1.0.0"
edition = "2024"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "mainnet-v1.46.3" }

[addresses]
sui = "0x2"
dubhe = "0x0"
`;

    fs.writeFileSync(moveTomlPath, originalContent, 'utf-8');

    // Execute update
    const newAddress = "0x1234567890abcdef";
    updateMoveTomlAddress(tempDir, newAddress);

    // Verify file content
    const updatedContent = fs.readFileSync(moveTomlPath, 'utf-8');
    expect(updatedContent).toContain(`dubhe = "${newAddress}"`);
    expect(updatedContent).not.toContain('dubhe = "0x0"');
  });

  it('should update any existing dubhe address', () => {
    // Create test Move.toml file with dubhe address not "0x0"
    const originalContent = `[package]
name = "dubhe"
version = "1.0.0"
edition = "2024"

[addresses]
sui = "0x2"
dubhe = "0x1234567890abcdef"
`;

    fs.writeFileSync(moveTomlPath, originalContent, 'utf-8');

    // Execute update
    const newAddress = "0xabcdef1234567890";
    updateMoveTomlAddress(tempDir, newAddress);

    // Verify file content
    const updatedContent = fs.readFileSync(moveTomlPath, 'utf-8');
    expect(updatedContent).toContain(`dubhe = "${newAddress}"`);
    expect(updatedContent).not.toContain('dubhe = "0x1234567890abcdef"');
  });

  it('should handle different formatting styles', () => {
    // Test different formats: no spaces, multiple spaces, etc.
    const testCases = [
      {
        original: 'dubhe="0x0"',
        expected: 'dubhe = "0x1234567890abcdef"'
      },
      {
        original: 'dubhe = "0x0"',
        expected: 'dubhe = "0x1234567890abcdef"'
      },
      {
        original: 'dubhe  =  "0x0"',
        expected: 'dubhe = "0x1234567890abcdef"'
      }
    ];

    testCases.forEach(({ original, expected }) => {
      // Create test Move.toml file
      const originalContent = `[package]
name = "dubhe"
version = "1.0.0"
edition = "2024"

[addresses]
sui = "0x2"
${original}
`;

      fs.writeFileSync(moveTomlPath, originalContent, 'utf-8');

      // Execute update
      const newAddress = "0x1234567890abcdef";
      updateMoveTomlAddress(tempDir, newAddress);

      // Verify update
      const updatedContent = fs.readFileSync(moveTomlPath, 'utf-8');
      expect(updatedContent).toContain(expected);
    });
  });

  it('should preserve other content in Move.toml file', () => {
    // Create test Move.toml file
    const originalContent = `[package]
name = "dubhe"
version = "1.0.0"
edition = "2024"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "mainnet-v1.46.3" }

[addresses]
sui = "0x2"
dubhe = "0x0"
`;

    fs.writeFileSync(moveTomlPath, originalContent, 'utf-8');

    // Execute update
    const newAddress = "0x1234567890abcdef";
    updateMoveTomlAddress(tempDir, newAddress);

    // Verify other content remains unchanged
    const updatedContent = fs.readFileSync(moveTomlPath, 'utf-8');
    expect(updatedContent).toContain('name = "dubhe"');
    expect(updatedContent).toContain('version = "1.0.0"');
    expect(updatedContent).toContain('edition = "2024"');
    expect(updatedContent).toContain('sui = "0x2"');
  });

  it('should handle different dubhe address formats', () => {
    // Create test Move.toml file
    const originalContent = `[package]
name = "dubhe"
version = "1.0.0"
edition = "2024"

[addresses]
sui = "0x2"
dubhe = "0x0"
`;

    fs.writeFileSync(moveTomlPath, originalContent, 'utf-8');

    // Test different address formats
    const testAddresses = [
      "0x1234567890abcdef",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x1",
      "0xabc123def456"
    ];

    testAddresses.forEach(address => {
      // Rewrite original content
      fs.writeFileSync(moveTomlPath, originalContent, 'utf-8');
      
      // Execute update
      updateMoveTomlAddress(tempDir, address);
      
      // Verify update
      const updatedContent = fs.readFileSync(moveTomlPath, 'utf-8');
      expect(updatedContent).toContain(`dubhe = "${address}"`);
    });
  });

  it('should throw error when Move.toml file does not exist', () => {
    // Don't create Move.toml file
    expect(() => {
      updateMoveTomlAddress(tempDir, "0x1234567890abcdef");
    }).toThrow();
  });

  it('should handle empty address', () => {
    // Create test Move.toml file
    const originalContent = `[package]
name = "dubhe"
version = "1.0.0"
edition = "2024"

[addresses]
sui = "0x2"
dubhe = "0x0"
`;

    fs.writeFileSync(moveTomlPath, originalContent, 'utf-8');

    // Execute update
    const newAddress = "";
    updateMoveTomlAddress(tempDir, newAddress);

    // Verify update
    const updatedContent = fs.readFileSync(moveTomlPath, 'utf-8');
    expect(updatedContent).toContain('dubhe = ""');
  });
}); 