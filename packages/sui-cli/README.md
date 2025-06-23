## The Dubhe CLI

The Dubhe CLI is used for building and developing a Dubhe project.

It comes with

1. `schemagen`: Autogenerate Dubhe schemas based on the store schemas config file
2. `publish`: Deploy your own project on the specified sui network.
3. `upgrade`: Upgrade your own project on the specified sui network.
4. `localnode`: Start a local Sui node for development
5. `faucet`: An interface to the Devnet/Localnet faucet. It makes it easy to fund addresses on the Devnet/localnet

## Installation

We don't recommend installing the CLI globally.

Instead, you should add the CLI as a dev dependency to your project (done automatically if you start from a starter kit using `pnpm create dubhe`), and use it with `pnpm build` inside your project directory.

## Using the CLI

Some commands expect a Dubhe config in the same folder where the CLI is being executed. This includes `schemagen` and `publish`.

`faucet`, and `localnode` can be executed anywhere.

## Commands

### `schemagen`

Generates Store libraries from a `dubhe.config.ts` file. See the [Store Config and `schemagen` documentation](../schemas/config) in the Store section for more details.

```bash
# in a folder with a dubhe.config.ts
dubhe schemagen --config-path dubhe.config.ts
```

### `publish`

Deploy a Dubhe contract project with the dubhe framework.

This tool will use the `dubhe.config.ts` to detect all systems, schemas and projectName in the project and will deploy them to the chain specified.

When using the deployer, you must set the private key of the deployer using the `PRIVATE_KEY` environment variable. You can make this easier by using [`dotenv`](https://www.npmjs.com/package/dotenv) before running `dubhe publish` in your deployment script.

To set up the target network for deploying the contract (mainnet/testnet/devnet/localnet), before deploying the contract, please make sure that you have some tokens in your account, which will be used for some fees when deploying the contract. (If you choose devnet/localnet, you can get some test tokens via `dubhe faucet`), if you need to deploy the contract on localnet, please make sure you have started localnode.

```bash
# to deploy sui locally
dubhe publish --network localnet
# to deploy to sui devnet
dubhe publish --network devnet
# to deploy to sui testnet
dubhe publish --network testnet
# to deploy to sui mainnet
dubhe publish --network mainnet
```

### `upgrade`

Upgrade Dubhe contract project.

When you add a new schema or modify the system code, you need to upgrade the contract through the `upgrade` method. ([Contract upgrade specification](../migrating-from-others))

```bash
dubhe upgrade --network <network:mainnet/testnet/devnet/localnet>
```

### `localnode`

The localnode uses the official `sui-test-validator` binary provided by sui to start the localnode.

The local rpc is `http://127.0.0.1:9000`

```bash
dubhe localnode
```

### `faucet`

Connects to a Dubhe faucet service to fund an address.

```bash
dubhe faucet --network <network:devnet/localnet>
dubhe faucet --network <network:devnet/localnet> --recipient <address>
```

The default faucet service automatically gives test tokens to accounts in [`dotenv`](https://www.npmjs.com/package/dotenv).

To fund an address on the devnet/localnet, run `dubhe faucet --recipient <address>`

## @0xobelisk/sui-cli

用于与 Move ECS 框架交互的工具包。

## 安装

```bash
npm install -g @0xobelisk/sui-cli
```

## 环境检查

使用 `doctor` 命令检查和设置开发环境：

```bash
# 检查开发环境
dubhe doctor

# 自动安装 Sui CLI
dubhe doctor --install sui

# 自动安装 Dubhe Indexer
dubhe doctor --install dubhe-indexer

# 选择特定版本安装
dubhe doctor --install sui --select-version
dubhe doctor --install dubhe-indexer --select-version
```

### 支持的平台

- **操作系统**: macOS, Windows, Linux (Ubuntu)
- **架构**: x86_64 (amd64), ARM64 (aarch64)

### 自动安装功能

Doctor 命令现在支持自动下载和安装以下工具：

- **Sui CLI**: 从 [MystenLabs/sui](https://github.com/MystenLabs/sui) 自动下载
- **Dubhe Indexer**: 从 [0xobelisk/dubhe-wip](https://github.com/0xobelisk/dubhe-wip) 自动下载

当检测到工具未安装时，doctor 会提供自动安装建议。工具会被安装到 `~/.local/bin` 目录，如果该目录不在 PATH 中，会提供相应的配置指导。

### 版本选择

使用 `--select-version` 选项可以选择特定版本进行安装：

- 系统会列出最近 5 个兼容当前系统的版本
- 自动处理缺失某些平台二进制文件的版本
- 支持交互式版本选择界面

## 其他功能

... (其他现有功能的文档)
