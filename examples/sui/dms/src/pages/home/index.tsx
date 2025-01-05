import { loadMetadata, Dubhe, Transaction, DevInspectResults, NetworkType } from '@0xobelisk/sui-client';
import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { Value } from '../../jotai';
import { useRouter } from 'next/router';
import { Mailbox_Object_Id, NETWORK, PACKAGE_ID } from '../../chain/config';
import { ConnectButton, useCurrentWallet, useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { toast } from 'sonner';

type Message = {
  sender: string;
  message: string;
}

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

const Home: React.FC = () => {
  const router = useRouter();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const { connectionStatus } = useCurrentWallet();
  const address = useCurrentAccount()?.address;

  const [value, setValue] = useAtom(Value);
  const [loading, setLoading] = useState<boolean>(false);
  const [balance, setBalance] = useState<string>('0');
  const [messages, setMessages] = useState<Array<Message>>([]);
  const [message, setMessage] = useState<string>('No Message');
  const [worldMessageInput, setWorldMessageInput] = useState<string>('');
  const [privateMessageInput, setPrivateMessageInput] = useState<string>('');

  const queryWorldMessage = async (): Promise<void> => {
    try {
      const metadata = await loadMetadata(NETWORK, PACKAGE_ID);
      const dubhe = new Dubhe({
        networkType: NETWORK,
        packageId: PACKAGE_ID,
        metadata: metadata,
      });
      const tx = new Transaction();
      const queryValue = (await dubhe.query.mailbox_schema.get_world_message({
        tx,
        params: [tx.object(Mailbox_Object_Id)],
      })) as DevInspectResults;
      console.log('Counter value:', dubhe.view(queryValue)[0]);
      setValue(dubhe.view(queryValue)[0]);
    } catch (error) {
      console.error('Failed to query counter:', error);
      setValue("No Message");
    }
  };

  const queryPrivateMessage = async (): Promise<void> => {
    try {
      const metadata = await loadMetadata(NETWORK, PACKAGE_ID);
      const dubhe = new Dubhe({
        networkType: NETWORK,
        packageId: PACKAGE_ID,
        metadata: metadata,
      });
      const tx = new Transaction();
      const queryValue = (await dubhe.query.mailbox_schema.get_private_message({
        tx,
        params: [
          tx.object(Mailbox_Object_Id),
          tx.pure.address(address),
        ],
      })) as DevInspectResults;
      console.log('Counter value:', dubhe.view(queryValue)[0]);
      setMessage(dubhe.view(queryValue)[0]);
    } catch (error) {
      console.error('Failed to query counter:', error);
      setMessage("No Message");
    }
  };

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

  const sendMessage = async (): Promise<void> => {
    setLoading(true);
    try {
      const metadata = await loadMetadata(NETWORK, PACKAGE_ID);
      const dubhe = new Dubhe({
        networkType: NETWORK,
        packageId: PACKAGE_ID,
        metadata: metadata,
      });
      const tx = new Transaction();
      await dubhe.tx.message_system.send({
        tx,
        params: [tx.object(Mailbox_Object_Id), tx.pure.string(worldMessageInput)],
        isRaw: true,
      });
      await signAndExecuteTransaction(
          {
            transaction: tx.serialize(),
            chain: `sui:${NETWORK}`,
          },
          {
            onSuccess: async result => {
              setTimeout(async () => {
                await queryWorldMessage();
                await getBalance();
                toast('Transfer Successful', {
                  description: new Date().toUTCString(),
                  action: {
                    label: 'Check in Explorer',
                    onClick: () => window.open(getExplorerUrl(NETWORK, result.digest), '_blank'),
                  },
                });
                setLoading(false);
              }, 2000);
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

  const setPrivateMessage = async (): Promise<void> => {
    setLoading(true);
    try {
      const metadata = await loadMetadata(NETWORK, PACKAGE_ID);
      const dubhe = new Dubhe({
        networkType: NETWORK,
        packageId: PACKAGE_ID,
        metadata: metadata,
      });
      const tx = new Transaction();
      await dubhe.tx.message_system.set({
        tx,
        params: [tx.object(Mailbox_Object_Id), tx.pure.string(privateMessageInput)],
        isRaw: true,
      });
      await signAndExecuteTransaction(
          {
            transaction: tx.serialize(),
            chain: `sui:${NETWORK}`,
          },
          {
            onSuccess: async result => {
              setTimeout(async () => {
                await queryPrivateMessage();
                await getBalance();
                toast('Transfer Successful', {
                  description: new Date().toUTCString(),
                  action: {
                    label: 'Check in Explorer',
                    onClick: () => window.open(getExplorerUrl(NETWORK, result.digest), '_blank'),
                  },
                });
                setLoading(false);
              }, 2000);
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

  useEffect( () => {
    if (router.isReady && address) {
      queryWorldMessage();
      queryPrivateMessage();
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
                    <div className="flex flex-col gap-6 text-2xl text-black-600 mt-6">World Message: {value}</div>
                    <input
                        type="text"
                        value={worldMessageInput}
                        onChange={(e) => setWorldMessageInput(e.target.value)}
                        className="border rounded p-2"
                        placeholder="Enter world message"
                    />
                    <button
                        type="button"
                        className="mx-auto px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                        onClick={sendMessage}
                        disabled={loading || Number(balance) === 0}
                    >
                      {loading ? 'Processing...' : 'Send'}
                    </button>
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-6 text-2xl text-black-600 mt-6">Private Message: {message}</div>
                    <input
                        type="text"
                        value={privateMessageInput}
                        onChange={(e) => setPrivateMessageInput(e.target.value)}
                        className="border rounded p-2"
                        placeholder="Enter private message"
                    />
                    <button
                        type="button"
                        className="mx-auto px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                        onClick={setPrivateMessage}
                        disabled={loading || Number(balance) === 0}
                    >
                      {loading ? 'Processing...' : 'Set'}
                    </button>
                  </div>
                </div>
              </>
          )}
        </div>
      </div>
  );
};

export default Home;