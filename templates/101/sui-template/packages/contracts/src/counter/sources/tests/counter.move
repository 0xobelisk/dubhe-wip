#[test_only]
module counter::counter_test {
    use sui::test_scenario;
    use counter::counter_system;
    use counter::counter_init_test;
    use counter::counter_counter1;
    use counter::counter_counter2;

    #[test]
    public fun inc() {
        let deployer = @0xA;
        let mut scenario  = test_scenario::begin(deployer);

        let mut dapp_hub = counter_init_test::deploy_dapp_for_testing(&mut scenario);
        let ctx = test_scenario::ctx(&mut scenario);

        counter_system::inc(&mut dapp_hub, 10, ctx);
        assert!(counter_counter1::get(&dapp_hub) == 10);
        assert!(counter_counter2::get(&dapp_hub, ctx.sender()) == 10);

        counter_system::inc(&mut dapp_hub, 20, ctx);
        assert!(counter_counter1::get(&dapp_hub) == 20);
        assert!(counter_counter2::get(&dapp_hub, ctx.sender()) == 20);

        dapp_hub.destroy();
        scenario.end();
    }
}
