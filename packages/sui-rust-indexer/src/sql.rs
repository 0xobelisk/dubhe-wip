use serde_json::Value;

fn format_sql_value(value: &Value, field_type: &str) -> String {
    match field_type {
        "bool" => {
            if value.is_boolean() {
                value.as_bool().unwrap().to_string()
            } else {
                "false".to_string()
            }
        },
        _ => {
            if value.is_string() {
                format!("'{}'", value.as_str().unwrap_or(""))
            } else {
                value.to_string()
            }
        }
    }
}

pub fn generate_insert_sql(
    table_name: &str,
    key_fields: &[(String, String)],
    value_fields: &[(String, String)],
    key_values: &Value,
    value_values: &Value,
) -> String {
    let mut fields = Vec::new();
    let mut values = Vec::new();
    
    // Add key fields
    for (field_name, field_type) in key_fields {
        fields.push(field_name.clone());
        values.push(format_sql_value(&key_values[field_name], field_type));
    }
    
    // Add value fields
    for (field_name, field_type) in value_fields {
        fields.push(field_name.clone());
        values.push(format_sql_value(&value_values[field_name], field_type));
    }
    
    format!(
        "INSERT INTO store_{} ({}) VALUES ({})",
        table_name,
        fields.join(", "),
        values.join(", ")
    )
}

pub fn generate_update_sql(
    table_name: &str,
    field_name: &str,
    field_type: &str,
    value: &Value,
    key_fields: &[(String, String)],
    key_values: &Value,
) -> String {
    let mut where_clause = Vec::new();
    
    // Add key fields to where clause
    for (field_name, field_type) in key_fields {
        where_clause.push(format!(
            "{} = {}",
            field_name,
            format_sql_value(&key_values[field_name], field_type)
        ));
    }
    
    format!(
        "UPDATE store_{} SET {} = {} WHERE {}",
        table_name,
        field_name,
        format_sql_value(value, field_type),
        where_clause.join(" AND ")
    )
} 