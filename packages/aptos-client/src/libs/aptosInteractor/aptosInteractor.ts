import {
  AccountAddressInput,
  AccountAuthenticator,
  AnyRawTransaction,
  Aptos,
  AptosConfig,
  HexInput,
  InputGenerateTransactionOptions,
  InputGenerateTransactionPayloadData,
  WaitForTransactionOptions,
  Account,
  Network,
  PendingTransactionResponse,
  MoveStructId,
  LedgerVersionArg,
  MoveModuleBytecode,
  PaginationArgs,
  InputViewFunctionData,
  MoveType,
  MoveValue,
  SimpleTransaction,
} from '@aptos-labs/ts-sdk';
import { getDefaultURL } from './defaultConfig';
import { delay } from './util';
import {
  MovementNetwork,
  NetworkType,
  NetworkNameToIndexerAPI,
} from 'src/types';

/**
 * `SuiTransactionSender` is used to send transaction with a given gas coin.
 * It always uses the gas coin to pay for the gas,
 * and update the gas coin after the transaction.
 */
export class AptosInteractor {
  public readonly providers: Aptos[];
  public currentProvider: Aptos;
  public network?: NetworkType;

  constructor(
    fullNodeUrls: string[],
    network?: NetworkType,
    indexerUrl?: string
  ) {
    if (fullNodeUrls.length === 0)
      throw new Error('fullNodeUrls must not be empty');
    this.providers = fullNodeUrls.map(
      (url) =>
        new Aptos(
          new AptosConfig({
            fullnode: url,
            network: network ?? Network.TESTNET,
            indexer: indexerUrl,
          })
        )
    );
    this.currentProvider = this.providers[0];
    // this.currentClient = AptosConfig

    this.network = network;

    // // if (Object.values(MovementNetwork).includes(network as MovementNetwork)) {
    // // } else if (Object.values(Network).includes(network as Network)) {
    // // }
    // if (
    //   network !== undefined &&
    //   network !== Network.LOCAL &&
    //   network !== MovementNetwork.LOCAL
    // ) {
    //   this.indexerClient = new IndexerClient(NetworkNameToIndexerAPI[network]);
    // }
  }

  switchToNextProvider() {
    const currentProviderIdx = this.providers.indexOf(this.currentProvider);
    this.currentProvider =
      this.providers[(currentProviderIdx + 1) % this.providers.length];
  }

  async buildTransaction({
    sender,
    data,
    options,
    withFeePayer,
  }: {
    sender: AccountAddressInput;
    data: InputGenerateTransactionPayloadData;
    options?: InputGenerateTransactionOptions;
    withFeePayer?: boolean;
  }): Promise<SimpleTransaction> {
    return this.currentProvider.transaction.build.simple({
      sender,
      data,
      options,
      withFeePayer,
    });
  }

  async signTransaction(signer: Account, transaction: AnyRawTransaction) {
    for (const provider of this.providers) {
      try {
        const senderAuthenticator = provider.transaction.sign({
          signer,
          transaction,
        });
        return senderAuthenticator;
      } catch (err) {
        console.warn(
          `Failed to sign transaction with fullnode ${provider.config.fullnode}: ${err}`
        );
        await delay(2000);
      }
    }
    throw new Error('Failed to sign transaction with all fullnodes');
  }

  async submitSimpleTransaction(
    transaction: AnyRawTransaction,
    senderAuthenticator: AccountAuthenticator,
    feePayerAuthenticator?: AccountAuthenticator
  ) {
    for (const provider of this.providers) {
      try {
        const pendingTxn = await provider.transaction.submit.simple({
          transaction,
          senderAuthenticator,
          feePayerAuthenticator,
        });
        return pendingTxn;
      } catch (err) {
        console.warn(
          `Failed to submit transaction with fullnode ${provider.config.fullnode}: ${err}`
        );
        await delay(2000);
      }
    }
    throw new Error('Failed to submit transaction with all fullnodes');
  }

  async waitForTransaction(
    transactionHash: HexInput,
    options?: WaitForTransactionOptions
  ) {
    for (const provider of this.providers) {
      try {
        const executedTransaction = await provider.waitForTransaction({
          transactionHash,
          options,
        });
        return executedTransaction;
      } catch (err) {
        console.warn(
          `Failed to wait for transaction: ${transactionHash} with fullnode ${provider.config.fullnode}: ${err}`
        );
        await delay(2000);
      }
    }
    throw new Error('Failed to wait for transaction with all fullnodes');
  }

  async sendTxWithPayload(
    signer: Account,
    sender: AccountAddressInput,
    data: InputGenerateTransactionPayloadData,
    options?: InputGenerateTransactionOptions,
    withFeePayer?: boolean,
    feePayerAuthenticator?: AccountAuthenticator
  ): Promise<PendingTransactionResponse> {
    for (const provider of this.providers) {
      try {
        const transaction = await provider.transaction.build.simple({
          sender,
          data,
          options,
          withFeePayer,
        });
        const senderAuthenticator = provider.transaction.sign({
          signer,
          transaction,
        });
        const committedTransaction = await provider.transaction.submit.simple({
          transaction,
          senderAuthenticator,
          feePayerAuthenticator,
        });
        return committedTransaction;
      } catch (err) {
        console.warn(
          `Failed to send transaction with fullnode ${provider.config.fullnode}: ${err}`
        );
        await delay(2000);
      }
    }
    throw new Error('Failed to send transaction with all fullnodes');
  }

  async signAndSubmitTransaction(
    sender: Account,
    transaction: AnyRawTransaction
  ): Promise<any> {
    for (const provider of this.providers) {
      try {
        const committedTransaction =
          await provider.transaction.signAndSubmitTransaction({
            signer: sender,
            transaction: transaction,
          });
        return committedTransaction;
      } catch (err) {
        console.warn(
          `Failed to send transaction with fullnode ${provider.config.fullnode}: ${err}`
        );
        await delay(2000);
      }
    }
    throw new Error('Failed to send transaction with all fullnodes');
  }

  async getAccountResources(accountAddress: string) {
    for (const provider of this.providers) {
      try {
        return provider.getAccountResources({
          accountAddress,
        });
      } catch (err) {
        console.warn(
          `Failed to get AccountResources with fullnode ${provider.config.fullnode}: ${err}`
        );
        await delay(2000);
      }
    }
    throw new Error('Failed to get AccountResources with all fullnodes');
  }

  async getAccountResource(
    accountAddress: AccountAddressInput,
    resourceType: MoveStructId,
    options?: LedgerVersionArg
  ) {
    for (const provider of this.providers) {
      try {
        return provider.getAccountResource({
          accountAddress,
          resourceType,
          options,
        });
      } catch (err) {
        console.warn(
          `Failed to get AccountResource with fullnode ${provider.config.fullnode}: ${err}`
        );
        await delay(2000);
      }
    }
    throw new Error('Failed to get AccountResource with all fullnodes');
  }

  async getAccountModule(
    accountAddress: AccountAddressInput,
    moduleName: string,
    options?: LedgerVersionArg
  ): Promise<MoveModuleBytecode> {
    for (const provider of this.providers) {
      try {
        return provider.getAccountModule({
          accountAddress,
          moduleName,
          options,
        });
      } catch (err) {
        console.warn(
          `Failed to get AccountModule with fullnode ${provider.config.fullnode}: ${err}`
        );
        await delay(2000);
      }
    }
    throw new Error('Failed to get AccountModule with all fullnodes');
  }

  async getAccountModules(
    accountAddress: AccountAddressInput,
    options?: PaginationArgs & LedgerVersionArg
  ): Promise<MoveModuleBytecode[]> {
    for (const provider of this.providers) {
      try {
        return provider.getAccountModules({
          accountAddress,
          options,
        });
      } catch (err) {
        console.warn(
          `Failed to get AccountModules with fullnode ${provider.config.fullnode}: ${err}`
        );
        await delay(2000);
      }
    }
    throw new Error('Failed to get AccountModules with all fullnodes');
  }

  async view({
    payload,
    options,
  }: {
    payload: InputViewFunctionData;
    options?: LedgerVersionArg;
  }): Promise<MoveValue[]> {
    for (const provider of this.providers) {
      try {
        return provider.view({
          payload,
          options,
        });
      } catch (err) {
        console.warn(
          `Failed to view with fullnode ${provider.config.fullnode}: ${err}`
        );
        await delay(2000);
      }
    }
    throw new Error('Failed to view with all fullnodes');
  }

  async requestFaucet(
    accountAddress: AccountAddressInput,
    amount: number,
    options?: WaitForTransactionOptions
  ) {
    for (const provider of this.providers) {
      try {
        return await provider.fundAccount({
          accountAddress,
          amount,
          options,
        });
      } catch (err) {
        console.warn(
          `Failed to fund token with fullnode ${provider.config.fullnode}: ${err}`
        );
        await delay(2000);
      }
    }
    throw new Error('Failed to fund token with all fullnodes');
  }
}
