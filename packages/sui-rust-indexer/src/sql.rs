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
    
    // Add value fields (including timestamp fields from config.rs)
    for (field_name, field_type) in value_fields {
        fields.push(field_name.clone());
        
        // Handle timestamp fields specially
        if field_name == "created_at" {
            values.push("DEFAULT".to_string());  // Use table default for created_at
        } else if field_name == "updated_at" {
            values.push("CURRENT_TIMESTAMP".to_string());  // Set current time for updated_at
        } else {
            values.push(format_sql_value(&value_values[field_name], field_type));
        }
    }
    
    // Generate conflict columns (primary key columns)
    let conflict_columns: Vec<String> = key_fields.iter()
        .map(|(field_name, _)| field_name.clone())
        .collect();
    
    // Generate update clauses for value fields (excluding created_at, handling updated_at specially)
    let mut update_clauses = Vec::new();
    for (field_name, field_type) in value_fields {
        if field_name == "created_at" {
            // Don't update created_at on conflict - keep original value
            continue;
        } else if field_name == "updated_at" {
            // Always update updated_at to current timestamp on conflict
            update_clauses.push("updated_at = CURRENT_TIMESTAMP".to_string());
        } else {
            update_clauses.push(format!(
                "{} = {}",
                field_name,
                format_sql_value(&value_values[field_name], field_type)
            ));
        }
    }
    
    let base_sql = format!(
        "INSERT INTO store_{} ({}) VALUES ({})",
        table_name,
        fields.join(", "),
        values.join(", ")
    );
    
    // Add ON CONFLICT clause if there are key fields
    if !conflict_columns.is_empty() {
        format!(
            "{} ON CONFLICT ({}) DO UPDATE SET {}",
            base_sql,
            conflict_columns.join(", "),
            update_clauses.join(", ")
        )
    } else {
        base_sql
    }
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
    for (key_field_name, key_field_type) in key_fields {
        where_clause.push(format!(
            "{} = {}",
            key_field_name,
            format_sql_value(&key_values[key_field_name], key_field_type)
        ));
    }
    
    format!(
        "UPDATE store_{} SET {} = {}, updated_at = CURRENT_TIMESTAMP WHERE {}",
        table_name,
        field_name,
        format_sql_value(value, field_type),
        where_clause.join(" AND ")
    )
} 