import { Dubhe } from '@0xobelisk/sui-client';
import * as fs from 'fs';
import chalk from 'chalk';

export async function generateAccountHandler(
	force: boolean = false,
	outputTsPath: string
) {
	const path = process.cwd();
	let privateKey: string;

	if (force) {
		const dubhe = new Dubhe();
		const keypair = dubhe.getKeypair();
		privateKey = keypair.getSecretKey();

		fs.writeFileSync(`${path}/.env`, `PRIVATE_KEY=${privateKey}`);
		console.log(chalk.green(`File created at: ${path}/.env`));

		if (outputTsPath) {
			const dir = outputTsPath.substring(
				0,
				outputTsPath.lastIndexOf('/')
			);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(
				outputTsPath,
				`export const PRIVATEKEY = '${privateKey}';
export const ACCOUNT = '${keypair.toSuiAddress()}';
`
			);
			console.log(chalk.green(`File created at: ${outputTsPath}`));
		}

		console.log(
			chalk.blue(`Force generate new Account: ${keypair.toSuiAddress()}`)
		);
		return;
	}

	// Check if .env file exists and has content
	try {
		const envContent = fs.readFileSync(`${path}/.env`, 'utf8');
		const match = envContent.match(/PRIVATE_KEY=(.+)/);
		if (match && match[1]) {
			privateKey = match[1];
			const dubhe = new Dubhe({ secretKey: privateKey });
			const keypair = dubhe.getKeypair();

			if (outputTsPath) {
				const dir = outputTsPath.substring(
					0,
					outputTsPath.lastIndexOf('/')
				);
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}
				fs.writeFileSync(
					outputTsPath,
					`export const PRIVATEKEY = '${privateKey}';
export const ACCOUNT = '${keypair.toSuiAddress()}';
`
				);
				console.log(chalk.green(`File created at: ${outputTsPath}`));
			}

			console.log(
				chalk.blue(`Using existing Account: ${keypair.toSuiAddress()}`)
			);
			return;
		}
	} catch (error) {
		// .env file doesn't exist or failed to read, continue to generate new account
	}

	// If no existing private key, generate new account
	const dubhe = new Dubhe();
	const keypair = dubhe.getKeypair();
	privateKey = keypair.getSecretKey();
	fs.writeFileSync(`${path}/.env`, `PRIVATE_KEY=${privateKey}`);
	console.log(chalk.green(`File created at: ${path}/.env`));

	if (outputTsPath) {
		const dir = outputTsPath.substring(0, outputTsPath.lastIndexOf('/'));
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(
			outputTsPath,
			`export const PRIVATEKEY = '${privateKey}';
export const ACCOUNT = '${keypair.toSuiAddress()}';
`
		);
		console.log(chalk.green(`File created at: ${outputTsPath}`));
	}

	console.log(chalk.blue(`Generate new Account: ${keypair.toSuiAddress()}`));
}
