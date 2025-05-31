use sui_types::base_types::SuiAddress;
use move_core_types::u256::U256;
use bcs;
use serde_json;
use serde_json::Value;

pub const ONCHAIN_TABLE: &str = "ont";
pub const OFFCHAIN_TABLE: &str = "oft";

pub fn get_name(table_id: &Vec<u8>) -> String {
    // Remove prefix (ont or oft) and return the remaining part as table name
    if let Some(stripped) = String::from_utf8_lossy(&table_id[3..]).strip_prefix("ont") {
        stripped.to_string()
    } else if let Some(stripped) = String::from_utf8_lossy(&table_id[3..]).strip_prefix("oft") {
        stripped.to_string()
    } else {
        String::from_utf8_lossy(&table_id[3..]).to_string()
    }
}

pub fn parse_table_id(table_id: &Vec<u8>) -> (String, String) {
    let ty = if table_id.starts_with(ONCHAIN_TABLE.as_bytes()) {
        ONCHAIN_TABLE.to_string()
    } else {
        OFFCHAIN_TABLE.to_string()
    };
    let name = String::from_utf8_lossy(&table_id[3..]).to_string();
    (ty, name)
}

pub fn parse_table_field(field_name: &[u8], field_type: &[u8], field_value: &[u8]) -> Value {
    let field_name_str = String::from_utf8_lossy(field_name);
    let field_type_str = String::from_utf8_lossy(field_type);
    
    let value = match field_type_str.as_ref() {
        "u8" => {
            let v: u8 = bcs::from_bytes(field_value).unwrap();
            serde_json::json!({ field_name_str: v })
        },
        "u16" => {
            let v: u16 = bcs::from_bytes(field_value).unwrap();
            serde_json::json!({ field_name_str: v })
        },
        "u32" => {
            let v: u32 = bcs::from_bytes(field_value).unwrap();
            serde_json::json!({ field_name_str: v })
        },
        "u64" => {
            let v: u64 = bcs::from_bytes(field_value).unwrap();
            serde_json::json!({ field_name_str: v })
        },
        "u128" => {
            let v: u128 = bcs::from_bytes(field_value).unwrap();
            serde_json::json!({ field_name_str: v })
        },
        "u256" => {
            let v: U256 = bcs::from_bytes(field_value).unwrap();
            serde_json::json!({ field_name_str: v.to_string() })
        },
        "bool" => {
            let v: bool = bcs::from_bytes(field_value).unwrap();
            serde_json::json!({ field_name_str: v })
        },
        "address" => {
            let v: SuiAddress = bcs::from_bytes(field_value).unwrap();
            serde_json::json!({ field_name_str: v })
        },
        "vector<u8>" => {
            let v: Vec<u8> = bcs::from_bytes(field_value).unwrap();
            serde_json::json!({ field_name_str: v })
        },
        _ => {
            let v: Vec<u8> = bcs::from_bytes(field_value).unwrap();
            serde_json::json!({ field_name_str: v })
        }
    };
    
    value
}

pub fn parse_table_tuple(names: Vec<Vec<u8>>, types: Vec<Vec<u8>>, tuple: Vec<Vec<u8>>) -> Value {
    let mut result = serde_json::json!({});
    
    for ((name, type_), value) in names.iter().zip(types.iter()).zip(tuple.iter()) {
        let field_json = parse_table_field(name, type_, value);
        if let Some((key, value)) = field_json.as_object().unwrap().into_iter().next() {
            result[key] = value.clone();
        }
    }
    
    result
}