use crate::{config::Args, error::Error};
use serde::Deserialize;
use std::fs;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct TableJsonInfo {
    pub fields: Vec<HashMap<String, String>>,
    pub keys: Vec<String>,
    pub offchain: bool,
}

#[derive(Debug, Deserialize)]
pub struct DubheConfigJson {
    pub components: Vec<HashMap<String, TableJsonInfo>>,
    pub resources: Vec<HashMap<String, TableJsonInfo>>,
    pub enums: Vec<HashMap<String, Vec<HashMap<String, String>>>>,
    pub package_id: Option<String>,
}

#[derive(Debug)]
pub struct TableField {
    pub field_name: String,
    pub field_type: String,
    pub field_index: u8,
}

#[derive(Debug)]
pub struct TableMetadata {
    pub name: String,
    pub table_type: String,
    pub key_fields: Vec<TableField>,
    pub value_fields: Vec<TableField>,
    pub offchain: bool,
}

impl TableMetadata {
    pub fn new(args: &Args) -> Result<(String, Vec<TableMetadata>), Error> {
      let content = fs::read_to_string(&args.config_json)?;
      let json: Value = serde_json::from_str(&content)?;
        let dubhe_config_json: DubheConfigJson = serde_json::from_value(json)?;
        let mut final_tables = Vec::new();

        // handle components
        for tables in dubhe_config_json.components {
            for (table_name, table_info) in tables {
                let mut key_fields = Vec::new();
                let mut value_fields = Vec::new();
                let offchain = table_info.offchain;

                for field in table_info.fields {
                    let mut key_field_index = 0;
                    let mut value_field_index = 0;
                    field.into_iter().for_each(|(field_name, field_type)| {
                        if table_info.keys.contains(&field_name) {
                            key_fields.push(TableField {
                                field_name,
                                field_type,
                                field_index: key_field_index,
                            });
                            key_field_index += 1;
                        } else {
                            value_fields.push(TableField {
                                field_name,
                                field_type,
                                field_index: value_field_index,
                            });
                            value_field_index += 1;
                        }
                    });
                }

                final_tables.push(TableMetadata {
                    name: table_name,
                    table_type: "component".to_string(),
                    key_fields,
                    value_fields,
                    offchain,
                });
            }
        }

        // handle resources
        for tables in dubhe_config_json.resources {
            for (table_name, table_info) in tables {
                let mut key_fields = Vec::new();
                let mut value_fields = Vec::new();
                let offchain = table_info.offchain;
                for (field) in table_info.fields {
                    let mut key_field_index = 0;
                    let mut value_field_index = 0;
                    field.into_iter().for_each(|(field_name, field_type)| {
                        if table_info.keys.contains(&field_name) {
                            key_fields.push(TableField {
                                field_name,
                                field_type,
                                field_index: key_field_index,
                            });
                            key_field_index += 1;
                        } else {
                            value_fields.push(TableField {
                                field_name,
                                field_type,
                                field_index: value_field_index,
                            });
                            value_field_index += 1;
                        }
                    });
                }
                final_tables.push(TableMetadata {
                    name: table_name,
                    table_type: "resource".to_string(),
                    key_fields,
                    value_fields,
                    offchain,
                });
            }
        }

        if dubhe_config_json.package_id.is_none() {
            return Err(Error::Config("No package id found in config file".to_string()));
        }

        let package_id = dubhe_config_json.package_id.unwrap();

        Ok((package_id, final_tables))
    }
}