import { defineDapp } from '@0xobelisk/sui-common';

export default defineDapp({
  name: 'counter',
  description: 'counter contract',
  components: {
    counter: {
      fields: {
        player: 'address',
        value: 'u8'
      },
      keys: ['player']
    }
  },
  resources: {
    counter: {
      fields: {
        value: 'u8'
      },
      keys: []
    }
  }
});
