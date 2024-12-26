import {
  Dubhe,
  NetworkType,
  TransactionArgument,
  loadMetadata,
  Transaction,
  DevInspectResults,
  bcs,
  TransactionResult,
} from '../src/index';
import * as process from 'process';
import dotenv from 'dotenv';
dotenv.config();

async function init() {
  const network = 'testnet';
  const packageId =
    '0xbd74c45b2ac7d4e4f7b5098363e90a1b991e1a869fb28b85b136d1324bd8f0bb';

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

  const EncounterObjectId =
    '0xcd822b37540b79e29d98bf6888f02f3ea8482defbbfb87d37dbd8fe238b2f947';
  const EntityObjectId =
    '0xccb580ee059f2b3bea3856389710779058e725d05a61ece1a847e1f7e4c289aa';
  const MapObjectId =
    '0x13a95017f8fe7a8274362ccbfca47163c2b765a401ff983b5819075faab65d7b';

  // const registerTx = new Transaction();
  // const registerCall = await dubhe.tx.map_system.register({
  //   tx: registerTx,
  //   params: [
  //     registerTx.object(MapObjectId),
  //     registerTx.object(EntityObjectId),
  //     registerTx.pure.u64(0),
  //     registerTx.pure.u64(0),
  //   ],
  // });
  // console.log(registerCall);

  const queryPointTx = new Transaction();
  const queryPointCall = (await dubhe.query.map_schema.get_position({
    tx: queryPointTx,
    params: [
      queryPointTx.object(MapObjectId),
      queryPointTx.pure.address(dubhe.getAddress()),
    ],
  })) as DevInspectResults;
  const queryPointRes = dubhe.view(queryPointCall);
  console.log(queryPointRes);

  const moveTx = new Transaction();
  const direction = (await dubhe.tx.map_direction.new_east({
    tx: moveTx,
    isRaw: true,
  })) as TransactionResult;
  const moveCall = await dubhe.tx.map_system.move_position({
    tx: moveTx,
    params: [
      moveTx.object(MapObjectId),
      moveTx.object(EntityObjectId),
      moveTx.object(EncounterObjectId),
      moveTx.object('0x8'),
      direction,
    ],
  });
  console.log(moveCall);

  const queryPointTx2 = new Transaction();
  const queryPointCall2 = (await dubhe.query.map_schema.get_position({
    tx: queryPointTx2,
    params: [
      queryPointTx2.object(MapObjectId),
      queryPointTx2.pure.address(dubhe.getAddress()),
    ],
  })) as DevInspectResults;
  const queryPointRes2 = dubhe.view(queryPointCall2);
  console.log(queryPointRes2);

  // const tx = new Transaction();
  // const query = (await dubhe.query.counter_system.get({
  //   tx,
  //   params: [tx.object(currencyObjectId)],
  // })) as DevInspectResults;
  // console.log(query);
  // const res = dubhe.view(query);
  // console.log(res);

  // const queryTx = new Transaction();

  // const schemaQuery = (await dubhe.query.counter_schema.borrow_value({
  //   tx: queryTx,
  //   params: [queryTx.object(currencyObjectId)],
  // })) as DevInspectResults;
  // const schemaRes = dubhe.view(schemaQuery);
  // console.log(JSON.stringify(schemaRes));

  // const databcs =
}

init();
