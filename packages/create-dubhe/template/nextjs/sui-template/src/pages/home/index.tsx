import { loadMetadata, Dubhe, Transaction, DevInspectResults, NetworkType } from '@0xobelisk/sui-client';
import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { Value } from '../../jotai';
import { useRouter } from 'next/router';
import { Counter_Object_Id, NETWORK, PACKAGE_ID } from '../../chain/config';
import { ConnectButton, useCurrentWallet, useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { toast } from 'sonner';

function getExplorerUrl(network: NetworkType, digest: string) {
  switch (network) {
    case 'testnet':
      return `https://explorer.polymedia.app/txblock/${digest}?network=${network}`;
    case 'mainnet':
      return `https://suiscan.xyz/tx/${digest}`;
    case 'devnet':
      return `https://explorer.polymedia.app/txblock/${digest}?network=${network}`;
    case 'localnet':
      return `https://explorer.polymedia.app/txblock/${digest}?network=local`;
  }
}
/**
 * Home component for the counter application
 * Manages the counter state, user balance, and interactions with the Sui blockchain
 */
const Home: React.FC = () => {
  const router = useRouter();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const { connectionStatus } = useCurrentWallet();
  const address = useCurrentAccount()?.address;

  const [value, setValue] = useAtom(Value);
  const [loading, setLoading] = useState<boolean>(false);
  const [balance, setBalance] = useState<string>('0');

  /**
   * Queries the current counter value from the blockchain
   */
  const queryCounter = async (): Promise<void> => {
    try {
      const metadata = await loadMetadata(NETWORK, PACKAGE_ID);
      const dubhe = new Dubhe({
        networkType: NETWORK,
        packageId: PACKAGE_ID,
        metadata: metadata,
      });
      const tx = new Transaction();
      const queryValue = (await dubhe.query.counter_schema.get_value(tx, [
        tx.object(Counter_Object_Id),
      ])) as DevInspectResults;
      console.log('Counter value:', dubhe.view(queryValue)[0]);
      setValue(dubhe.view(queryValue)[0]);
    } catch (error) {
      console.error('Failed to query counter:', error);
    }
  };

  /**
   * Fetches the current balance of the connected wallet
   */
  const getBalance = async (): Promise<void> => {
    if (!address) return;
    try {
      const dubhe = new Dubhe({ networkType: NETWORK });
      const balance = await dubhe.balanceOf(address);
      setBalance((Number(balance.totalBalance) / 1_000_000_000).toFixed(4));
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  };

  /**
   * Increments the counter on the blockchain
   */
  const incrementCounter = async (): Promise<void> => {
    setLoading(true);
    try {
      const metadata = await loadMetadata(NETWORK, PACKAGE_ID);
      const dubhe = new Dubhe({
        networkType: NETWORK,
        packageId: PACKAGE_ID,
        metadata: metadata,
      });
      const tx = new Transaction();
      await dubhe.tx.counter_system.inc(tx, [tx.object(Counter_Object_Id)], undefined, true);
      await signAndExecuteTransaction(
        {
          transaction: tx.serialize(),
          chain: `sui:${NETWORK}`,
        },
        {
          onSuccess: async result => {
            // Wait for a short period before querying the latest data
            setTimeout(async () => {
              await queryCounter();
              await getBalance();
              toast('Transfer Successful', {
                description: new Date().toUTCString(),
                action: {
                  label: 'Check in Explorer',
                  onClick: () => window.open(getExplorerUrl(NETWORK, result.digest), '_blank'),
                },
              });
              setLoading(false);
            }, 2000); // Wait for 2 seconds before querying, adjust as needed
          },
          onError: error => {
            console.error('Transaction failed:', error);
            toast.error('Transaction failed. Please try again.');
            setLoading(false);
          },
        },
      );
    } catch (error) {
      console.error('Transaction error:', error);
      setLoading(false);
    }
  };

  // Initialize counter and balance when the component mounts and wallet is connected
  useEffect(() => {
    if (router.isReady && address) {
      queryCounter();
      getBalance();
    }
  }, [router.isReady, address]);

  return (
    <div className="flex justify-between items-start">
      <div className="max-w-7xl mx-auto text-center py-12 px-4 sm:px-6 lg:py-16 lg:px-8 flex-6">
        {connectionStatus !== 'connected' ? (
          <ConnectButton />
        ) : (
          <>
            <div>
              <ConnectButton />
              <div className="mt-4 text-lg">
                {Number(balance) === 0 ? (
                  <span className="text-red-500">Balance is 0. Please acquire some {NETWORK} tokens first.</span>
                ) : (
                  <span>Balance: {balance} SUI</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-6 mt-12">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-6 text-2xl text-green-600 mt-6">Counter: {value}</div>
                <div className="flex flex-col gap-6">
                  <button
                    type="button"
                    className="mx-auto px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                    onClick={incrementCounter}
                    disabled={loading || Number(balance) === 0}
                  >
                    {loading ? 'Processing...' : 'Increment'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Home;
