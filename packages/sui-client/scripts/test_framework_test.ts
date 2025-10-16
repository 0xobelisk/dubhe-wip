import {
  Dubhe,
  NetworkType,
  TransactionArgument,
  loadMetadata,
  Transaction,
  DevInspectResults,
  bcs
} from '../src/index';
import * as process from 'process';
import dotenv from 'dotenv';
dotenv.config();

async function init() {
  const network = 'testnet';
  const packageId = '0xa09cd4137e604ec5a7a88f72c572ecd064b0e713a3fbf705a88456cdbccf36c0';

  const metadata = await loadMetadata(network as NetworkType, packageId);

  const privateKey = process.env.PRIVATE_KEY;

  const dubhe = new Dubhe({
    networkType: network as NetworkType,
    packageId: packageId,
    metadata: metadata,
    secretKey: privateKey
  });

  console.log(dubhe.getAddress());
  // await dubhe.requestFaucet();
  let balance = await dubhe.getBalance();
  console.log('balance', balance);
}

init();
