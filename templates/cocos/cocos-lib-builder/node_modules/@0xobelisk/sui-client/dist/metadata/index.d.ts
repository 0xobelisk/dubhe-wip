import { SuiMoveNormalizedModules } from '@mysten/sui/client';
import { NetworkType } from '../types';
export declare function loadMetadata(networkType: NetworkType, packageId: string, fullnodeUrls?: string[]): Promise<SuiMoveNormalizedModules | undefined>;
