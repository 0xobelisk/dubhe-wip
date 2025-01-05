#[test_only]
module dms::message_test {
    use std::ascii::string;
    use dms::init_test;
    use dms::message_system;
    use sui::test_scenario;
    use dms::mailbox_schema::Mailbox;

    #[test]
    public fun send() {
        let (mut scenario, dapp) = init_test::deploy_dapp_for_testing(@0xA);

        let mut mailbox = test_scenario::take_shared<Mailbox>(&scenario);
        let ctx = test_scenario::ctx(&mut scenario);
        let message = string(b"Hello, world!");
        message_system::send(&mut mailbox, message, ctx);
        assert!(mailbox.world_message().get() == message);

        message_system::set(&mut mailbox, message, ctx);
        assert!(mailbox.private_message().get(ctx.sender()) == message);

        test_scenario::return_shared(mailbox);
        dapp.distroy_dapp_for_testing();
        scenario.end();
    }
}