use anyhow::Result;
use async_trait::async_trait;
use diesel_async::RunQueryDsl;
use std::fs;
use serde_json::Value;
use sui_data_ingestion_core::Worker;
use sui_types::full_checkpoint_content::CheckpointData;
use sui_types::base_types::ObjectID;
use std::str::FromStr;
use bcs;
use diesel::prelude::*;
use diesel::sql_types::{Text, Integer, Bool, Nullable};

use crate::{
    config::TableSchema,
    events::{StorageSetRecord, StoreSetField},
    sql::{generate_update_sql, generate_insert_sql},
    db::PgConnectionPool,
    notify::{notify_store_change, setup_notification_triggers, create_table_trigger},
};
use crate::table::parse_table_tuple;
use crate::table::parse_table_field;

#[derive(QueryableByName)]
pub struct TableField {
    #[diesel(sql_type = Text)]
    pub field_name: String,
    #[diesel(sql_type = Text)]
    pub field_type: String,
    #[diesel(sql_type = Nullable<Integer>)]
    pub field_index: Option<i32>,
    #[diesel(sql_type = Bool)]
    pub is_key: bool,
}

pub struct DubheIndexerWorker {
    pub pg_pool: PgConnectionPool,
}

impl DubheIndexerWorker {
    pub async fn create_tables_from_config(&self, config_path: &str) -> Result<()> {
        let content = fs::read_to_string(config_path)?;
        let json: Value = serde_json::from_str(&content)?;
        
        let tables = TableSchema::from_json(&json)?;
        println!("Tables: {:?}", tables);
        let mut conn = self.pg_pool.get().await?;
        
        // Create table_fields table first
        diesel::sql_query(
            "CREATE TABLE IF NOT EXISTS table_fields (
                table_name VARCHAR(255),
                field_name VARCHAR(255),
                field_type VARCHAR(50),
                field_index INTEGER,
                is_key BOOLEAN,
                PRIMARY KEY (table_name, field_name)
            )"
        )
        .execute(&mut conn)
        .await?;

        // Clear existing table_fields data
        diesel::sql_query("TRUNCATE TABLE table_fields")
            .execute(&mut conn)
            .await?;
        
        // 设置通知触发器函数
        setup_notification_triggers(&mut conn).await?;
        
        for table in tables {
            println!("Creating table: {}", table.name);
            println!("Key fields: {:?}", table.key_fields);
            println!("Value fields: {:?}", table.value_fields);
            
            // Create store table
            let sql = table.generate_create_table_sql();
            println!("SQL: {}", sql);
            diesel::sql_query(&sql)
                .execute(&mut conn)
                .await?;
            
            // Insert table fields metadata
            for field_sql in table.generate_table_fields_sql() {
                diesel::sql_query(&field_sql)
                    .execute(&mut conn)
                    .await?;
            }
            
            // 为每个表创建触发器
            let table_name_with_prefix = format!("store_{}", table.name);
            create_table_trigger(&mut conn, &table_name_with_prefix, &["INSERT", "UPDATE", "DELETE"]).await?;
        }
        
        Ok(())
    }

    pub async fn get_table_field_info(&self, table_name: &str) -> Result<Vec<(String, String, Option<i32>, bool)>> {
        let mut conn = self.pg_pool.get().await?;
        let fields = diesel::sql_query(
            "SELECT field_name, field_type, field_index, is_key 
             FROM table_fields 
             WHERE table_name = $1 
             ORDER BY is_key DESC, field_index ASC"
        )
        .bind::<diesel::sql_types::Text, _>(table_name)
        .load::<TableField>(&mut conn)
        .await?;
        
        Ok(fields.into_iter().map(|f| (f.field_name, f.field_type, f.field_index, f.is_key)).collect())
    }

    pub async fn handle_store_set_record(&self, set_record: &StorageSetRecord) -> Result<()> {
        let mut conn = self.pg_pool.get().await?;
        let table_name = String::from_utf8_lossy(&set_record.table_id[3..]).to_string();
        println!("Table name: {}", table_name);
        
        // Get table field information from database
        let fields = self.get_table_field_info(&table_name).await?;
        
        // Separate key and value fields
        let mut key_fields = Vec::new();
        let mut value_fields = Vec::new();
        
        for (field_name, field_type, _field_index, is_key) in fields {
            if is_key {
                key_fields.push((field_name, field_type));
            } else {
                value_fields.push((field_name, field_type));
            }
        }

        // Convert fields to Vec<Vec<u8>> for parse_table_tuple
        let key_names: Vec<Vec<u8>> = key_fields.iter().map(|(name, _)| name.as_bytes().to_vec()).collect();
        let key_types: Vec<Vec<u8>> = key_fields.iter().map(|(_, type_)| type_.as_bytes().to_vec()).collect();
        let value_names: Vec<Vec<u8>> = value_fields.iter().map(|(name, _)| name.as_bytes().to_vec()).collect();
        let value_types: Vec<Vec<u8>> = value_fields.iter().map(|(_, type_)| type_.as_bytes().to_vec()).collect();

        // Parse key and value
        let key_values = parse_table_tuple(key_names, key_types, set_record.key_tuple.clone());
        let value_values = parse_table_tuple(value_names, value_types, set_record.value_tuple.clone());

        println!("Key values: {:?}", key_values);
        println!("Value values: {:?}", value_values);

        // Generate and execute SQL
        let sql = generate_insert_sql(
            &table_name,
            &key_fields,
            &value_fields,
            &key_values,
            &value_values,
        );

        println!("Final SQL: {}", sql);
        
        // Execute SQL with proper error handling
        match diesel::sql_query(&sql).execute(&mut conn).await {
            Ok(rows_affected) => {
                println!("Successfully executed SQL, rows affected: {}", rows_affected);
            },
            Err(e) => {
                eprintln!("Error executing SQL: {:?}", e);
                eprintln!("Failed SQL: {}", sql);
                // Return the error instead of continuing
                return Err(e.into());
            }
        }

        // 发送通知
        let key_json_values: Vec<(String, serde_json::Value)> = key_fields.iter()
            .map(|(name, _)| {
                let value = key_values.get(name).unwrap_or(&serde_json::Value::Null);
                (name.clone(), value.clone())
            })
            .collect();
            
        let value_json_values: Vec<(String, serde_json::Value)> = value_fields.iter()
            .map(|(name, _)| {
                let value = value_values.get(name).unwrap_or(&serde_json::Value::Null);
                (name.clone(), value.clone())
            })
            .collect();
            
        if let Err(e) = notify_store_change(&mut conn, &table_name, "create", &key_json_values, &value_json_values).await {
            eprintln!("Error sending notification: {:?}", e);
            // Continue processing even if notification fails
        }

        Ok(())
    }

    pub async fn handle_store_set_field(&self, set_field: &StoreSetField) -> Result<()> {
        let mut conn = self.pg_pool.get().await?;
        let table_name = String::from_utf8_lossy(&set_field.table_id[3..]).to_string();
        println!("Table name: {}", table_name);
        
        // Get table field information from database
        let fields = self.get_table_field_info(&table_name).await?;
        
        // Separate key and value fields
        let mut key_fields = Vec::new();
        let mut value_fields = Vec::new();
        
        for (field_name, field_type, _field_index, is_key) in fields {
            if is_key {
                key_fields.push((field_name, field_type));
            } else {
                value_fields.push((field_name, field_type));
            }
        }
        
        // Get field information to be updated
        let (field_name, field_type) = value_fields.get(set_field.field_index as usize)
            .ok_or_else(|| anyhow::anyhow!("Field index out of range"))?;
        
        println!("Updating field: {} with type: {}", field_name, field_type);
        
        // Convert key fields to Vec<Vec<u8>> for parse_table_tuple
        let key_names: Vec<Vec<u8>> = key_fields.iter().map(|(name, _)| name.as_bytes().to_vec()).collect();
        let key_types: Vec<Vec<u8>> = key_fields.iter().map(|(_, type_)| type_.as_bytes().to_vec()).collect();
        
        // Parse key
        let key_values = parse_table_tuple(key_names, key_types, set_field.key_tuple.clone());
        
        // Parse value to be updated
        let value_json = parse_table_field(&field_name.as_bytes().to_vec(), &field_type.as_bytes().to_vec(), &set_field.value);
        let value = value_json.get(field_name).unwrap();
        
        // Generate and execute SQL
        let sql = generate_update_sql(
            &table_name,
            field_name,
            field_type,
            value,
            &key_fields,
            &key_values,
        );

        println!("Update SQL: {}", sql);
        
        // Execute SQL with proper error handling
        match diesel::sql_query(&sql).execute(&mut conn).await {
            Ok(rows_affected) => {
                println!("Successfully executed update SQL, rows affected: {}", rows_affected);
            },
            Err(e) => {
                eprintln!("Error executing update SQL: {:?}", e);
                eprintln!("Failed SQL: {}", sql);
                // Return the error instead of continuing
                return Err(e.into());
            }
        }
        
        // 发送通知
        let key_json_values: Vec<(String, serde_json::Value)> = key_fields.iter()
            .map(|(name, _)| {
                let value = key_values.get(name).unwrap_or(&serde_json::Value::Null);
                (name.clone(), value.clone())
            })
            .collect();
            
        let updated_value = vec![(field_name.clone(), value.clone())];
        
        if let Err(e) = notify_store_change(&mut conn, &table_name, "update", &key_json_values, &updated_value).await {
            eprintln!("Error sending notification: {:?}", e);
            // Continue processing even if notification fails
        }
        
        Ok(())
    }
}

#[async_trait]
impl Worker for DubheIndexerWorker {
    type Result = ();
    async fn process_checkpoint(&self, checkpoint: &CheckpointData) -> Result<()> {
        println!("Processing checkpoint: {:?}", checkpoint.checkpoint_summary.sequence_number);
        let mut set_record_count = 0;
        let mut set_field_count = 0;
        
        for transaction in &checkpoint.transactions {
            let maybe_events = &transaction.events;
            if let Some(events) = maybe_events {
                for event in &events.data {
                    let package_id = std::env::var("PACKAGE_ID").unwrap_or_else(|_| "0x30eba12b78bfe6b292975d0f194e4f231adca8389efb577e51e4018ef42568fa".to_string());
                    if event.package_id == ObjectID::from_str(&package_id).unwrap() {
                        println!("Event: {:?}", event);
                        println!("================================================");
                        
                        if event.type_.name.to_string() == "StoreSetRecord" {
                            let set_record: StorageSetRecord = bcs::from_bytes(event.contents.as_slice())
                                .expect("Failed to parse set record");
                            println!("Set record: {:?}", set_record);
                            
                            // Process StoreSetRecord event
                            self.handle_store_set_record(&set_record).await?;
                            set_record_count += 1;
                        }

                        if event.type_.name.to_string() == "StoreSetField" {
                            let set_field: StoreSetField = bcs::from_bytes(event.contents.as_slice())
                                .expect("Failed to parse set field");
                            
                            println!("Set field: {:?}", set_field);
                            // Process StoreSetField event
                            self.handle_store_set_field(&set_field).await?;
                            set_field_count += 1;
                        }
                    }
                }
            }
        }

        println!("Set record count: {:?}", set_record_count);
        println!("Set field count: {:?}", set_field_count);

        Ok(())
    }
} 