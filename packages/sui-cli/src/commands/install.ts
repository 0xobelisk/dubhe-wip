import type { CommandModule } from 'yargs';
import { execSync } from 'child_process';
import { DubheConfig, loadConfig } from '@0xobelisk/sui-common';
import {existsSync, writeFileSync} from 'fs';
import {homedir} from "node:os";
import {join} from "path";
import {readFileSync} from "node:fs";

type Options = {
	'config-path': string;
	network: any;
};

export function getRepoNameFromUrl(url: string): string {
	// Split the URL by '/' and filter out empty strings
	const parts = url.split('/').filter(part => part.length > 0);

	// Get the last part and remove any ${} syntax if present
	const lastPart = parts[parts.length - 1];
	return lastPart.replace(/^\${(.*)}$/, '$1');
}

export function generateCargoToml(
	dependencies: DubheConfig['dependencies'],
	projectName: string,
	network: 'mainnet' | 'testnet' | 'devnet' | 'localnet'
): string {
	let cargoToml = `[package]\nname = "${projectName}"\nversion = "1.0.0"\nedition = "2024"\n\n[dependencies]\n`;
	cargoToml += `Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "mainnet-v1.38.3" }\n`;

	if (network === 'localnet') {
		const dubhePath = `${homedir()}/.dubhe/dependencies/dubhe-framework`;
		cargoToml += `Dubhe = { local = "${dubhePath}" }\n`;

		dependencies.forEach(dep => {
			const repoName = getRepoNameFromUrl(dep.git);
			if (dep.name && dep.name.toLowerCase() === 'dubhe') {
				return;
			}

			let localPath = `${homedir()}/.dubhe/dependencies/${repoName}`;
			if (dep.subdir) {
				localPath += `/${dep.subdir}`;
			}
			const depName = dep.name || repoName;
			cargoToml += `${depName} = { local = "${localPath}" }\n`;

			const moveTomlPath = join(localPath, 'Move.toml');
			if (existsSync(moveTomlPath)) {
				try {
					let moveTomlContent = readFileSync(moveTomlPath, 'utf-8');
					const dubheRegex = /Dubhe\s*=\s*{[^}]*}/g;
					if (moveTomlContent.match(dubheRegex)) {
						moveTomlContent = moveTomlContent.replace(
							dubheRegex,
							`Dubhe = { local = "${dubhePath}" }`
						);
						writeFileSync(moveTomlPath, moveTomlContent, 'utf-8');
					}
				} catch (error) {
					console.error(`Failed to update Move.toml at ${moveTomlPath}: ${error}`);
				}
			}
		});
	} else {
		dependencies.forEach(dep => {
			const repoName = getRepoNameFromUrl(dep.git);
			const depName = dep.name || repoName;
			cargoToml += `${depName} = { git = "${dep.git}", rev = "${dep.rev}"`;
			if (dep.subdir) {
				cargoToml += `, subdir = "${dep.subdir}"`;
			}
			cargoToml += ` }\n`;
		});
	}
	cargoToml += `\n[addresses]\nsui = "0x2"\n${projectName} = "0x0"\n`;
	return cargoToml;
}

const commandModule: CommandModule<Options, Options> = {
	command: 'install',
	describe: 'Install a repository in Dubhe contracts',
	builder(yargs) {
		return yargs
			.options({
				'config-path': {
					type: 'string',
					default: 'dubhe.config.ts',
					description: 'Path to the configuration file',
				},
			}).options({
			'network': {
				type: 'string',
				default: 'localnet',
				description: 'Path to the configuration file',
			},
		});

	},
	async handler({ 'config-path': configPath, network }) {
		try {
			const dubheConfig = (await loadConfig(configPath)) as DubheConfig;
			await dubheInstall(dubheConfig, network);
		} catch (error: any) {
			console.error(`Error installing repository: ${error.message}`);
			process.exit(1);
		}
	},
};

export async function dubheInstall(dubheConfig: DubheConfig, network: 'mainnet' | 'testnet' | 'devnet' | 'localnet') {
	dubheConfig.dependencies.forEach(dependency => {
		const projectName = getRepoNameFromUrl(dependency.git);
		const dependencyPath = join(homedir(), '.dubhe', 'dependencies', projectName);
		if (!existsSync(dependencyPath)) {
			console.log(`🚀 Installing repository: ${dependency.git}`);
			const command = `git clone --depth 1 --branch ${dependency.rev} ${dependency.git} ${dependencyPath}`;
			execSync(command, { stdio: 'inherit', encoding: 'utf-8' });
		}
	});
	const cargoTomlContent = generateCargoToml(dubheConfig.dependencies, dubheConfig.name, network);
	const projectPath = `${process.cwd()}/contracts/${dubheConfig.name}/Move.toml`;
	writeFileSync(projectPath, cargoTomlContent, { encoding: 'utf-8' });
}

export default commandModule;