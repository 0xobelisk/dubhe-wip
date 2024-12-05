import fs from 'fs';
import { execSync } from 'child_process';
import chalk from 'chalk';
import {
	AccAddress,
	Dubhe,
	MsgPublish,
	NetworkType,
	Wallet,
} from '@0xobelisk/initia-client';
import { MoveBuilder } from '@initia/builder.js';
import { DubheCliError } from './errors';
import { saveContractData, validatePrivateKey } from './utils';
import { DubheConfig } from '@0xobelisk/sui-common';

export async function publishHandler(
	dubheConfig: DubheConfig,
	network: NetworkType
) {
	const privateKey = process.env.PRIVATE_KEY;
	if (!privateKey)
		throw new DubheCliError(
			`Missing PRIVATE_KEY environment variable.
  Run 'echo "PRIVATE_KEY=YOUR_PRIVATE_KEY" > .env'
  in your contracts directory to use the default initia private key.`
		);

	const privateKeyFormat = validatePrivateKey(privateKey);
	if (privateKeyFormat === false) {
		throw new DubheCliError(`Please check your privateKey.`);
	}

	const client = new Dubhe({
		networkType: network,
		secretKey: privateKeyFormat,
	});

	const path = process.cwd();
	const contractPath = `${path}/contracts/${dubheConfig.name}`;
	const builder = new MoveBuilder(contractPath, {
		addtionalNamedAddresses: [[dubheConfig.name, client.getHexAddress()]],
	});
	console.log('addtionalNamedAddresses: ', [
		[dubheConfig.name, client.getHexAddress()],
	]);

	try {
		await builder.build();
	} catch (error: any) {
		console.error(chalk.red('Error executing initia move build:'));
		console.error(error);
		process.exit(1); // You might want to exit with a non-zero status code to indicate an error
	}
	let packageId = '';
	let version = 0;

	// try {
	// const codeBytes = await builder.get(dubheConfig.name);

	const codeBytes = fs.readFileSync(
		`${path}/contracts/${dubheConfig.name}/build/${dubheConfig.name}/bytecode_modules/${dubheConfig.name}.mv`
	);
	const readWriteBytes = fs.readFileSync(
		`${path}/contracts/${dubheConfig.name}/build/${dubheConfig.name}/bytecode_modules/read_write.mv`
	);
	const decodedModule = await MoveBuilder.decode_module_bytes(codeBytes);
	console.log('decodedModule: ', decodedModule);
	const decodedReadWrite = await MoveBuilder.decode_module_bytes(
		readWriteBytes
	);
	console.log('decodedReadWrite: ', decodedReadWrite);
	const msgs = [
		new MsgPublish(client.getAddress(), [codeBytes.toString('base64')], 1),
	];
	console.log('MsgPublish Payload: ', msgs);

	// sign tx
	// send(broadcast) tx
	const wallet = new Wallet(client.client(), client.getSigner());
	console.log('wallet.key.accAddress', wallet.key.accAddress);
	console.log(
		'wallet account to hex',
		AccAddress.toHex(wallet.key.accAddress)
	);

	// sign tx
	const signedTx = await wallet.createAndSignTx({ msgs });
	// send(broadcast) tx
	client
		.client()
		.tx.broadcastSync(signedTx)
		.then(res => console.log(res));
	// const response = await client.signAndSendTxnWithPayload([payload]);
	// if (response. !== 0) {
	// 	throw new DubheCliError(`Publish failed: ${response.raw_log}`);
	// }

	// packageId = client.getHexAddress();
	// version = 1;
	// const txHash = response.txhash;
	// console.log(chalk.blue(`${dubheConfig.name} PackageId: ${packageId}`));
	// saveContractData(dubheConfig.name, network, packageId, version);
	// console.log(chalk.green(`Publish Transaction Digest: ${txHash}`));
	// } catch (error: any) {
	// 	console.error(chalk.red(`Failed to execute publish, please republish`));
	// 	console.error(error.message);
	// 	process.exit(1);
	// }
}
