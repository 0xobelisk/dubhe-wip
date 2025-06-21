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
    use dubhe::dapp_store::DappStore;
    use dubhe::table_metadata::TableMetadata;
    use dubhe::dapp_store;
    use sui::clock::Clock;
    use sui::object_table;
    use sui::object_table::ObjectTable;

    /// Error codes
    const EInvalidTableId: u64 = 1;
    const EInvalidKey: u64 = 2;
    const EInvalidValue: u64 = 3;
    const EInvalidFieldIndex: u64 = 4;
    const EInvalidFieldType: u64 = 5;
    const ENoPermissionPackageId: u64 = 6;
    const EInvalidPackageId: u64 = 7;


    /// Storage structure
    public struct DappHub has key, store {
        id: UID,
        dapp_stores: ObjectTable<String, DappStore>,
    }

    /// Create a new storage instance
    public(package) fun new(ctx: &mut TxContext): DappHub {
        DappHub {
            id: object::new(ctx),
            dapp_stores: object_table::new(ctx),
        }
    }

    fun init(ctx: &mut TxContext) {
        sui::transfer::public_share_object(
            new(ctx)
        );
    }

    /// Register a new table
    public fun register_table<DappKey: copy + drop>(
        self: &mut DappHub,
        dapp_key: DappKey,
        table_id: vector<u8>,
        name: vector<u8>,
        key_schemas: vector<vector<u8>>,
        key_names: vector<vector<u8>>,
        value_schemas: vector<vector<u8>>,
        value_names: vector<vector<u8>>,
        ctx: &mut TxContext
    ) {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_store = self.dapp_stores.borrow_mut(dapp_key);
        dapp_store.register_table(
            table_id, 
            name, 
            key_schemas, 
            key_names, 
            value_schemas, 
            value_names, 
            ctx
        );
    }

    /// Set a record
    public fun set_record<DappKey: copy + drop>(
        self: &mut DappHub,
        dapp_key: DappKey,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        value_tuple: vector<vector<u8>>
    ) {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_store = self.dapp_stores.borrow_mut(dapp_key);
        assert!(dapp_store.get_dapp_key() == dapp_key, ENoPermissionPackageId);


        // Charge set fee
        dapp_store.charge_fee(key_tuple, value_tuple);


        if(table_id::table_type(&table_id) == table_id::offchain_table_type()) {
            emit_store_set_record(
                table_id,
                key_tuple,
                value_tuple
            );
            return
        };

        // Set record
        dapp_store.set_record(table_id, key_tuple, value_tuple);

        // Emit event
        emit_store_set_record(
            table_id,
            key_tuple,
            value_tuple
        );
    }

    /// Set a field
    public fun set_field<DappKey: copy + drop>(
        self: &mut DappHub,
        dapp_key: DappKey,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8,
        value: vector<u8>
    ) {

        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_store = self.dapp_stores.borrow_mut(dapp_key);
        assert!(dapp_store.get_dapp_key() == dapp_key, ENoPermissionPackageId);

        // Charge fee
        dapp_store.charge_fee(key_tuple, vector[value]);

        if(table_id::table_type(&table_id) == table_id::offchain_table_type()) {
            emit_store_set_field(
                table_id,
                key_tuple,
                field_index,
                value
            );
            return
        };

        dapp_store::set_field(dapp_store, table_id, key_tuple, field_index, value);

         // Emit event
        emit_store_set_field(
            table_id,
            key_tuple,
            field_index,
            value
        );
    }

    public fun delete_record<DappKey: copy + drop>(
        self: &mut DappHub,
        dapp_key: DappKey,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ) {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_store = self.dapp_stores.borrow_mut(dapp_key);
        assert!(dapp_store.get_dapp_key() == dapp_key, ENoPermissionPackageId);

        if(table_id::table_type(&table_id) == table_id::offchain_table_type()) {
            emit_store_delete_record(table_id, key_tuple);
            return
        };

        dapp_store::delete_record(dapp_store, table_id, key_tuple);

        // Emit event
        emit_store_delete_record(table_id, key_tuple);
    }

    /// Get a record
    public fun get_record<DappKey: copy + drop>(
        self: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ): vector<u8> {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_store = self.dapp_stores.borrow(dapp_key);
        dapp_store::get_record(dapp_store, table_id, key_tuple)
    }

    /// Get a field
    public fun get_field<DappKey: copy + drop>(
        self: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8
    ): vector<u8> {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_store = self.dapp_stores.borrow(dapp_key);
        dapp_store::get_field(dapp_store, table_id, key_tuple, field_index)
    }


    public fun has_record<DappKey: copy + drop>(
        self: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ): bool {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_store = self.dapp_stores.borrow(dapp_key);
        dapp_store::has_record(dapp_store, table_id, key_tuple)
    }

    public fun has_field<DappKey: copy + drop>(
        self: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8
    ): bool {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_store = self.dapp_stores.borrow(dapp_key);
        dapp_store::has_field(dapp_store, table_id, key_tuple, field_index)
    }

    public fun ensure_has_record<DappKey: copy + drop>(
        self: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ) {
        assert!(has_record<DappKey>(self, table_id, key_tuple), EInvalidKey);
    }

    public fun ensure_not_has_record<DappKey: copy + drop>(
        self: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ) {
        assert!(!has_record<DappKey>(self, table_id, key_tuple), EInvalidKey);
    }

    public fun ensure_has_field<DappKey: copy + drop>(
        self: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8
    ) {
        assert!(has_field<DappKey>(self, table_id, key_tuple, field_index), EInvalidFieldIndex);
    }

    public fun ensure_not_has_field<DappKey: copy + drop>(
        self: &DappHub,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8
    ) {
        assert!(!has_field<DappKey>(self, table_id, key_tuple, field_index), EInvalidFieldIndex);
    }

    public fun create_dapp<DappKey: copy + drop>(
        self: &mut DappHub,
        dapp_key: DappKey,
        name: vector<u8>,
        description: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let dapp_store = dapp_store::new(dapp_key, name, description, clock, ctx);
        let dapp_key = type_name::get<DappKey>().into_string();
        self.dapp_stores.add(dapp_key, dapp_store);
    }

    // public fun upgrade<DappKey: copy + drop>(
    //     self: &mut DappHub,
    //     _: DappKey,
    //     new_package_id: address,
    //     new_version: u32
    // ) {
    //     let dapp_key = type_name::get<DappKey>().into_string();
    //     let dapp_store = self.dapp_stores.borrow_mut(dapp_key);
    //     assert!(dapp_store.get_dapp_key() == dapp_key, ENoPermissionPackageId);
    //     assert!(dapp_store.packages().contains(&new_package_id), EInvalidPackageId);
    //     dapp_store.mut_packages().push_back(new_package_id);
    //     *dapp_store.mut_version() = new_version;
    // } 

    #[test_only]
    public fun create_dapp_hub_for_testing(ctx: &mut TxContext): DappHub {
        DappHub {
            id: object::new(ctx),
            dapp_stores: object_table::new(ctx),
        }
    }

    #[test_only]
    public fun destroy(self: DappHub) {
        let DappHub { id, dapp_stores } = self;
        object::delete(id);
        sui::transfer::public_freeze_object(dapp_stores);
    }
}