import {
  Dubhe,
  loadMetadata,
  NetworkType,
  SuiTransactionBlockResponse,
  Transaction
} from '@0xobelisk/sui-client';
import dotenv from 'dotenv';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(dubhe: Dubhe, dappHubId: string) {
  const resourceTx = new Transaction();

  const resourceTxResp = (await dubhe.tx.example_system.resources({
    tx: resourceTx,
    params: [resourceTx.object(dappHubId)]
  })) as SuiTransactionBlockResponse;
  console.log('resourceTx digest', resourceTxResp.digest);

  // await dubhe.waitForTransaction(resourceTxResp.digest);

  await delay(1000);
  const componentTx = new Transaction();

  const componentTxResp = (await dubhe.tx.example_system.components({
    tx: componentTx,
    params: [componentTx.object(dappHubId)]
  })) as SuiTransactionBlockResponse;
  console.log('componentTx digest', componentTxResp.digest);

  // await dubhe.waitForTransaction(componentTxResp.digest);
}

async function main() {
  dotenv.config();
  const network = 'localnet';
  const packageId = '0xd584eac8d8c1971973a2d70792e4eca0547e5e8c8de51c1ef7880ec87bb805ae'; // TODO: set packageId
  const dappHubId = '0x29f5a6bac12a06f7e1a382a97e6e0addb11ef8493f804f63f810f6825a7d6a9f'; // TODO: set dappHubId

  const metadata = await loadMetadata(network as NetworkType, packageId);

  const privateKey = process.env.PRIVATE_KEY;

  const dubhe = new Dubhe({
    networkType: network as NetworkType,
    packageId: packageId,
    metadata: metadata,
    secretKey: privateKey
  });

  console.log(dubhe.getAddress());
  let balance = await dubhe.getBalance();
  console.log('balance', balance);

  let i = 0;

  while (true) {
    console.log(`call ${i++}...`);
    await call(dubhe, dappHubId);
    await delay(1000);
  }
}

main();
