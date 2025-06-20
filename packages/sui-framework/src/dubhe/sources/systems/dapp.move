module dubhe::dapp_system;
use std::ascii::String;
use dubhe::dapp_hub::DappHub;
use sui::clock::Clock;
use dubhe::dapp_state::{Self, DappState};
use dubhe::dapp_metadata;
use std::type_name;

public fun create_dapp<DappKey: copy + drop>(
  dapp_hub: &mut DappHub,
  dapp_key: DappKey,
  name: vector<u8>,
  description: vector<u8>,
  clock: &Clock,
  ctx: &mut TxContext,
) {
  let dapp = dapp_state::new(dapp_key, name, description, clock, ctx);
  dapp_hub.add_dapp(dapp_key, dapp);
}

  public fun upgrade_dapp<DappKey: copy + drop>(
      dapp_hub: &mut DappHub, 
      dapp_key: DappKey, 
      new_package_id: address, 
      new_version: u32, 
      ctx: &mut TxContext
) {
      let dapp_key = type_name::get<DappKey>().into_string().into_bytes();
      dapp_metadata::set_package(dapp_hub, dapp_key, new_package_id);
      dapp_metadata::set_version(dapp_hub, dapp_key, new_version);
}

// public entry fun set_metadata(
//   dapp_hub: &mut DappHub,
//   package_id: address,
//   name: String,
//   description: String,
//   cover_url: vector<String>,
//   website_url: String,
//   partners: vector<String>,
//   ctx: &TxContext,
// ) {
//   let admin = dapp_hub.dapp_admin().try_get(package_id);
//   not_dapp_admin_error(admin == option::some(ctx.sender()));
//   let created_at = dapp_hub.dapp_metadata().get(package_id).get_created_at();
//   dapp_hub.dapp_metadata().set(package_id, dapp_metadata::new(
//               name,
//               description,
//               cover_url,
//               website_url,
//               created_at,
//               partners
//           )
//   );
// }

// public entry fun transfer_ownership(dapp_hub: &mut DappHub,package_id: address, new_admin: address, ctx: &mut TxContext) {
//   let admin = dapp_hub.dapp_admin().try_get(package_id);
//   not_dapp_admin_error(admin == option::some(ctx.sender()));
//   dapp_hub.dapp_admin().set(package_id, new_admin);
// }

// public entry fun set_pausable(dapp_hub: &mut DappHub, package_id: address, pausable: bool, ctx: &TxContext) {
//   let admin = dapp_hub.dapp_admin().try_get(package_id);
//   not_dapp_admin_error(admin == option::some(ctx.sender()));
//   dapp_hub.dapp_pausable().set(package_id, pausable);
// }

// public fun get_dapp_admin<DappKey: copy + drop>(dapp_hub: &mut DappHub, _: DappKey): address {
//   let package_id = type_info::get_package_id<DappKey>();
//   dapp_hub.dapp_admin()[package_id]
// }

// public fun ensure_dapp_not_pausable<DappKey: copy + drop>(dapp_hub: &mut DappHub, _: DappKey) {
//   let package_id = type_info::get_package_id<DappKey>();
//   let pausable = dapp_hub.dapp_pausable().try_get(package_id);
//   not_dapp_pausable_error(pausable == option::some(false));
// }

// public fun ensure_dapp_admin_sign<DappKey: copy + drop>(dapp_hub: &mut DappHub, _: DappKey, ctx: &TxContext) {
//   let package_id = type_info::get_package_id<DappKey>();
//   let admin = dapp_hub.dapp_admin().try_get(package_id);
//   not_dapp_admin_error(admin == option::some(ctx.sender()));
// }

// public fun ensure_dapp_latest_version<DappKey: copy + drop>(dapp_hub: &mut DappHub, _: DappKey, on_chain_version: u32) {
//   let package_id = type_info::get_package_id<DappKey>();
//   let current_version = dapp_hub.dapp_version().get(package_id);
//   not_dapp_latest_version_error(current_version == on_chain_version);
// }
