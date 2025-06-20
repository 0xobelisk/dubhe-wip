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
      },
      resources: {
        game_state: {
          fields: {
            id: 'address',
          }
        }
      }
    };

    const result = defineDapp(config);
  });

  it('should handle config with offchain table', () => {
    const config: DubheConfig = {
      name: 'game',
      description: 'Game module',
      components: {
        player: {
          offchain: true,
          fields: {
            id: 'vector<u8>' as MoveType,
            name: 'vector<u8>' as MoveType,
            level: 'u64' as MoveType,
          },
          keys: ['id'],
        }
      },
      resources: {
        game_state: {
          fields: {
            id: 'address',
          }
        }
      }
    };

    defineDapp(config);
  });

  it('should handle config with simple table type', () => {
    const config: DubheConfig = {
      name: 'game',
      description: 'Game module',
      components: {
        player: 'bool',
        movable: 'bool'
      },
      resources: {
        game_state: {
          fields: {
            id: 'address',
          }
        }
      }
    };

    defineDapp(config);
  });

  it('should handle empty config', () => {
    const config: DubheConfig = {
      name: 'game',
      description: 'Game module',
      components: {},
      resources: {}
    };

    defineDapp(config);
  });

  it('should throw error when duplicate keys exist between components and resources', () => {
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
        }
      },
      resources: {
        player: {
          fields: {
            id: 'address',
          }
        }
      }
    };

    expect(() => defineDapp(config)).toThrow('Duplicate keys found between components and resources: player');
  });
}); 