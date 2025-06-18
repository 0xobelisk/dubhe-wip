import { DubheConfig } from '@0xobelisk/sui-common';

export const dubheConfig = {
  name: 'counter',
  description: 'counter contract',
  components: {
    counter0: {},
    counter1: {
      fields:{
        value: "u32"
      },
      keys: []
    },
    counter2: "u32",
  },
  resources: {}
} as DubheConfig;
