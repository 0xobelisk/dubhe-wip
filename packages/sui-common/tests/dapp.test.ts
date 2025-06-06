import { describe, it, expect } from 'vitest';
import { defineDapp } from '../src/codegen/utils/renderMove/dapp';
import { DubheConfig, MoveType } from '../src/codegen/types';

describe('defineDapp', () => {
  it('should generate correct Move module with basic config', () => {
    const config: DubheConfig = {
      name: 'game',
      description: 'Game module',
      components: {
        player: {
          fields: {
            id: 'address',
            name: 'vector<u8>',
            level: 'u64',
          },
          keys: ['id'],
        },
        monster: {
          fields: {
            id: 'vector<u8>',
            name: 'vector<u8>',
            hp: 'u64',
          },
          keys: ['id'],
        }
      }
    };


    const result = defineDapp(config);
    expect(result).toContain('module game');
    expect(result).toContain('public struct game');
  });

  it('should handle config with offchain table', () => {
    const config: DubheConfig = {
      name: 'game',
      description: 'Game module',
      components: {
        player: {
          type: 'Offchain',
          fields: {
            id: 'vector<u8>' as MoveType,
            name: 'vector<u8>' as MoveType,
            level: 'u64' as MoveType,
          },
          keys: ['id'],
        }
      }
    };

    const result = defineDapp(config);
    expect(result).toContain('module game');
    expect(result).toContain('public struct game');
  });

  it('should handle config with simple table type', () => {
    const config: DubheConfig = {
      name: 'game',
      description: 'Game module',
      components: {
        player: 'bool',
        movable: 'bool'
      }
    };

    const result = defineDapp(config);
    expect(result).toContain('module game');
    expect(result).toContain('public struct game');
  });

  it('should handle empty config', () => {
    const config: DubheConfig = {
      name: 'game',
      description: 'Game module',
      components: {}
    };

    const result = defineDapp(config);
    expect(result).toContain('module game');
    expect(result).toContain('public struct game');
  });
}); 