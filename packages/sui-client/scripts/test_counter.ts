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
    '0xc9d149ec1db334d024f05de3558d2d6fe1bf7d931297ddcac3d7a2db0484108e';

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
    '0xeb2f3c1821bdb0aa5a6656a7b69c6dd820fe1aead9bc246f1f5c0b48ae78a1bb';

  const tx = new Transaction();
  const query = (await dubhe.query.counter_system.get({
    tx,
    params: [tx.object(currencyObjectId)],
  })) as DevInspectResults;
  console.log(query);
  const res = dubhe.view(query);
  console.log(res);

  const queryTx = new Transaction();

  const schemaQuery = (await dubhe.query.counter_schema.borrow_value({
    tx: queryTx,
    params: [queryTx.object(currencyObjectId)],
  })) as DevInspectResults;
  const schemaRes = dubhe.view(schemaQuery);
  console.log(JSON.stringify(schemaRes));

  // const databcs =
}

init();
