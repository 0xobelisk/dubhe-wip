import { NetworkType } from '../../types';
export const defaultGasBudget = 10 ** 8; // 0.1 INITIA, should be enough for most of the transactions
export const defaultGasPrice = 1000; // 1000 MIST

/**
 * @description Get the default fullnode url for the given network type
 * @param networkType, 'testnet' | 'mainnet' | 'localnet', default is 'testnet'
 * @returns { fullNode: string }
 */
export const getDefaultURL = (
  networkType: NetworkType = 'testnet'
): { fullNode: string; chainId: string } => {
  switch (networkType) {
    case 'localnet':
      return {
        fullNode: 'http://127.0.0.1:8080',
        chainId: 'initiation-2',
      };
    case 'testnet':
      return {
        fullNode: 'https://lcd.testnet.initia.xyz',
        chainId: 'initiation-2',
      };
    case 'mainnet':
      return {
        fullNode: 'https://fullnode.mainnet.aptoslabs.com',
        chainId: 'initiation-1',
      };
    default:
      return {
        fullNode: 'https://lcd.testnet.initia.xyz',
        chainId: 'initiation-2',
      };
  }
};
