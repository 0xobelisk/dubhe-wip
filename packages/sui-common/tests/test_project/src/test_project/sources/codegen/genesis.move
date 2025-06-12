#[allow(lint(share_owned))]module test_project::genesis {

  use sui::clock::Clock;

  use dubhe::dapp_system;

  use dubhe::dapp_hub::DappHub;

  use test_project::dapp_key;

  use test_project::catch_master_result;

  use test_project::balance;

  use test_project::position2;

  use test_project::movable;

  use test_project::movable1;

  use test_project::movable2;

  use test_project::monster;

  use test_project::monster1;

  use test_project::monster_catch_result;

  use test_project::player;

  use test_project::position;

  use test_project::encounter;

  use test_project::map_config;

  use test_project::counter0;

  use test_project::counter1;

  use test_project::counter2;

  public entry fun run(dapp_hub: &mut DappHub, clock: &Clock, ctx: &mut TxContext) {
    // Create Dapp
    let dapp_key = dapp_key::new();
    dapp_system::create_dapp(dapp_hub, dapp_key, b"test_project", b"Test project for schema generation", clock, ctx);
    // Register tables
    catch_master_result::register_table(dapp_hub, ctx);
    balance::register_table(dapp_hub, ctx);
    position2::register_table(dapp_hub, ctx);
    movable::register_table(dapp_hub, ctx);
    movable1::register_table(dapp_hub, ctx);
    movable2::register_table(dapp_hub, ctx);
    monster::register_table(dapp_hub, ctx);
    monster1::register_table(dapp_hub, ctx);
    monster_catch_result::register_table(dapp_hub, ctx);
    player::register_table(dapp_hub, ctx);
    position::register_table(dapp_hub, ctx);
    encounter::register_table(dapp_hub, ctx);
    map_config::register_table(dapp_hub, ctx);
    counter0::register_table(dapp_hub, ctx);
    counter1::register_table(dapp_hub, ctx);
    counter2::register_table(dapp_hub, ctx);
    // Logic that needs to be automated once the contract is deployed
    test_project::test_project_deploy_hook::run(dapp_hub, ctx);
  }
}
