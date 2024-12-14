#[test_only]
module counter::counter_test {
    use sui::test_scenario;
    use counter::counter_system;
    use counter::counter_schema::Counter;
    use counter::init_test;

    #[test]
    public fun inc() {
        let (scenario, dapp)  = init_test::deploy_dapp_for_testing(@0xA);

        let mut counter = test_scenario::take_shared<Counter>(&scenario);

        assert!(counter.borrow_value().get() == 0);

        counter_system::inc(&mut counter, 10);
        assert!(counter.borrow_value().get() == 10);

        counter_system::inc(&mut counter, 10);
        assert!(counter.borrow_value().get() == 20);

        test_scenario::return_shared(counter);
        dapp.distroy_dapp_for_testing();
        scenario.end();
    }
}
