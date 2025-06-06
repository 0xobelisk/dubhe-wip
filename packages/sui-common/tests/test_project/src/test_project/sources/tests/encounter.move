#[test_only]
module test_project::test_project_encounter_test;

use test_project::test_project_encounter_system;
use test_project::test_project_init_test;
use sui::test_scenario;
use test_project::test_project_encounter;
use dubhe::dapp_hub;
use test_project::test_project_position;
use test_project::test_project_movable;
use test_project::test_project_status;
use test_project::test_project_direction;
use test_project::test_project_position2;

#[test]
public fun test_encounter() {
      let mut scenario = test_scenario::begin(@0x1);
      let mut dapp_hub = test_project_init_test::deploy_dapp_for_testing(&mut scenario);

      let player = @0x1;
      let exists = true;
      let monster = @0x2;
      let catch_attempt = 0;

      test_project_encounter_system::move_player(&mut dapp_hub, player, exists, monster, catch_attempt);

      let (stored_exists, stored_monster, stored_catch_attempt) = test_project_encounter::get(&dapp_hub, player);
      assert!(stored_exists == exists);
      assert!(stored_monster == monster);
      assert!(stored_catch_attempt == catch_attempt);

      let (stored_x, stored_y) = test_project_position::get(&dapp_hub, player);
      assert!(stored_x == 0);
      assert!(stored_y == 0);

      assert!(test_project_position::has(&dapp_hub, player));
      assert!(test_project_position::has_x(&dapp_hub, player));
      assert!(test_project_position::has_y(&dapp_hub, player));

      assert!(!test_project_position::has(&dapp_hub, @0x2));
      assert!(!test_project_position::has_x(&dapp_hub, @0x2));
      assert!(!test_project_position::has_y(&dapp_hub, @0x2));

      test_project_position::set_x(&mut dapp_hub, @0x2, 100);
      assert!(!test_project_position::has(&dapp_hub, @0x2));
      assert!(test_project_position::has_x(&dapp_hub, @0x2));
      assert!(!test_project_position::has_y(&dapp_hub, @0x2));

      test_project_position::delete(&mut dapp_hub, player);
      assert!(!test_project_position::has(&dapp_hub, player));
      assert!(!test_project_position::has_x(&dapp_hub, player));
      assert!(!test_project_position::has_y(&dapp_hub, player));

      assert!(!test_project_movable::has(&dapp_hub, player));
      test_project_movable::set(&mut dapp_hub, player);
      assert!(test_project_movable::has(&dapp_hub, player));
      test_project_movable::delete(&mut dapp_hub, player);
      assert!(!test_project_movable::has(&dapp_hub, player));

      // let mut i = 0;
      // while(i < 900) {
      //   test_project_movable::set(&mut dapp_hub, player);
      //   test_project_position::set(&mut dapp_hub, player, 100, 100);
      //   i = i + 1;
      // };

      let caught = test_project_status::new_caught();
      std::debug::print(&caught.encode());

      let mut bcs_type = sui::bcs::new(caught.encode());
      let decoded = test_project_status::decode(&mut bcs_type);
      assert!(decoded == caught);
      std::debug::print(&decoded);

      let direction = test_project_direction::new_east();
      test_project_position2::set(&mut dapp_hub, player, 100, 100, direction);
      let (stored_x, stored_y, stored_direction) = test_project_position2::get(&dapp_hub, player);
      assert!(stored_x == 100);
      assert!(stored_y == 100);
      assert!(stored_direction == direction);

      test_project_position2::ensure_has(&dapp_hub, player);
      // test_project_position2::ensure_has(&dapp_hub, @0x2);

      dapp_hub::destroy(dapp_hub);
      test_scenario::end(scenario);
}