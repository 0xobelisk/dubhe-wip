#[allow(lint(share_owned))]module test_project::test_project_genesis {

  use std::ascii::string;

  use sui::clock::Clock;

  use dubhe::dapp_hub::DappHub;

  use test_project::test_project_dapp_key;

  use test_project::test_project_catch_master_result;

  use test_project::test_project_balance;

  use test_project::test_project_position2;

  use test_project::test_project_movable;

  use test_project::test_project_movable1;

  use test_project::test_project_movable2;

  use test_project::test_project_monster;

  use test_project::test_project_monster1;

  use test_project::test_project_monster_catch_result;

  use test_project::test_project_player;

  use test_project::test_project_position;

  use test_project::test_project_encounter;

  use test_project::test_project_map_config;

  public entry fun run(dapp_hub: &mut DappHub, clock: &Clock, ctx: &mut TxContext) {
    // Create Dapp
    let dapp_key = test_project_dapp_key::new();
    dapp_hub.create_dapp(dapp_key, b"test_project", b"Test project for schema generation", clock, ctx);
    // Register tables
    test_project_catch_master_result::register_table(dapp_hub, ctx);
    test_project_balance::register_table(dapp_hub, ctx);
    test_project_position2::register_table(dapp_hub, ctx);
    test_project_movable::register_table(dapp_hub, ctx);
    test_project_movable1::register_table(dapp_hub, ctx);
    test_project_movable2::register_table(dapp_hub, ctx);
    test_project_monster::register_table(dapp_hub, ctx);
    test_project_monster1::register_table(dapp_hub, ctx);
    test_project_monster_catch_result::register_table(dapp_hub, ctx);
    test_project_player::register_table(dapp_hub, ctx);
    test_project_position::register_table(dapp_hub, ctx);
    test_project_encounter::register_table(dapp_hub, ctx);
    test_project_map_config::register_table(dapp_hub, ctx);
    // Logic that needs to be automated once the contract is deployed
    test_project::test_project_deploy_hook::run(dapp_hub, ctx);
  }
}
