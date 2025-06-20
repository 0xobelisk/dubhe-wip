import {DubheConfig } from '@0xobelisk/sui-common';

export const dubheConfig = {
    name: 'dubhe',
    description: 'Dubhe Protocol',
    enums: {
        AccountStatus: ['Liquid', 'Frozen', 'Blocked'],
        AssetStatus: ['Liquid', 'Frozen'],
        AssetType: ['Lp', 'Wrapped', 'Private', 'Package'],
    },
    resources: {
        dapp_metadata: {
            fields: {
                dapp_key: 'vector<u8>',
                name: 'vector<u8>',
                description: 'vector<u8>',
                website_url: 'vector<u8>',
                cover_urls: 'vector<vector<u8>>',
                partners: 'vector<vector<u8>>',
                package: 'address',
                created_at: 'u64',
                version: 'u32'
            },
            keys: ['dapp_key']
        },
        dubhe_config: {
            fields: {
                next_asset_id: 'u256',
                swap_fee: 'u256',
                fee_to: 'address',
                max_swap_path_len: 'u64',
            }
        },
        asset_metadata: {
            fields: {
                asset_id: 'address',
                // The user friendly name of this asset. Limited in length by `StringLimit`.
                name: 'vector<u8>',
                // The ticker symbol for this asset. Limited in length by `StringLimit`.
                symbol: 'vector<u8>',
                // A short description of this asset.
                description: 'vector<u8>',
                // The number of decimals this asset uses to represent one unit.
                decimals: 'u8',
                // Asset icon url 
                icon_url: 'vector<u8>',
                // Can change `owner`, `issuer`, `freezer` and `admin` accounts.
                owner: 'address',
                // The total supply across all accounts.
                supply: 'u256',
                // The total number of accounts.
                accounts: 'u256',
                // The status of the asset
                status: 'AssetStatus',
                // Whether the asset is mintable.
                is_mintable: 'bool',
                // Whether the asset is burnable.
                is_burnable: 'bool',
                // Whether the asset is freezable.
                is_freezable: 'bool',
                // The type of the asset.
                asset_type: 'AssetType',
            },
            keys: ['asset_id']
        }, 
        asset_account: {
            fields: {
                asset_id: 'address',
                account: 'address',
                balance: 'u256',
                status: 'AccountStatus'
            },
            keys: ['asset_id', 'account']
        },
        asset_pools: {
            fields: {
                asset0: 'address',
                asset1: 'address',
                pool_address: 'address',
                lp_asset: 'address',
                reserve0: 'u128',
                reserve1: 'u128',
                k_last: 'u256'
            },
            keys: ['asset0', 'asset1']
        },
        bridge: {
            fields: {
                chain: 'vector<u8>',
                min_amount: 'u256',
                fee: 'u256',
                opened: 'bool'
            },
            keys: ['chain']
        },
        wrapper_assets: {
            fields: {
                coin_type: 'vector<u8>',
                asset_id: 'address',
            },
            keys: ['coin_type']    
        },
        // dapp_admin: 'address',
    },
    components: { },
     errors: {
        asset_not_found: "Asset not found",
        asset_already_frozen: "Asset already frozen",
        asset_not_liquid: "Asset not liquid",
        asset_not_frozen: "Asset not frozen",
        invalid_sender: "Invalid sender",
        invalid_receiver: "Invalid receiver",
        invalid_metadata: "Invalid metadata",
        account_not_found: "Account not found",
        account_blocked: "Account is blocked",
        account_frozen: "Account is frozen",
        balance_too_low: "Balance too low",
        overflows: "Operation overflows",
        no_permission: "No permission",
        not_mintable: "Asset is not mintable",
        not_burnable: "Asset is not burnable",
        not_freezable: "Asset is not freezable",
        pool_already_exists: "Pool already exists",
        below_min_amount: "Amount is below minimum",
        below_min_liquidity: "Amount is below liquidity",
        liquidity_cannot_be_zero: "Liquidity cannot be 0",
        pool_not_found: "Pool not found",
        more_than_max_swap_path_len: "More than Max",
        more_than_reserve: "More than reserve",
        swap_path_too_small: "Swap path too small",
        reserves_cannot_be_zero: "Reserve cannot be 0",
        amount_cannot_be_zero: "Amount cannot be 0",
        less_than_amount_out_min: "Less than expected",
        more_than_amount_in_max: "More than expected",
        chain_not_supported: "Chain not supported",
        bridge_not_opened: "Bridge is not opened",
        below_min_bridge_amount: "Amount is below minimum",
        not_dapp_admin: "Not dapp admin",
        not_dapp_latest_version: "Not dapp latest version",
        not_dapp_pausable: "Dapp is not pausable",
        dapp_already_exists: "Dapp already exists",
    },
} as DubheConfig;