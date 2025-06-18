import { describe, it, expect } from 'vitest';
import { generateConfigJson } from '../src/utils/utils';
import { DubheConfig } from '@0xobelisk/sui-common';

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
        { entity_id: 'address' },
        { value: 'u32' }
      ],
      keys: ['entity_id']
    });
  });

  it('should generate correct JSON for empty object resource', () => {
    const config: DubheConfig = {
      name: 'test_project',
      description: 'Test project',
      components: {},
      resources: {
        counter: {}
      },
      enums: {},
      errors: {}
    };

    const result = generateConfigJson(config);
    const parsed = JSON.parse(result);

    expect(parsed.resources).toHaveLength(1);
    expect(parsed.resources[0].counter).toEqual({
      fields: [
        { entity_id: 'address' }
      ],
      keys: ['entity_id']
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
        { entity_id: 'address' },
        { value: 'u256' }
      ],
      keys: ['entity_id']
    });
  });
}); 