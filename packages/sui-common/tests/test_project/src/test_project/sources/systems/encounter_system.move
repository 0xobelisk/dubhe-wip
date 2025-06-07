module test_project::test_project_encounter_system {
    use dubhe::dapp_hub;
    use dubhe::dapp_hub::DappHub;
    use test_project::test_project_encounter;
    use test_project::test_project_position;

    public fun move_player(
        dapp_hub: &mut DappHub, 
        player: address,
        exists: bool,
        monster: address,
        catch_attempt: u256
    ) {
        if (!test_project_position::has(dapp_hub, player)) {
            test_project_position::set(dapp_hub, player, 0, 0);
        };
        test_project_encounter::set(
            dapp_hub, 
            player, 
            exists, 
            monster, 
            catch_attempt
      );
    }
}