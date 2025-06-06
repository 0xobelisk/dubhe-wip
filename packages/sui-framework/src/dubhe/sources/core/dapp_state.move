module dubhe::dapp_state {
    use sui::object::{Self, UID};
    use sui::table::{Self, Table};
    use sui::tx_context::{Self, TxContext};
    use std::ascii::String;
    use std::ascii::string;
    use sui::event;
    use std::vector;
    use dubhe::table_id;
    use std::type_name;
    use sui::bag;
    use sui::bag::Bag;
    use sui::clock::{Self, Clock};

    /// Error codes
    const EInvalidTableId: u64 = 1;
    const EInvalidKey: u64 = 2;
    const EInvalidValue: u64 = 3;
    const EInvalidFieldIndex: u64 = 4;
    const EInvalidFieldType: u64 = 5;
    const ENoPermissionPackageId: u64 = 6;
    const EInvalidPackageId: u64 = 7;

    /// Table metadata structure
    public struct TableMetadata has store {
        name: vector<u8>,
        key_schemas: vector<vector<u8>>,
        key_names: vector<vector<u8>>,
        value_schemas: vector<vector<u8>>,
        value_names: vector<vector<u8>>
    }

    public fun value_names(self: &TableMetadata): vector<vector<u8>> {
        self.value_names
    }

    public(package) fun new_table_metadata(
        name: vector<u8>,
        key_schemas: vector<vector<u8>>,
        key_names: vector<vector<u8>>,
        value_schemas: vector<vector<u8>>,
        value_names: vector<vector<u8>>
    ): TableMetadata {
        TableMetadata {
            name,
            key_schemas,
            key_names,
            value_schemas,
            value_names
        }   
    }

    /// Storage structure
    public struct DappState has key, store {
        id: UID,
        name: String,
        description: String,
        dapp_key: String,
        packages: vector<address>,
        version: u32,
        cover_url: vector<String>,
        website_url: String,
        created_at: u64,
        partners: vector<String>,
        metadatas: Table<vector<u8>, TableMetadata>,
        // table_id => key_tuple => value_tuple
        tables: Table<vector<u8>, Table<vector<vector<u8>>, vector<vector<u8>>>>,
        // Object
        objects: Bag,
    }

    /// Create a new storage instance
    public(package) fun new<DappKey: copy + drop>(
        _: DappKey, 
        name: vector<u8>,
        description: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ): DappState {
        let dapp_key = type_name::get<DappKey>().into_string();
        DappState {
            id: object::new(ctx),
            name: string(name),
            description: string(description),
            dapp_key,
            packages: vector::empty(),
            version: 0,
            cover_url: vector::empty(),
            website_url: string(b""),
            created_at: clock::timestamp_ms(clock),
            partners: vector::empty(),
            tables: table::new(ctx),
            metadatas: table::new(ctx),
            objects: bag::new(ctx),
        }
    }

    /// Register a new table
    public(package) fun register_table(
        self: &mut DappState,
        table_id: vector<u8>,
        name: vector<u8>,
        key_schemas: vector<vector<u8>>,
        key_names: vector<vector<u8>>,
        value_schemas: vector<vector<u8>>,
        value_names: vector<vector<u8>>,
        ctx: &mut TxContext
    ) {
        // Create table metadata
        let metadata = TableMetadata {
            name,
            key_schemas,
            key_names,
            value_schemas,
            value_names
        };
        table::add(&mut self.metadatas, table_id, metadata);

        // Create table data storage
        let table_data = table::new(ctx);
        table::add(&mut self.tables, table_id, table_data);
    }

    /// Set a record
    public(package) fun set_record(
        self: &mut DappState,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        value_tuple: vector<vector<u8>>
    ) {
        assert!(table::contains(&self.tables, table_id), EInvalidTableId);
        
        // Get table data
        let table = table::borrow_mut(&mut self.tables, table_id);
        
        // Store data
        if (table::contains(table, key_tuple)) {
            let value = table::borrow_mut(table, key_tuple);
            *value = value_tuple;
        } else {
            table::add(table, key_tuple, value_tuple);
        };
    }

    /// Set a field
    public(package) fun set_field(
        self: &mut DappState,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8,
        value: vector<u8>
    ) {
        assert!(table::contains(&self.tables, table_id), EInvalidTableId);
        
        // Get table data
        let table = table::borrow_mut(&mut self.tables, table_id);
        
        // Get existing data
        let value_tuple = if (table::contains(table, key_tuple)) {
            table::borrow_mut(table, key_tuple)
        } else {
                // Create a new record
            let mut new_value = vector::empty();
            let metadata = table::borrow(&self.metadatas, table_id);
            let field_count = vector::length(&metadata.value_schemas);
            let mut i = 0;
            while (i < field_count) {
                vector::push_back(&mut new_value, vector::empty());
                i = i + 1;
            };
            table::add(table, key_tuple, new_value);
            table::borrow_mut(table, key_tuple)
        };

        // Update field
        *vector::borrow_mut(value_tuple, field_index as u64) = value;
    }

    /// Get a record
    public fun get_record(
        self: &DappState,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ): vector<u8> {
        assert!(table::contains(&self.tables, table_id), EInvalidTableId);
        let table = table::borrow(&self.tables, table_id);
        assert!(table.contains(key_tuple), EInvalidKey);
        let value_tuple = table.borrow(key_tuple);   
        let mut result = vector::empty();
        let mut i = 0;
        while (i < vector::length(value_tuple)) {
            let value = vector::borrow(value_tuple, i);
            assert!(!value.is_empty(), EInvalidValue);
            vector::append(&mut result, *value);
            i = i + 1;
        };
       result
    }

    /// Get a field
    public fun get_field(
        self: &DappState,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8
    ): vector<u8> {
        assert!(table::contains(&self.tables, table_id), EInvalidTableId);
        let table = table::borrow(&self.tables, table_id);
        assert!(table::contains(table, key_tuple), EInvalidKey);
        let field = vector::borrow(table::borrow(table, key_tuple), field_index as u64);
        assert!(!field.is_empty(), EInvalidValue);
        *field
    }

    public fun has_record(
        self: &DappState,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ): bool {
        if (!table::contains(&self.tables, table_id)) {
            return false
        };
        let table = table::borrow(&self.tables, table_id);
        if (!table::contains(table, key_tuple)) {
            return false
        };
        let value_tuple = table::borrow(table, key_tuple);
        let mut i = 0;
        while (i < vector::length(value_tuple)) {
            let value = vector::borrow(value_tuple, i);
            if (value.is_empty()) {
                return false
            };
            i = i + 1;
        };
        true
    }

    public fun has_field(
        self: &DappState,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>,
        field_index: u8
    ): bool {
        if (!table::contains(&self.tables, table_id)) {
            return false
        };
        let table = table::borrow(&self.tables, table_id);
        if (!table::contains(table, key_tuple)) {
            return false
        };
        let value_tuple = table::borrow(table, key_tuple);
        if (vector::length(value_tuple) <= field_index as u64) {
            return false
        };
        if (vector::borrow(value_tuple, field_index as u64).is_empty()) {
            return false
        };
        true
    }

    public fun delete_record(
        self: &mut DappState,
        table_id: vector<u8>,
        key_tuple: vector<vector<u8>>
    ) {
        assert!(table::contains(&self.tables, table_id), EInvalidTableId);
        let table = table::borrow_mut(&mut self.tables, table_id);
        table::remove(table, key_tuple);
    }

    public fun name(self: &DappState): String {
        self.name
    }

    public fun description(self: &DappState): String {
        self.description
    }

    public fun dapp_key(self: &DappState): String {
        self.dapp_key
    }

    public fun packages(self: &DappState): vector<address> {
        self.packages
    }

    public fun version(self: &DappState): u32 {
        self.version
    }

    public fun metadatas(self: &DappState): &Table<vector<u8>, TableMetadata> {
        &self.metadatas
    }

    public fun tables(self: &DappState): &Table<vector<u8>, Table<vector<vector<u8>>, vector<vector<u8>>>> {
        &self.tables
    }

    public fun objects(self: &DappState): &Bag {
        &self.objects
    }

    public(package) fun mut_name(self: &mut DappState): &mut String {
        &mut self.name
    }

    public(package) fun mut_description(self: &mut DappState): &mut String {
        &mut self.description
    }

    public(package) fun mut_dapp_key(self: &mut DappState): &mut String {
        &mut self.dapp_key
    }

    public(package) fun mut_packages(self: &mut DappState): &mut vector<address> {
        &mut self.packages
    }

    public(package) fun mut_version(self: &mut DappState): &mut u32 {
        &mut self.version
    }

    public(package) fun mut_metadatas(self: &mut DappState): &mut Table<vector<u8>, TableMetadata> {
        &mut self.metadatas
    }

    public(package) fun mut_tables(self: &mut DappState): &mut Table<vector<u8>, Table<vector<vector<u8>>, vector<vector<u8>>>> {
        &mut self.tables
    }

    public(package) fun mut_objects(self: &mut DappState): &mut Bag {
        &mut self.objects
    }
}