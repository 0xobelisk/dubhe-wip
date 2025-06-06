module dubhe::dubhe_wrapper_system;
use std::ascii::String;
use std::ascii::string;
use std::u64;
use dubhe::dubhe_assets_functions;
use sui::balance;
use sui::balance::Balance;
use sui::coin;
use sui::coin::{Coin};
use std::type_name;
use dubhe::dubhe_errors::{overflows_error};
use dubhe::dubhe_asset_type;
use dubhe::dapp_hub::DappHub;
use dubhe::dubhe_wrapper_assets;
use dubhe::dubhe_dapp_key;


public entry fun wrap<T>(dapp_hub: &mut DappHub, coin: Coin<T>, beneficiary: address): u256 {
      let dapp_key = dubhe_dapp_key::new();
      let coin_type = get_coin_type<T>();
      dubhe_wrapper_assets::ensure_has(dapp_hub, coin_type);
      let asset_id = dubhe_wrapper_assets::get(dapp_hub, coin_type);
      let amount = coin.value();
      let pool_balance = dapp_hub.mut_dapp_state_objects(dapp_key).borrow_mut<address, Balance<T>>(asset_id);
      pool_balance.join(coin.into_balance());
      dubhe_assets_functions::do_mint(dapp_hub, asset_id, beneficiary, amount as u256);
      amount as u256
}

public entry fun unwrap<T>(dapp_hub: &mut DappHub, amount: u256, beneficiary: address, ctx: &mut TxContext) {
      let coin =  do_unwrap<T>(dapp_hub, amount, ctx);
      transfer::public_transfer(coin, beneficiary);
}

public(package) fun do_register<T>(dapp_hub: &mut DappHub, name: vector<u8>, symbol: vector<u8>, description: vector<u8>, decimals: u8, icon_url: vector<u8>): address {
      let asset_id = dubhe_assets_functions::do_create(
            dapp_hub, 
            dubhe_asset_type::new_wrapped(),
            @0x0, 
            name, 
            symbol, 
            description, 
            decimals, 
            icon_url, 
            false, 
            false, 
            true,
      );
      let coin_type = get_coin_type<T>();
      dubhe_wrapper_assets::set(dapp_hub, coin_type, asset_id);
      let dapp_key = dubhe_dapp_key::new();
      dapp_hub.mut_dapp_state_objects(dapp_key).add(asset_id, balance::zero<T>());
      asset_id
}

public(package) fun do_unwrap<T>(dapp_hub: &mut DappHub, amount: u256, ctx: &mut TxContext): Coin<T> {
      overflows_error(amount <= u64::max_value!() as u256);
      let coin_type = get_coin_type<T>();
      dubhe_wrapper_assets::ensure_has(dapp_hub, coin_type);
      let asset_id = dubhe_wrapper_assets::get(dapp_hub, coin_type);
      dubhe_assets_functions::do_burn(dapp_hub, asset_id, ctx.sender(), amount);
      let dapp_key = dubhe_dapp_key::new();
      let pool_balance = dapp_hub.mut_dapp_state_objects(dapp_key).borrow_mut<address, Balance<T>>(asset_id);
      let balance = pool_balance.split(amount as u64);
      coin::from_balance<T>(balance, ctx)
}

public fun get_coin_type<T>(): vector<u8> {
    type_name::get<T>().into_string().into_bytes()
}