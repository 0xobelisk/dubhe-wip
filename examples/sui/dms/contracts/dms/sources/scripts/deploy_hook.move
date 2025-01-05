#[allow(lint(share_owned), unused_let_mut)]module dms::deploy_hook {

  use std::ascii::string;

  use sui::clock::Clock;

  use dms::dapp_system;

  use dms::mailbox_schema::Mailbox;

  public entry fun run(clock: &Clock, ctx: &mut TxContext) {
    // Create a dapp.
    let mut dapp = dapp_system::create(string(b"dms"),string(b"distributed message"), clock , ctx);
    // Create schemas
    let mut mailbox = dms::mailbox_schema::create(ctx);
    // Logic that needs to be automated once the contract is deployed
    {
			
			};
    // Authorize schemas and public share objects
    dapp.add_schema<Mailbox>(mailbox, ctx);
    sui::transfer::public_share_object(dapp);
  }
}
