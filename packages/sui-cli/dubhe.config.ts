import { DubheConfig } from '@0xobelisk/sui-common';

export const dubheConfig = {
	name: 'merak',
	description: 'Merak Protocol',
	schemas: {
		assets: {
			data: [
				{
					name: 'AccountStatus',
					fields: ['Liquid', 'Frozen', 'Blocked'],
				},
				{
					name: 'Status',
					fields: ['Live', 'Frozen', 'Destroying'],
				},
				{
					name: 'Account',
					fields: { balance: 'u256', status: 'AccountStatus' },
				},
				{
					name: 'Metadata',
					fields: {
						// The user friendly name of this asset. Limited in length by `StringLimit`.
						name: 'String',
						// The ticker symbol for this asset. Limited in length by `StringLimit`.
						symbol: 'String',
						// A short description of this asset.
						description: 'String',
						// The number of decimals this asset uses to represent one unit.
						decimals: 'u8',
						// Asset icon url
						url: 'String',
						// Extra information about this asset. Generally used for display purposes.
						info: 'String',
					},
				},
				{
					name: 'Details',
					fields: {
						// Can change `owner`, `issuer`, `freezer` and `admin` accounts.
						owner: 'address',
						// The total supply across all accounts.
						supply: 'u256',
						// The total number of accounts.
						accounts: 'u32',
						// The total number of approvals.
						approvals: 'u32',
						// The status of the asset
						status: 'Status',
						// Whether the asset is mintable.
						is_mintable: 'bool',
						// Whether the asset is burnable.
						is_burnable: 'bool',
						// Whether the asset is freezable.
						is_freezable: 'bool',
					},
				},
			],
			structure: {
				next_asset_id: 'StorageValue<u32>',
				metadata: 'StorageMap<u32, Metadata>',
				details: 'StorageMap<u32, Details>',
				account: 'StorageDoubleMap<u32, address, Account>',
			},
			events: [
				{
					name: 'Created',
					fields: {
						asset_id: 'u32',
						name: 'String',
						symbol: 'String',
						owner: 'address',
						is_mintable: 'bool',
						is_burnable: 'bool',
						is_freezable: 'bool',
					},
				},
				{
					name: 'Minted',
					fields: {
						asset_id: 'u32',
						to: 'address',
						amount: 'u256',
					},
				},
				{
					name: 'Burned',
					fields: {
						asset_id: 'u32',
						from: 'address',
						amount: 'u256',
					},
				},
				{
					name: 'Transferred',
					fields: {
						asset_id: 'u32',
						from: 'address',
						to: 'address',
						amount: 'u256',
					},
				},
				{
					name: 'FrozenAddress',
					fields: {
						asset_id: 'u32',
						owner: 'address',
					},
				},
				{
					name: 'BlockedAddress',
					fields: {
						asset_id: 'u32',
						owner: 'address',
					},
				},
				{
					name: 'ThawedAddress',
					fields: {
						asset_id: 'u32',
						owner: 'address',
					},
				},
				{
					name: 'FrozenAsset',
					fields: {
						asset_id: 'u32',
					},
				},
				{
					name: 'ThawedAsset',
					fields: {
						asset_id: 'u32',
					},
				},
				{
					name: 'OwnershipTransferred',
					fields: {
						asset_id: 'u32',
						from: 'address',
						to: 'address',
					},
				},
			],
			errors: [
				{ name: 'AccountNotFound', code: 0 },
				{ name: 'AssetNotFound', code: 1 }
			]
		},
		dex: {
			data: [
				{
					name: 'Pool',
					fields: {
						pool_id: 'u32',
						pool_address: 'address',
						lp_asset_id: 'u32',
						asset1_id: 'u32',
						asset2_id: 'u32',
					},
				},
				{
					name: 'PathElement',
					fields: {
						asset_id: 'u32',
						balance: 'u256',
					},
				},
			],
			structure: {
				next_pool_id: 'StorageValue<u32>',
				swap_fee: 'StorageValue<u256>',
				lp_fee: 'StorageValue<u256>',
				fee_to: 'StorageValue<address>',
				max_swap_path_len: 'StorageValue<u8>',
				min_liquidity: 'StorageValue<u256>',
				pool_id: 'StorageDoubleMap<u32, u32, u32>',
				pools: 'StorageMap<u32, Pool>',
			},
			events: [
				{
					name: 'PoolCreated',
					fields: {
						creator: 'address',
						pool_id: 'u32',
						pool_address: 'address',
						asset1_id: 'u32',
						asset2_id: 'u32',
						lp_asset_id: 'u32',
						lp_asset_symbol: 'String',
					},
				},
				{
					name: 'LiquidityAdded',
					fields: {
						who: 'address',
						pool_id: 'u32',
						asset1_amount: 'u256',
						asset2_amount: 'u256',
						lp_asset_id: 'u32',
						lp_asset_minted: 'u256',
					},
				},
				{
					name: 'LiquidityRemoved',
					fields: {
						who: 'address',
						pool_id: 'u32',
						asset1_amount: 'u256',
						asset2_amount: 'u256',
						lp_asset_id: 'u32',
						lp_asset_burned: 'u256',
					},
				},
				{
					name: 'SwapExecuted',
					fields: {
						who: 'address',
						send_to: 'address',
						amount_in: 'u256',
						amount_out: 'u256',
						path: 'vector<u32>',
					},
				},
				{
					name: 'Registered',
					fields: {
						who: 'address',
						asset_id: 'u32',
					},
				},
				{
					name: 'Wrapped',
					fields: {
						from: 'address',
						asset_id: 'u32',
						amount: 'u256',
						beneficiary: 'address',
					},
				},
				{
					name: 'Unwrapped',
					fields: {
						from: 'address',
						asset_id: 'u32',
						amount: 'u256',
						beneficiary: 'address',
					},
				},
			],
		},
		counter: {
			structure: {
				value: 'StorageValue<u32>',
				value1: 'StorageValue<u32>',
			},
		},
	},
} as DubheConfig;
