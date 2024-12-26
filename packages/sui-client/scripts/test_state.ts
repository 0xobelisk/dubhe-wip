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
  const network = 'localnet';
  const packageId =
    '0x9dad8dafe0d807e56a1524807836b68f3af19a7e99d346bd16883768378ec44a';

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

  const currencyObjectId =
    '0xa7a43920b7f9a30153129e319598516e27938c6b34216b51ee3399bf839bda67';

  const res = await dubhe.state({
    schema: 'counter',
    struct: 'value',
    objectId: currencyObjectId,
    storageType: 'StorageValue<u64>',
    params: [],
  });
  console.log(res);
  // const databcs =
}

init();
