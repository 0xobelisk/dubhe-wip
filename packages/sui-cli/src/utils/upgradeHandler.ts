// import { Transaction, UpgradePolicy } from '@0xobelisk/sui-client';
// import { execSync } from 'child_process';
// import chalk from 'chalk';
// import { UpgradeError } from './errors';
// import {
//   getOldPackageId,
//   getVersion,
//   getUpgradeCap,
//   saveContractData,
//   getOnchainSchemas,
//   switchEnv,
//   getSchemaId,
//   getDubheSchemaId,
//   initializeDubhe
// } from './utils';
// import * as fs from 'fs';
// import * as path from 'path';
// import { DubheConfig } from '@0xobelisk/sui-common';

// type Migration = {
//   schemaName: string;
//   fields: string;
// };

// function updateMigrateMethod(projectPath: string, migrations: Migration[]): void {
//   let filePath = `${projectPath}/sources/codegen/core/schema.move`;
//   const fileContent = fs.readFileSync(filePath, 'utf-8');
//   const migrateMethodRegex = new RegExp(
//     `public fun migrate\\(_schema: &mut Schema, _ctx: &mut TxContext\\) {[^}]*}`
//   );
//   const newMigrateMethod = `
// public fun migrate(_schema: &mut Schema, _ctx: &mut TxContext) {
// ${migrations
//   .map((migration) => {
//     let storage_type = '';
//     if (migration.fields.includes('StorageValue')) {
//       storage_type = `storage_value::new(b"${migration.schemaName}", _ctx)`;
//     } else if (migration.fields.includes('StorageMap')) {
//       storage_type = `storage_map::new(b"${migration.schemaName}", _ctx)`;
//     } else if (migration.fields.includes('StorageDoubleMap')) {
//       storage_type = `storage_double_map::new(b"${migration.schemaName}", _ctx)`;
//     }
//     return `storage::add_field<${migration.fields}>(&mut _schema.id, b"${migration.schemaName}", ${storage_type});`;
//   })
//   .join('')}
// }
// `;

//   const updatedContent = fileContent.replace(migrateMethodRegex, newMigrateMethod);
//   fs.writeFileSync(filePath, updatedContent, 'utf-8');
// }

// function replaceEnvField(
//   filePath: string,
//   networkType: 'mainnet' | 'testnet' | 'devnet' | 'localnet',
//   field: 'original-published-id' | 'latest-published-id' | 'published-version',
//   newValue: string
// ): string {
//   const envFilePath = path.resolve(filePath);
//   const envContent = fs.readFileSync(envFilePath, 'utf-8');
//   const envLines = envContent.split('\n');

//   const networkSectionIndex = envLines.findIndex((line) => line.trim() === `[env.${networkType}]`);
//   if (networkSectionIndex === -1) {
//     console.log(`Network type [env.${networkType}] not found in the file.`);
//     return '';
//   }

//   let fieldIndex = -1;
//   let previousValue: string = '';
//   for (let i = networkSectionIndex + 1; i < envLines.length; i++) {
//     const line = envLines[i].trim();
//     if (line.startsWith('[')) break; // End of the current network section

//     if (line.startsWith(field)) {
//       fieldIndex = i;
//       previousValue = line.split('=')[1].trim().replace(/"/g, '');
//       break;
//     }
//   }

//   if (fieldIndex !== -1) {
//     envLines[fieldIndex] = `${field} = "${newValue}"`;
//     const newEnvContent = envLines.join('\n');
//     fs.writeFileSync(envFilePath, newEnvContent, 'utf-8');
//   } else {
//     console.log(`${field} not found for [env.${networkType}].`);
//   }

//   return previousValue;
// }
// export async function upgradeHandler(
//   config: DubheConfig,
//   name: string,
//   network: 'mainnet' | 'testnet' | 'devnet' | 'localnet'
// ) {
//   await switchEnv(network);

//   const path = process.cwd();
//   const projectPath = `${path}/src/${name}`;

//   const dubhe = initializeDubhe({
//     network
//   });

//   let oldVersion = Number(await getVersion(projectPath, network));
//   let oldPackageId = await getOldPackageId(projectPath, network);
//   let upgradeCap = await getUpgradeCap(projectPath, network);
//   let schemaId = await getSchemaId(projectPath, network);

//   const original_published_id = replaceEnvField(
//     `${projectPath}/Move.lock`,
//     network,
//     'original-published-id',
//     '0x0000000000000000000000000000000000000000000000000000000000000000'
//   );

//   let pendingMigration: Migration[] = [];
//   let schemas = await getOnchainSchemas(projectPath, network);
//   Object.entries(config.schemas).forEach(([key, value]) => {
//     if (!schemas.hasOwnProperty(key)) {
//       pendingMigration.push({ schemaName: key, fields: value });
//     }
//   });
//   updateMigrateMethod(projectPath, pendingMigration);

//   try {
//     let modules: any, dependencies: any, digest: any;
//     try {
//       const {
//         modules: extractedModules,
//         dependencies: extractedDependencies,
//         digest: extractedDigest
//       } = JSON.parse(
//         execSync(`sui move build --dump-bytecode-as-base64 --path ${path}/src/${name}`, {
//           encoding: 'utf-8'
//         })
//       );

//       modules = extractedModules;
//       dependencies = extractedDependencies;
//       digest = extractedDigest;
//     } catch (error: any) {
//       throw new UpgradeError(error.stdout);
//     }

//     console.log('\n🚀 Starting Upgrade Process...');
//     console.log('📋 OldPackageId:', oldPackageId);
//     console.log('📋 UpgradeCap Object Id:', upgradeCap);
//     console.log('📋 OldVersion:', oldVersion);

//     const tx = new Transaction();
//     const ticket = tx.moveCall({
//       target: '0x2::package::authorize_upgrade',
//       arguments: [
//         tx.object(upgradeCap),
//         tx.pure.u8(UpgradePolicy.COMPATIBLE),
//         tx.pure.vector('u8', digest)
//       ]
//     });

//     const receipt = tx.upgrade({
//       modules,
//       dependencies,
//       package: oldPackageId,
//       ticket
//     });

//     tx.moveCall({
//       target: '0x2::package::commit_upgrade',
//       arguments: [tx.object(upgradeCap), receipt]
//     });

//     const result = await dubhe.signAndSendTxn({
//       tx,
//       onSuccess: (result) => {
//         console.log(chalk.green(`Upgrade Transaction Digest: ${result.digest}`));
//       },
//       onError: (error) => {
//         console.log(chalk.red('Upgrade Transaction failed!'));
//         console.error(error);
//       }
//     });

//     let newPackageId = '';
//     result.objectChanges!.map((object) => {
//       if (object.type === 'published') {
//         console.log(chalk.blue(`${name} new PackageId: ${object.packageId}`));
//         console.log(chalk.blue(`${name} new Version: ${oldVersion + 1}`));
//         newPackageId = object.packageId;
//       }
//     });

//     replaceEnvField(
//       `${projectPath}/Move.lock`,
//       network,
//       'original-published-id',
//       original_published_id
//     );
//     replaceEnvField(`${projectPath}/Move.lock`, network, 'latest-published-id', newPackageId);
//     replaceEnvField(`${projectPath}/Move.lock`, network, 'published-version', oldVersion + 1 + '');

//     saveContractData(
//       name,
//       network,
//       newPackageId,
//       schemaId,
//       upgradeCap,
//       oldVersion + 1,
//       config.schemas
//     );

//     console.log(`\n🚀 Starting Migration Process...`);
//     pendingMigration.forEach((migration) => {
//       console.log('📋 Added Fields:', JSON.stringify(migration, null, 2));
//     });
//     await new Promise((resolve) => setTimeout(resolve, 5000));

//     const migrateTx = new Transaction();
//     const newVersion = oldVersion + 1;
//     let args = [];
//     if (name !== 'dubhe') {
//       let dubheSchemaId = await getDubheSchemaId(network);
//       args.push(migrateTx.object(dubheSchemaId));
//     }
//     args.push(migrateTx.object(schemaId));
//     args.push(migrateTx.pure.address(newPackageId));
//     args.push(migrateTx.pure.u32(newVersion));
//     migrateTx.moveCall({
//       target: `${newPackageId}::${name}_migrate::migrate_to_v${newVersion}`,
//       arguments: args
//     });

//     await dubhe.signAndSendTxn({
//       tx: migrateTx,
//       onSuccess: (result) => {
//         console.log(chalk.green(`Migration Transaction Digest: ${result.digest}`));
//       },
//       onError: (error) => {
//         console.log(
//           chalk.red('Migration Transaction failed!, Please execute the migration manually.')
//         );
//         console.error(error);
//       }
//     });
//   } catch (error: any) {
//     console.log(chalk.red('upgrade handler execution failed!'));
//     console.error(error.message);
//   }
// }
