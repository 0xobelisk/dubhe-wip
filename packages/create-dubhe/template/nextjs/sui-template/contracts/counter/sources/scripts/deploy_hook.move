#[allow(lint(share_owned), unused_let_mut)]module counter::deploy_hook {

  use std::ascii::string;

  use sui::clock::Clock;

  use counter::dapp_system;

  use counter::counter_schema::Counter;

  public entry fun run(clock: &Clock, ctx: &mut TxContext) {
    // Create a dapp.
    let mut dapp = dapp_system::create(string(b"counter"),string(b"counter contract"), clock , ctx);
    // Create schemas
    let mut counter = counter::counter_schema::create(ctx);
    // Logic that needs to be automated once the contract is deployed
    {
			counter.value().set(0);
			};
    // Authorize schemas and public share objects
    dapp.add_schema<Counter>(counter, ctx);
    sui::transfer::public_share_object(dapp);
  }
}
