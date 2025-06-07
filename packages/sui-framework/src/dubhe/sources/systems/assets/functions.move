module dubhe::dubhe_assets_functions {
    use std::u256;
    use std::ascii::String;
    use std::ascii::string;
    use std::type_name;
    use dubhe::dubhe_account_status;
    use dubhe::dubhe_asset_account;
    use dubhe::dubhe_entity_id::asset_to_entity_id;
    use dubhe::dubhe_asset_status;
    use dubhe::dubhe_asset_metadata;
    use dubhe::dubhe_asset_type::AssetType;
    use dubhe::dubhe_errors::{
        account_blocked_error, overflows_error, 
        asset_not_found_error,
        account_not_found_error, account_frozen_error, balance_too_low_error,
        invalid_receiver_error, invalid_sender_error, asset_already_frozen_error
    };
    use dubhe::dapp_hub::DappHub;
    use dubhe::dubhe_config;

    public(package) fun do_create(
        dapp_hub: &mut DappHub,
        asset_type: AssetType,
        owner: address,
        name: vector<u8>,
        symbol: vector<u8>,
        description: vector<u8>,
        decimals: u8,
        icon_url: vector<u8>,
        is_mintable: bool,
        is_burnable: bool,
        is_freezable: bool,
    ): address {
        let asset_id = dubhe_config::get_next_asset_id(dapp_hub);
        let entity_id = asset_to_entity_id(name, asset_id);
        let supply = 0;
        let accounts = 0;
        let status = dubhe_asset_status::new_liquid();
        // set the assets metadata
        dubhe_asset_metadata::set(
            dapp_hub, 
            entity_id, 
            name, 
            symbol, 
            description, 
            decimals, 
            icon_url, 
            owner, 
            supply, 
            accounts, 
            status, 
            is_mintable, 
            is_burnable, 
            is_freezable, 
            asset_type
        );

        // Increment the asset ID
        dubhe_config::set_next_asset_id(dapp_hub, asset_id + 1);
        entity_id
    }

    public(package) fun do_mint(dapp_hub: &mut DappHub, asset_id: address, to: address, amount: u256) {
        invalid_receiver_error(to != @0xdead);
        update(dapp_hub, asset_id, @0xfeed, to, amount);
    }

    public(package) fun do_burn(dapp_hub: &mut DappHub, asset_id: address, from: address, amount: u256) {
        invalid_sender_error(from != @0xfeed);
        update(dapp_hub, asset_id, from, @0xdead, amount);
    }

    public(package) fun do_transfer(dapp_hub: &mut DappHub, asset_id: address, from: address, to: address, amount: u256) {
        invalid_sender_error(from != @0xfeed);
        invalid_receiver_error(to != @0xdead);
        update(dapp_hub, asset_id, from, to, amount);
    }


    public(package) fun update(dapp_hub: &mut DappHub, asset_id: address, from: address, to: address, amount: u256) {        
        asset_not_found_error(dubhe_asset_metadata::has(dapp_hub, asset_id));
        let asset_metadata = dubhe_asset_metadata::get_struct(dapp_hub, asset_id);
        if( from == @0xfeed ) {
            // Overflow check required: The rest of the code assumes that totalSupply never overflows
            overflows_error(amount <= u256::max_value!() - asset_metadata.supply());
            // supply += amount;
            let supply = asset_metadata.supply();
            dubhe_asset_metadata::set_supply(dapp_hub, asset_id, supply + amount);
        } else {
            // asset already frozen
            asset_already_frozen_error(asset_metadata.status() != dubhe_asset_status::new_frozen());
            account_not_found_error(dubhe_asset_account::has(dapp_hub, asset_id, from));
            let (balance, status) = dubhe_asset_account::get(dapp_hub, asset_id, from);
            balance_too_low_error(balance >= amount);
            account_frozen_error(status != dubhe_account_status::new_frozen());
            account_blocked_error(status != dubhe_account_status::new_blocked());
            // balance -= amount;
            if (balance == amount) {
                let accounts = asset_metadata.accounts();
                dubhe_asset_metadata::set_accounts(dapp_hub, asset_id, accounts - 1);
                dubhe_asset_account::delete(dapp_hub, asset_id, from);
            } else {
                dubhe_asset_account::set_balance(dapp_hub, asset_id, from, balance - amount);
            }
        };

        if(to == @0xdead) {
            // Overflow not possible: value <= totalSupply or value <= fromBalance <= totalSupply.
            // supply -= amount;
            let supply = asset_metadata.supply();
            dubhe_asset_metadata::set_supply(dapp_hub, asset_id, supply - amount);
        } else {
            if(dubhe_asset_account::has(dapp_hub, asset_id, to)) {
                let (balance, status) = dubhe_asset_account::get(dapp_hub, asset_id, to);
                account_blocked_error(status != dubhe_account_status::new_blocked());
                dubhe_asset_account::set_balance(dapp_hub, asset_id, to, balance + amount);
            } else {
                let accounts = asset_metadata.accounts();
                dubhe_asset_metadata::set_accounts(dapp_hub, asset_id, accounts + 1);
                dubhe_asset_account::set(dapp_hub, asset_id, to, amount, dubhe_account_status::new_liquid());
            }
        };
    }

    // public(package) fun add_package_asset<DappKey: drop>(dapp_hub: &mut DappHub, asset_id: address) {
    //     let package_assets = custom_schema::package_assets(dapp_hub);
    //     package_assets.add(AssetsDappKey<DappKey>{ asset_id }, true);
    //     let dapp_key = type_name::get<DappKey>().into_string();
    //     dubhe::storage_event::emit_set_record<String, u256, bool>(
    //         string(b"package_assets"), 
    //         option::some(dapp_key), 
    //         option::some(asset_id), 
    //         option::some(true)
    //     );
    // }

    // public(package) fun is_package_asset<DappKey: drop>(dapp_hub: &mut DappHub, asset_id: address): bool {
    //     let package_assets = custom_schema::package_assets(dapp_hub);
    //     package_assets.contains(AssetsDappKey<DappKey>{ asset_id })
    // }

    // public(package) fun assert_asset_is_package_asset<DappKey: drop>(dapp_hub: &mut DappHub, asset_id: address) {
    //     if(!is_package_asset<DappKey>(dapp_hub, asset_id)) {
    //         asset_not_found_error(false);
    //     }
    // }

    // public(package) fun charge_set_fee<DappKey: copy + drop>(dapp_hub: &mut DappHub) {
    //     let package_id = dubhe::type_info::get_package_id<DappKey>();
    //     let mut dapp_stats = dapp_hub.dapp_stats()[package_id];
    //     let remaining_set_count = dapp_stats.get_remaining_set_count();
    //     let total_set_count = dapp_stats.get_total_set_count();
    //     if(remaining_set_count != 0) {
    //         dapp_stats.set_remaining_set_count(remaining_set_count - 1);
    //     } else {
    //         let dubhe_treasury_address = dapp_hub.fee_to()[];
    //         let fee = dapp_stats.get_per_set_fee();
    //         let dubhe_asset_id = 1;
    //         do_transfer(dapp_hub, dubhe_asset_id, package_id, dubhe_treasury_address, fee);
    //         let total_set_fees_paid = dapp_stats.get_total_set_fees_paid();
    //         dapp_stats.set_total_set_fees_paid(total_set_fees_paid + fee);
    //     };
    //     dapp_stats.set_total_set_count(total_set_count + 1);
    //     dapp_hub.dapp_stats().set(package_id, dapp_stats);
    // }
}