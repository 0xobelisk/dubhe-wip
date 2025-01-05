module dms::message_system {
    use std::ascii::String;
    use dms::message_set_event;
    use dms::message_too_long_error;
    use dms::mailbox_schema::Mailbox;

    /// Send a world message
    public entry fun send(mailbox: &mut Mailbox, message: String, ctx: &mut TxContext) {
        let sender = ctx.sender();
        message_too_long_error::require(message.length() <= 12);
        mailbox.world_message().set(message);
        message_set_event::emit(sender, message);
    }

    /// Set a private message
    public entry fun set(mailbox: &mut Mailbox, message: String, ctx: &mut TxContext) {
        let sender = ctx.sender();
        mailbox.private_message().set(sender, message);
        message_set_event::emit(sender, message);
    }
}