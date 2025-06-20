#[allow(lint(share_owned))]module dubhe::genesis {

  use sui::clock::Clock;

  use dubhe::dapp_system;

  use dubhe::dapp_hub::DappHub;

  use dubhe::dapp_key;

  use dubhe::dapp_metadata;

  use dubhe::dubhe_config;

  use dubhe::asset_metadata;

  use dubhe::asset_account;

  use dubhe::asset_pools;

  use dubhe::bridge;

  use dubhe::wrapper_assets;

  public entry fun run(dapp_hub: &mut DappHub, clock: &Clock, ctx: &mut TxContext) {
    // Create Dapp
    let dapp_key = dapp_key::new();
    dapp_system::create_dapp(dapp_hub, dapp_key, b"dubhe", b"Dubhe Protocol", clock, ctx);
    // Register tables
    dapp_metadata::register_table(dapp_hub, ctx);
    dubhe_config::register_table(dapp_hub, ctx);
    asset_metadata::register_table(dapp_hub, ctx);
    asset_account::register_table(dapp_hub, ctx);
    asset_pools::register_table(dapp_hub, ctx);
    bridge::register_table(dapp_hub, ctx);
    wrapper_assets::register_table(dapp_hub, ctx);
    // Logic that needs to be automated once the contract is deployed
    dubhe::deploy_hook::run(dapp_hub, ctx);
  }
}
