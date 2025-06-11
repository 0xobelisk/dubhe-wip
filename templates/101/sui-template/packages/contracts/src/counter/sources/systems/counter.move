module counter::counter_system {
    use counter::counter_errors::invalid_increment_error;
    use dubhe::dapp_hub::DappHub;
    use counter::counter_counter0;
    use counter::counter_counter1;
    use counter::counter_counter2;

    public entry fun inc(dapp_hub: &mut DappHub, number: u32, ctx: &mut TxContext) {
        // Check if the increment value is valid.
        invalid_increment_error(number > 0 && number < 100);
        counter_counter0::set(dapp_hub, ctx.sender());
        counter_counter1::set(dapp_hub, number);
        counter_counter2::set(dapp_hub, ctx.sender(), number);
    }
}