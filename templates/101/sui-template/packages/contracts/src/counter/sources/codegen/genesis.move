#[allow(lint(share_owned))]module counter::counter_genesis {

  use std::ascii::string;

  use sui::clock::Clock;

  use dubhe::dapp_system;

  use dubhe::dapp_hub::DappHub;

  use counter::counter_dapp_key;

  use counter::counter_counter0;

  use counter::counter_counter1;

  use counter::counter_counter2;

  public entry fun run(dapp_hub: &mut DappHub, clock: &Clock, ctx: &mut TxContext) {
    // Create Dapp
    let dapp_key = counter_dapp_key::new();
    dapp_system::create_dapp(dapp_hub, dapp_key, b"counter", b"counter contract", clock, ctx);
    // Register tables
    counter_counter0::register_table(dapp_hub, ctx);
    counter_counter1::register_table(dapp_hub, ctx);
    counter_counter2::register_table(dapp_hub, ctx);
    // Logic that needs to be automated once the contract is deployed
    counter::counter_deploy_hook::run(dapp_hub, ctx);
  }
}
