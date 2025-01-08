module counter::counter_system {
    use counter::counter_schema::Counter;
    use counter::increment_event;
    use counter::invalid_increment_error;

    public entry fun inc(counter: &mut Counter, number: u32) {
        // Check if the increment value is valid.
        invalid_increment_error::require(number > 0 && number < 100);
        counter.value().mutate!(|value| {
            // Increment the counter value.
            *value =  *value + number;
            // Emit an event to notify the increment.
            increment_event::emit(number);
        });
    }

    public fun get(counter: &Counter) : u32 {
        counter.borrow_value().get()
    }
}