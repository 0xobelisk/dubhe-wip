import { defineDapp } from '@0xobelisk/sui-common';

export default defineDapp({
  name: 'counter',
  description: 'counter contract',
  tables: {
    counter: {
      schema: {
        player: 'address',
        value: 'u8'
      },
      key: ['player']
    }
  }
});
