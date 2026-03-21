import { Transaction } from '@mysten/sui/transactions';
import type { SuiTransactionBlockResponse, DevInspectResults, SuiMoveNormalizedModules, SuiObjectData } from '@mysten/sui/client';
import { SuiAccountManager } from './libs/suiAccountManager';
import { SuiTx } from './libs/suiTxBuilder';
import { SuiInteractor } from './libs/suiInteractor';
import { MapObjectStruct } from './types';
import { SuiContractFactory } from './libs/suiContractFactory';
import { SuiMoveMoudleFuncType } from './libs/suiContractFactory/types';
import { NetworkConfig } from './libs/suiInteractor';
import { ChannelEventEnvelope, ChannelPublishEventInput, ChannelSubscriptionSpec, ChannelSubmitBatchResponse, ChannelSubmitResponse, DerivePathParams, FaucetNetworkType, MapMoudleFuncQuery, MapMoudleFuncTx, DubheParams, SuiTxArg, SuiObjectArg, SuiVecTxArg } from './types';
export declare function isUndefined(value?: unknown): value is undefined;
export declare function withMeta<T extends {
    meta: SuiMoveMoudleFuncType;
}>(meta: SuiMoveMoudleFuncType, creator: Omit<T, 'meta'>): T;
/**
 * @class Dubhe
 * @description This class is used to aggregate the tools that used to interact with SUI network.
 */
export declare class Dubhe {
    #private;
    accountManager: SuiAccountManager;
    suiInteractor: SuiInteractor;
    contractFactory: SuiContractFactory;
    packageId: string | undefined;
    metadata: SuiMoveNormalizedModules | undefined;
    projectName: string | undefined;
    channelUrl: string | undefined;
    /**
     * Support the following ways to init the DubheClient:
     * 1. mnemonics
     * 2. secretKey (base64 or hex)
     * If none of them is provided, will generate a random mnemonics with 24 words.
     *
     * @param mnemonics, 12 or 24 mnemonics words, separated by space
     * @param secretKey, base64 or hex string or bech32, when mnemonics is provided, secretKey will be ignored
     * @param networkType, 'testnet' | 'mainnet' | 'devnet' | 'localnet', default is 'devnet'
     * @param fullnodeUrl, the fullnode url, default is the preconfig fullnode url for the given network type
     * @param packageId
     */
    constructor({ mnemonics, secretKey, networkType, fullnodeUrls, channelUrl, indexerUrl, packageId, metadata }?: DubheParams);
    get query(): MapMoudleFuncQuery;
    get tx(): MapMoudleFuncTx;
    get object(): MapObjectStruct;
    view(dryResult: DevInspectResults): any[];
    state({ tx, schema, params, customModuleName }: {
        tx: Transaction;
        schema: string;
        params: any[];
        customModuleName?: string;
    }): Promise<any[] | undefined>;
    parseState({ schema, objectId, storageType, params, customModuleName }: {
        schema: string;
        objectId: string;
        storageType: string;
        params: any[];
        customModuleName?: string;
    }): Promise<any[] | undefined>;
    /**
     * else:
     * it will generate signer from the mnemonic with the given derivePathParams.
     * @param derivePathParams, such as { accountIndex: 2, isExternal: false, addressIndex: 10 }, comply with the BIP44 standard
     */
    getSigner(derivePathParams?: DerivePathParams): import("@mysten/sui/dist/cjs/keypairs/ed25519").Ed25519Keypair;
    /**
     * @description Switch the current account with the given derivePathParams
     * @param derivePathParams, such as { accountIndex: 2, isExternal: false, addressIndex: 10 }, comply with the BIP44 standard
     */
    switchAccount(derivePathParams: DerivePathParams): void;
    /**
     * @description Get the address of the account for the given derivePathParams
     * @param derivePathParams, such as { accountIndex: 2, isExternal: false, addressIndex: 10 }, comply with the BIP44 standard
     */
    getAddress(derivePathParams?: DerivePathParams): string;
    currentAddress(): string;
    getPackageId(): string;
    getMetadata(): SuiMoveNormalizedModules | undefined;
    getNetwork(): import("./types").NetworkType | undefined;
    getNetworkConfig(): NetworkConfig;
    getTxExplorerUrl(txHash: string): string;
    getAccountExplorerUrl(address: string): string;
    getExplorerUrl(): string;
    /**
     * Update configuration dynamically without recreating the entire instance
     * @param config - Partial configuration to update (same type as constructor)
     */
    updateConfig(config: Partial<DubheParams>): void;
    /**
     * Request some SUI from faucet
     * @Returns {Promise<boolean>}, true if the request is successful, false otherwise.
     */
    requestFaucet(address?: string, network?: FaucetNetworkType, derivePathParams?: DerivePathParams): Promise<void>;
    getBalance(coinType?: string, derivePathParams?: DerivePathParams): Promise<import("@mysten/sui/client").CoinBalance>;
    balanceOf(accountAddress?: string, coinType?: string, derivePathParams?: DerivePathParams): Promise<import("@mysten/sui/client").CoinBalance>;
    client(): import("@mysten/sui/client").SuiClient;
    getObject(objectId: string): Promise<SuiObjectData>;
    getObjects(objectIds: string[]): Promise<SuiObjectData[]>;
    signTxn(tx: Uint8Array | Transaction | SuiTx, derivePathParams?: DerivePathParams): Promise<import("@mysten/sui/dist/cjs/cryptography").SignatureWithBytes>;
    signAndSendTxn({ tx, derivePathParams, onSuccess, onError }: {
        tx: Uint8Array | Transaction | SuiTx;
        derivePathParams?: DerivePathParams;
        onSuccess?: (result: SuiTransactionBlockResponse) => void | Promise<void>;
        onError?: (error: Error) => void | Promise<void>;
    }): Promise<SuiTransactionBlockResponse>;
    sendTx(transaction: Uint8Array | string, signature: string | string[]): Promise<SuiTransactionBlockResponse>;
    waitForTransaction(digest: string): Promise<SuiTransactionBlockResponse>;
    waitForIndexerTransaction(digest: string): Promise<SuiTransactionBlockResponse>;
    setChannelUrl(channelUrl: string): void;
    getChannelUrl(): string;
    latestNonce(sender?: string): Promise<number>;
    queryChannelTable({ dappKey, account, table, key }: {
        dappKey?: string;
        account?: string;
        table: string;
        key: number[][];
    }): Promise<{
        message: boolean;
        data: number[][];
    }>;
    subscribeChannelTable({ dappKey, account, table, key }: {
        dappKey?: string;
        account?: string;
        table?: string;
        key?: number[][];
    }, handlers?: {
        onOpen?: () => void;
        onMessage?: (data: {
            dapp_key: string;
            account: string;
            table: string;
            key: number[][];
            value: number[][];
        }) => void;
        onError?: (error: Error) => void;
        onClose?: () => void;
    }): Promise<() => void>;
    subscribeChannel(spec: ChannelSubscriptionSpec, handlers?: {
        onOpen?: () => void;
        onMessage?: (data: ChannelEventEnvelope) => void;
        onError?: (error: Error) => void;
        onClose?: () => void;
    }): Promise<() => void>;
    publishChannelEvent({ id, topic, partitionKey, kind, tsMs, payload, metadata }: ChannelPublishEventInput): Promise<ChannelEventEnvelope>;
    submitToChannel({ tx, nonce, sender }: {
        tx: Transaction | SuiTx;
        nonce?: number;
        sender?: string;
    }): Promise<ChannelSubmitResponse>;
    submitBatchToChannel({ txs, sender, startNonce }: {
        txs: (Transaction | SuiTx)[];
        sender?: string;
        startNonce?: number;
    }): Promise<ChannelSubmitBatchResponse>;
    /**
     * Transfer the given amount of SUI to the recipient
     * @param recipient
     * @param amount
     * @param derivePathParams
     */
    transferSui(recipient: string, amount: number, derivePathParams?: DerivePathParams): Promise<SuiTransactionBlockResponse>;
    /**
     * Transfer to mutliple recipients
     * @param recipients the recipients addresses
     * @param amounts the amounts of SUI to transfer to each recipient, the length of amounts should be the same as the length of recipients
     * @param derivePathParams
     */
    transferSuiToMany(recipients: string[], amounts: number[], derivePathParams?: DerivePathParams): Promise<SuiTransactionBlockResponse>;
    /**
     * Transfer the given amounts of coin to multiple recipients
     * @param recipients the list of recipient address
     * @param amounts the amounts to transfer for each recipient
     * @param coinType any custom coin type but not SUI
     * @param derivePathParams the derive path params for the current signer
     */
    transferCoinToMany(recipients: string[], amounts: number[], coinType: string, derivePathParams?: DerivePathParams): Promise<SuiTransactionBlockResponse>;
    transferCoin(recipient: string, amount: number, coinType: string, derivePathParams?: DerivePathParams): Promise<SuiTransactionBlockResponse>;
    transferObjects(objects: SuiObjectArg[], recipient: string, derivePathParams?: DerivePathParams): Promise<SuiTransactionBlockResponse>;
    moveCall(callParams: {
        target: string;
        arguments?: (SuiTxArg | SuiVecTxArg)[];
        typeArguments?: string[];
        derivePathParams?: DerivePathParams;
    }): Promise<SuiTransactionBlockResponse>;
    /**
     * Select coins with the given amount and coin type, the total amount is greater than or equal to the given amount
     * @param amount
     * @param coinType
     * @param owner
     */
    selectCoinsWithAmount(amount: number, coinType: string, owner?: string): Promise<string[]>;
    selectObjectsWithType(objectType: string, owner?: string): Promise<string[]>;
    /**
     * stake the given amount of SUI to the validator
     * @param amount the amount of SUI to stake
     * @param validatorAddr the validator address
     * @param derivePathParams the derive path params for the current signer
     */
    stakeSui(amount: number, validatorAddr: string, derivePathParams?: DerivePathParams): Promise<SuiTransactionBlockResponse>;
    /**
     * Execute the transaction with on-chain data but without really submitting. Useful for querying the effects of a transaction.
     * Since the transaction is not submitted, its gas cost is not charged.
     * @param tx the transaction to execute
     * @param derivePathParams the derive path params
     * @returns the effects and events of the transaction, such as object changes, gas cost, event emitted.
     */
    inspectTxn(tx: Uint8Array | Transaction | SuiTx, derivePathParams?: DerivePathParams): Promise<DevInspectResults>;
    getOwnedObjects(owner: string, cursor?: string, limit?: number): Promise<SuiObjectData[]>;
    entity_key_from_object(objectId: string): Promise<string | undefined>;
    entity_key_from_bytes(bytes: Uint8Array | Buffer | string): Promise<string>;
    entity_key_from_address_with_seed(objectId: string, seed: string): Promise<string | undefined>;
    entity_key_from_address_with_u256(objectId: string, x: number): Promise<string | undefined>;
    entity_key_from_u256(x: number): Promise<string>;
}
