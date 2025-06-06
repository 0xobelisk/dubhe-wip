#[allow(lint(share_owned))]module dubhe::dubhe_genesis {

  use std::ascii::string;

  use sui::clock::Clock;

  use dubhe::dapp_hub::DappHub;

  use dubhe::dubhe_dapp_key;

  use dubhe::dubhe_config;

  use dubhe::dubhe_asset_metadata;

  use dubhe::dubhe_asset_account;

  use dubhe::dubhe_pools;

  use dubhe::dubhe_bridge;

  use dubhe::dubhe_wrapper_assets;

  public entry fun run(dapp_hub: &mut DappHub, clock: &Clock, ctx: &mut TxContext) {
    // Create Dapp
    let dapp_key = dubhe_dapp_key::new();
    dapp_hub.create_dapp(dapp_key, b"dubhe", b"Dubhe Protocol", clock, ctx);
    // Register tables
    dubhe_config::register_table(dapp_hub, ctx);
    dubhe_asset_metadata::register_table(dapp_hub, ctx);
    dubhe_asset_account::register_table(dapp_hub, ctx);
    dubhe_pools::register_table(dapp_hub, ctx);
    dubhe_bridge::register_table(dapp_hub, ctx);
    dubhe_wrapper_assets::register_table(dapp_hub, ctx);
    // Logic that needs to be automated once the contract is deployed
    dubhe::dubhe_deploy_hook::run(dapp_hub, ctx);
  }
}
