import { NetworkType } from 'src/types';
export interface NetworkConfig {
    fullNode: string;
    graphql?: string;
    network: string;
    txExplorer: string;
    accountExplorer: string;
    explorer: string;
    indexerUrl: string;
}
export declare const getDefaultURL: (networkType?: NetworkType) => NetworkConfig;
