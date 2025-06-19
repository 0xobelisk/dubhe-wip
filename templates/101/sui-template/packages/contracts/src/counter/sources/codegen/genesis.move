#[allow(lint(share_owned))]module counter::counter_genesis {

  use sui::clock::Clock;

  use dubhe::dapp_system;

  use dubhe::dapp_hub::DappHub;

  use counter::dapp_key;

  use counter::counter0;

  use counter::counter1;

  use counter::counter2;

  public entry fun run(dapp_hub: &mut DappHub, clock: &Clock, ctx: &mut TxContext) {
    // Create Dapp
    let dapp_key = dapp_key::new();
    dapp_system::create_dapp(dapp_hub, dapp_key, b"counter", b"counter contract", clock, ctx);
    // Register tables
    counter0::register_table(dapp_hub, ctx);
    counter1::register_table(dapp_hub, ctx);
    counter2::register_table(dapp_hub, ctx);
    // Logic that needs to be automated once the contract is deployed
    counter::deploy_hook::run(dapp_hub, ctx);
  }
}
