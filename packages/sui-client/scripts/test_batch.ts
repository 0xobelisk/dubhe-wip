import {
  Dubhe,
  NetworkType,
  TransactionArgument,
  loadMetadata,
  Transaction,
  DevInspectResults,
  bcs,
} from '../src/index';
import * as process from 'process';
import dotenv from 'dotenv';
dotenv.config();

async function init() {
  const network = 'testnet';
  const packageId =
    '0x7c3dca4b87464f7e1900c50303a0e5eb02ca4f5f1d9bc742c75259e415a95e5f';

  const metadata = await loadMetadata(network as NetworkType, packageId);

  const privateKey = process.env.PRIVATE_KEY;

  const dubhe = new Dubhe({
    networkType: network as NetworkType,
    packageId: packageId,
    metadata: metadata,
    secretKey: privateKey,
  });

  console.log(dubhe.getAddress());
  // await dubhe.requestFaucet();
  let balance = await dubhe.getBalance();
  console.log('balance', balance);

  let i = 5580;
  while (true) {
    const tx = new Transaction();
    await dubhe.tx.dapp_system.hello_encounter({
      tx,
      params: [
        tx.object(
          '0x071886c22bc3726c4f29373825738a84c3c9de47a65adb3b242b31c9491a3f0f'
        ),
        tx.pure.address(`0x${i}`),
        tx.pure.bool(true),
        tx.pure.address('0x0'),
        tx.pure.u256(123456),
      ],
      onSuccess: (res) => {
        console.log('success', res.digest);
        i++;
      },
      onError: (err) => {
        console.log('error', err);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

init();
