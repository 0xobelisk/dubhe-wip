module dubhe::dapp_hub {
    use std::ascii::String;
    use std::type_name;
    use dubhe::dapp_state::DappState;
    use sui::object_table::ObjectTable;
    use sui::object_table;
    use dubhe::dapp_state;
    use dubhe::dubhe_dapp_key;
    use sui::bag;
    use sui::bag::Bag;
    use sui::clock::{Clock};

    /// Error codes
    const EInvalidTableId: u64 = 1;
    const ENoPermissionPackageId: u64 = 2;

    /// Storage structure
    public struct DappHub has key, store {
        id: UID,
        dapps: ObjectTable<String, DappState>,
    }

    /// Create a new storage instance
    public(package) fun new(ctx: &mut TxContext): DappHub {
        DappHub {
            id: object::new(ctx),
            dapps: object_table::new(ctx),
        }
    }

    fun init(ctx: &mut TxContext) {
        sui::transfer::public_share_object(
            new(ctx)
        );
    }

    public fun create_dapp<DappKey: copy + drop>(
        self: &mut DappHub, 
        dapp_key: DappKey, 
        name: vector<u8>, 
        description: vector<u8>, 
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let dapp = dapp_state::new(dapp_key, name, description, clock, ctx);
        let dapp_key = type_name::get<DappKey>().into_string();
        object_table::add(&mut self.dapps, dapp_key, dapp);
    }

    public fun dapp_state(self: &DappHub, dapp_key: String): &DappState {
        object_table::borrow(&self.dapps, dapp_key)
    }

    public fun mut_dapp_state<DappKey: copy + drop>(self: &mut DappHub, _: DappKey): &mut DappState {
        let dapp_key = type_name::get<DappKey>().into_string();
        let dapp_state = object_table::borrow_mut(&mut self.dapps, dapp_key);
        assert!(dapp_state.dapp_key() == dapp_key, ENoPermissionPackageId);
        dapp_state
    }

    public fun mut_dapp_state_objects<DappKey: copy + drop>(self: &mut DappHub, dapp_key: DappKey): &mut Bag {
        let dapp_state = mut_dapp_state(self, dapp_key);
        dapp_state.mut_objects()
    }

    public fun mut_dubhe_state(self: &mut DappHub): &mut DappState {
        let dapp_key = dubhe_dapp_key::to_string();
        object_table::borrow_mut(&mut self.dapps, dapp_key)
    }   

    #[test_only]
    public fun create_dapp_hub_for_testing(ctx: &mut TxContext): DappHub {
        DappHub {
            id: object::new(ctx),
            dapps: object_table::new(ctx),
        }
    }

    #[test_only]
    public fun destroy(dapp_hub: DappHub) {
        let DappHub { id, dapps } = dapp_hub;
        object::delete(id);
        sui::transfer::public_freeze_object(dapps);
    }
}