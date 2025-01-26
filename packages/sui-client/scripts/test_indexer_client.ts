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
    '0x68ed4d88366436c15956f3284132561f41dc76fc6247af3caccf34717d62801e';

  const schemaId =
    '0x29d2f860affdacb9bee4350419bc7d1edc552da738f0c26b67acc9fa15b961d0';

  const metadata = await loadMetadata(network as NetworkType, packageId);

  const privateKey = process.env.PRIVATE_KEY;

  const dubhe = new Dubhe({
    networkType: network as NetworkType,
    packageId: packageId,
    metadata: metadata,
    secretKey: privateKey,
  });

  console.log(dubhe.getAddress());

  const response2 = await dubhe.suiIndexerClient.getStorage({
    name: 'position',
    key1: '0x379aa1cc401f024e2fee2ea25bdb85e48355491bd6fcaf685e39a7fcc84b2101',
  });

  console.log(response2.edges[0].node);

  await dubhe.suiIndexerClient.subscribe(
    ['monster_catch_attempt_event', 'position'],
    (data) => {
      console.log(`Received message: ${data}`);
    }
  );

  //   console.log(JSON.stringify(response2, null, 2));
}

init();
