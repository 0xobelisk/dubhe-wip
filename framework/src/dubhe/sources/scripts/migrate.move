module dubhe::migrate {
  use dubhe::dapp_service::DappHub;
  use dubhe::genesis;

  const ON_CHAIN_VERSION: u32 = 2;

  public fun on_chain_version(): u32 {
    ON_CHAIN_VERSION
  }

  public entry fun migrate_to_v2(dapp_hub: &mut DappHub, new_package_id: address, new_version: u32, ctx: &mut TxContext) {
    genesis::upgrade(dapp_hub, new_package_id, new_version, ctx);
  }
}