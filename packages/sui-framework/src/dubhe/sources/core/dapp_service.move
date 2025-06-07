module dubhe::dapp_service {
    use sui::object::{Self, UID};
    use sui::table::{Self, Table};
    use sui::tx_context::{Self, TxContext};
    use std::ascii::String;
    use std::ascii::string;
    use sui::event;
    use std::vector;
    use dubhe::table_id;
    use dubhe::dubhe_events::{emit_store_set_field, emit_store_set_record, emit_store_delete_record};
    use std::type_name;
    use dubhe::dapp_state::DappState;
    use dubhe::dapp_state::TableMetadata;
    use dubhe::dapp_state;
    use dubhe::dapp_hub::DappHub;

    /// Error codes
    const EInvalidTableId: u64 = 1;
    const EInvalidKey: u64 = 2;
    const EInvalidValue: u64 = 3;
    const EInvalidFieldIndex: u64 = 4;
    const EInvalidFieldType: u64 = 5;
    const ENoPermissionPackageId: u64 = 6;
    const EInvalidPackageId: u64 = 7;

    /// Register a new table
    public fun register_table<DappKey: copy + drop>(
        dapp_hub: &mut DappHub,
        dapp_key: DappKey,
        table_id: vector<u8>,
        name: vector<u8>,
        key_schemas: vector<vector<u8>>,
        key_names: vector<vector<u8>>,
        value_schemas: vector<vector<u8>>,
        value_names: vector<vector<u8>>,
        ctx: &mut TxContext
    ) {
        let dapp_state = dapp_hub.mut_dapp_state(dapp_key);
        dapp_state::register_table(dapp_state, table_id, name, key_schemas, key_names, value_schemas, value_names, ctx);
    }

    /// Set a record
    public fun set_record<DappKey: copy + drop>(
        dapp_hub: &mut DappHub,
        dapp_key: DappKey,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        value_tuple: vector<vector<u8>>
    ) {
        if(table_id::table_type(&table_id) == table_id::offchain_table_type()) {
            emit_store_set_record(
                table_id,
                key_tuple,
                value_tuple
            );
            return
        };

        let dapp_state = dapp_hub.mut_dapp_state(dapp_key);
        dapp_state::set_record(dapp_state, table_id, key_tuple, value_tuple);

        // TODO: Modify dubhe_state
        // let dubhe_state = dapp_hub.mut_dubhe_state();
        // encounter_system::encounter(dapp_hub, @0x0);
        // dubhe::dapp_charge::charge(dapp_hub, @0x0, 100);

        // Emit event
        emit_store_set_record(
            table_id,
            key_tuple,
            value_tuple
        );
    }

    /// Set a field
    public fun set_field<DappKey: copy + drop>(
        dapp_hub: &mut DappHub,
        dapp_key: DappKey,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8,
        value: vector<u8>
    ) {

        if(table_id::table_type(&table_id) == table_id::offchain_table_type()) {
            emit_store_set_field(
                table_id,
                key_tuple,
                field_index,
                value
            );
            return
        };

        let dapp_state = dapp_hub.mut_dapp_state(dapp_key);

        dapp_state::set_field(dapp_state, table_id, key_tuple, field_index, value);

         // Emit event
        emit_store_set_field(
            table_id,
            key_tuple,
            field_index,
            value
        );

        // TODO: Modify dubhe_state
        // let dubhe_state = dapp_hub.mut_dubhe_state();
    }

    /// Get a record
    public fun get_record<DappKey: copy + drop>(
        dapp_hub: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ): vector<u8> {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_state = dapp_hub.dapp_state(dapp_key);
        dapp_state::get_record(dapp_state, table_id, key_tuple)
    }

    /// Get a field
    public fun get_field<DappKey: copy + drop>(
        dapp_hub: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8
    ): vector<u8> {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_state = dapp_hub.dapp_state(dapp_key);
        dapp_state::get_field(dapp_state, table_id, key_tuple, field_index)
    }


    public fun has_record<DappKey: copy + drop>(
        dapp_hub: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ): bool {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_state = dapp_hub.dapp_state(dapp_key);
        dapp_state::has_record(dapp_state, table_id, key_tuple)
    }

    public fun has_field<DappKey: copy + drop>(
        dapp_hub: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8
    ): bool {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_state = dapp_hub.dapp_state(dapp_key);
        dapp_state::has_field(dapp_state, table_id, key_tuple, field_index)
    }

    public fun ensure_has_record<DappKey: copy + drop>(
        dapp_hub: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ) {
        assert!(has_record<DappKey>(dapp_hub, table_id, key_tuple), EInvalidKey);
    }

    public fun ensure_not_has_record<DappKey: copy + drop>(
        dapp_hub: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ) {
        assert!(!has_record<DappKey>(dapp_hub, table_id, key_tuple), EInvalidKey);
    }

    public fun ensure_has_field<DappKey: copy + drop>(
        dapp_hub: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8
    ) {
        assert!(has_field<DappKey>(dapp_hub, table_id, key_tuple, field_index), EInvalidFieldIndex);
    }

    public fun ensure_not_has_field<DappKey: copy + drop>(
        dapp_hub: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8
    ) {
        assert!(!has_field<DappKey>(dapp_hub, table_id, key_tuple, field_index), EInvalidFieldIndex);
    }

    public fun delete_record<DappKey: copy + drop>(
        dapp_hub: &mut DappHub,
        dapp_key: DappKey,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ) {
        if(table_id::table_type(&table_id) == table_id::offchain_table_type()) {
            emit_store_delete_record(table_id, key_tuple);
            return
        };
        let dapp_state = dapp_hub.mut_dapp_state(dapp_key);
        dapp_state::delete_record(dapp_state, table_id, key_tuple);
    }

    public fun upgrade<DappKey: copy + drop>(
        dapp_hub: &mut DappHub,
        _: DappKey,
        new_package_id: address,
        new_version: u32
    ) {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_state = dapp_hub.mut_dapp_state(dapp_key);
        assert!(dapp_state.dapp_key() == dapp_key, ENoPermissionPackageId);
        assert!(dapp_state.packages().contains(&new_package_id), EInvalidPackageId);
        dapp_state.mut_packages().push_back(new_package_id);
        *dapp_state.mut_version() = new_version;
    } 
}