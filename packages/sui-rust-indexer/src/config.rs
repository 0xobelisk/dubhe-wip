use anyhow::Result;
use serde::{Deserialize};
use serde_json::Value;

#[derive(Debug, Deserialize, Clone)]
pub struct SchemaField {
    #[serde(flatten)]
    pub fields: std::collections::HashMap<String, String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TableConfig {
    pub fields: Vec<SchemaField>,
    pub keys: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TableDefinition {
    #[serde(flatten)]
    pub tables: std::collections::HashMap<String, TableConfig>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub components: Vec<TableDefinition>,
    pub resources: Vec<TableDefinition>,
}

#[derive(Debug)]
pub struct TableField {
    pub table_name: String,
    pub field_name: String,
    pub field_type: String,
    pub field_index: Option<i32>,
    pub is_key: bool,
}

#[derive(Debug)]
pub struct TableSchema {
    pub name: String,
    pub table_type: String,
    pub key_fields: Vec<(String, String)>,
    pub value_fields: Vec<(String, String)>,
}

impl TableSchema {
    pub fn from_json(json: &Value) -> Result<Vec<TableSchema>> {
        let config: Config = serde_json::from_value(json.clone())?;
        let mut tables = Vec::new();
        
        // 处理 components
        for table_def in config.components {
            for (table_name, table_config) in table_def.tables {
                let mut key_fields = Vec::new();
                let mut value_fields = Vec::new();

                // 处理每个字段
                for schema in &table_config.fields {
                    for (field_name, field_type) in &schema.fields {
                        if table_config.keys.contains(field_name) {
                            key_fields.push((field_name.clone(), field_type.clone()));
                        } else {
                            value_fields.push((field_name.clone(), field_type.clone()));
                        }
                    }
                }

                tables.push(TableSchema {
                    name: table_name,
                    table_type: "component".to_string(),
                    key_fields,
                    value_fields,
                });
            }
        }

        // 处理 resources
        for table_def in config.resources {
            for (table_name, table_config) in table_def.tables {
                let mut key_fields = Vec::new();
                let mut value_fields = Vec::new();

                // 处理每个字段
                for schema in &table_config.fields {
                    for (field_name, field_type) in &schema.fields {
                        if table_config.keys.contains(field_name) {
                            key_fields.push((field_name.clone(), field_type.clone()));
                        } else {
                            value_fields.push((field_name.clone(), field_type.clone()));
                        }
                    }
                }

                tables.push(TableSchema {
                    name: table_name,
                    table_type: "resource".to_string(),
                    key_fields,
                    value_fields,
                });
            }
        }

        Ok(tables)
    }

    pub fn generate_create_table_sql(&self) -> String {
        let mut fields = Vec::new();
        
        // Add key fields
        for (name, type_) in &self.key_fields {
            fields.push(format!("{} {}", name, self.get_sql_type(type_)));
        }
        
        // Add value fields
        for (name, type_) in &self.value_fields {
            fields.push(format!("{} {}", name, self.get_sql_type(type_)));
        }
        
        // Always add created_at and updated_at fields
        fields.push("created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP".to_string());
        fields.push("updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP".to_string());
        
        // Add primary key constraint only if there are key fields
        if !self.key_fields.is_empty() {
            let key_names: Vec<String> = self.key_fields.iter()
                .map(|(name, _)| name.clone())
                .collect();
            
            fields.push(format!("PRIMARY KEY ({})", key_names.join(", ")));
        }
        
        format!(
            "CREATE TABLE IF NOT EXISTS store_{} ({})",
            self.name,
            fields.join(", ")
        )
    }

    pub fn generate_table_fields_sql(&self) -> Vec<String> {
        let mut sql_statements = Vec::new();
        let mut value_index = 0;

        // Add key fields
        for (name, type_) in &self.key_fields {
            sql_statements.push(format!(
                "INSERT INTO table_fields (table_name, field_name, field_type, field_index, is_key) \
                VALUES ('{}', '{}', '{}', NULL, true)",
                self.name, name, type_
            ));
        }

        // Add value fields
        for (name, type_) in &self.value_fields {
            sql_statements.push(format!(
                "INSERT INTO table_fields (table_name, field_name, field_type, field_index, is_key) \
                VALUES ('{}', '{}', '{}', {}, false)",
                self.name, name, type_, value_index
            ));
            value_index += 1;
        }

        // Add timestamp fields to metadata
        sql_statements.push(format!(
            "INSERT INTO table_fields (table_name, field_name, field_type, field_index, is_key) \
            VALUES ('{}', 'created_at', 'timestamptz', NULL, false)",
            self.name
        ));
        
        sql_statements.push(format!(
            "INSERT INTO table_fields (table_name, field_name, field_type, field_index, is_key) \
            VALUES ('{}', 'updated_at', 'timestamptz', NULL, false)",
            self.name
        ));

        sql_statements
    }

    fn get_sql_type(&self, type_: &str) -> String {
        match type_ {
            "u8" => "SMALLINT",
            "u16" => "INTEGER",
            "u32" => "BIGINT",
            "u64" => "BIGINT",
            "u128" => "NUMERIC",
            "u256" => "NUMERIC",
            "vector<u8>" => "SMALLINT[]",
            "vector<u16>" => "INTEGER[]",
            "vector<u32>" => "BIGINT[]",
            "vector<u64>" => "BIGINT[]",
            "vector<u128>" => "NUMERIC[]",
            "vector<u256>" => "NUMERIC[]",
            "vector<address>" => "TEXT[]",
            "bool" => "BOOLEAN",
            _ => "TEXT",
        }.to_string()
    }
} 