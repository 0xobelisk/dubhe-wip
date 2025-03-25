import { DubheConfig } from '@0xobelisk/aptos-common';

export const dubheConfig = {
  name: 'demo',
  description: 'demo',
  systems: ['demo_system'],
  schemas: {
    demo: {
      valueType: {
        da_height: 'u64',
        blob: 'string'
      },
      defaultValue: {
        da_height: 0,
        blob: 'hello'
      }
    }
  }
} as DubheConfig;
