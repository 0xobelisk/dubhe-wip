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
    
    // Generate conflict columns (primary key columns)
    let conflict_columns: Vec<String> = key_fields.iter()
        .map(|(field_name, _)| field_name.clone())
        .collect();
    
    // Generate update clauses for value fields
    let mut update_clauses = Vec::new();
    for (field_name, field_type) in value_fields {
        update_clauses.push(format!(
            "{} = {}",
            field_name,
            format_sql_value(&value_values[field_name], field_type)
        ));
    }
    
    let base_sql = format!(
        "INSERT INTO store_{} ({}) VALUES ({})",
        table_name,
        fields.join(", "),
        values.join(", ")
    );
    
    // Add ON CONFLICT clause if there are key fields and value fields to update
    if !conflict_columns.is_empty() && !update_clauses.is_empty() {
        format!(
            "{} ON CONFLICT ({}) DO UPDATE SET {}",
            base_sql,
            conflict_columns.join(", "),
            update_clauses.join(", ")
        )
    } else if !conflict_columns.is_empty() {
        // If no value fields to update, just ignore conflicts
        format!(
            "{} ON CONFLICT ({}) DO NOTHING",
            base_sql,
            conflict_columns.join(", ")
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