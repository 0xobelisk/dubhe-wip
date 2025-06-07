import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { schemaGen } from '../src/codegen/utils/renderMove/schemaGen';
import { DubheConfig } from '../src/codegen/types';
import path from 'path';
import fs from 'fs';
import { error } from 'console';

describe('schemaGen', () => {
  const testConfig: DubheConfig = {
    name: 'test_project',
    description: 'Test project for schema generation',
    enums: {
      Status: ["Missed", "Caught", "Fled"],
      Direction: ["North", "East", "South", "West"],
      AssetType: ['Lp', 'Wrapped', 'Private', 'Package'],
    },
    components: {
      catch_master_result: {
        type: 'Offchain',
        fields: {
          monster: 'address',
          result: 'Status'
        },
        keys: ['monster']
      },
      balance: {
        fields: {
            asset: "address",
            account: "address",
            balance: "u256"
        },
        keys: ['asset', 'account']
      },
      position2: {
        fields: {
          x: "u64",
          y: "u64",
          direction: "Direction"
        }
      },
      movable: {
        fields: {
          'player': 'address'
        },
        keys: ['player']
      },
      movable1: "address",
      movable2: {},
      // monster: "address",
      monster: {
        fields: {
            attack: "u64",
            defense: "u64",
            hp: "u64"
         }
      },
      monster1: {
        fields: {
            name: 'vector<u8>',
            attack: "u64",
            defense: "u64",
            hp: "u64"
        }
      },
      monster_catch_result: {
        fields: {
          monster: 'address',
          result: 'Status'
        },
        keys: ['monster']
      },
      player: {
        fields: {
          'id': 'address'
        },
        keys: ['id']
      },
      position: {
        fields: {
          'id': 'address',
          'x': 'u64',
          'y': 'u64'
        },
        keys: ['id']
      },
      encounter: {
        fields: {
          id: 'address',
          exists: 'bool',
          monster: 'address',
          catch_attempt: 'u256'
        },
        keys: ['id']
      }, 
      map_config: {
        fields: {
          'width': 'u64',
          'height': 'u64'
        },
        keys: []
      },
    },
    errors: {
      asset_not_found: "Asset not found",
      asset_already_frozen: "Asset already frozen",
    }
  };

  const testDir = path.join(__dirname, 'test_project');

  beforeAll(() => {
    // 创建测试目录
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      // fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should generate schema files', async () => {
    await schemaGen(testDir, testConfig, 'testnet');

    // 验证生成的文件
//     const expectedFiles = [
//       'src/test_project/Move.toml',
//       'src/test_project/sources/codegen/dapp_key.move',
//       'src/test_project/sources/script/deploy_hook.move'
//     ];

//     for (const file of expectedFiles) {
//       const filePath = path.join(testDir, file);
      // expect(fs.existsSync(filePath)).toBe(true);
//     }
  });
}); 