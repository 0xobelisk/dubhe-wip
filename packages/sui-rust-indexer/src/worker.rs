use crate::sui_data_ingestion_core::Worker;
use anyhow::Result;
use async_trait::async_trait;
use bcs;
use diesel::prelude::*;
use diesel::sql_types::{Bool, Integer, Nullable, Text};
use diesel_async::RunQueryDsl;
use serde_json::Value;
use std::fs;
use std::str::FromStr;
use sui_types::base_types::ObjectID;
use sui_types::full_checkpoint_content::CheckpointData;

use crate::{
    store::{StorageSetRecord, StoreSetField},
    config::TableMetadata,
};

pub struct DubheIndexerWorker {
    pub package_id: String,
    pub tables: Vec<TableMetadata>,
    pub with_graphql: bool,
}

impl DubheIndexerWorker {
    pub async fn clear_all_data(&self) -> Result<()> {
        
        Ok(())
    }

    pub async fn create_db_tables_from_config(&mut self) -> Result<()> {
        // println!("Tables: {:?}", self.tables);
        // let mut conn = self.pg_pool.get().await?;

        // // Create table_metadata table first
        // diesel::sql_query(
        //     "CREATE TABLE IF NOT EXISTS table_metadata (
        //         table_name VARCHAR(255),
        //         table_type VARCHAR(255),
        //         offchain BOOLEAN,
        //         PRIMARY KEY (table_name)
        //     )",
        // )
        // .execute(&mut conn)
        // .await?;

        // // Create table_fields table first
        // diesel::sql_query(
        //     "CREATE TABLE IF NOT EXISTS table_fields (
        //         table_name VARCHAR(255),
        //         field_name VARCHAR(255),
        //         field_type VARCHAR(50),
        //         field_index INTEGER,
        //         is_key BOOLEAN,
        //         PRIMARY KEY (table_name, field_name)
        //     )",
        // )
        // .execute(&mut conn)
        // .await?;

        // for table in &self.tables {
        //     println!("Creating table: {:?}", table);

        //     // Create store table
        //     diesel::sql_query(&table.generate_create_table_sql())
        //         .execute(&mut conn)
        //         .await?;

        //     // Insert table metadata
        //     diesel::sql_query(&table.generate_insert_table_metadata_sql())
        //         .execute(&mut conn)
        //         .await?;

        //     // Insert table fields metadata
        //     for field_sql in table.generate_insert_table_fields_sql() {
        //         diesel::sql_query(&field_sql).execute(&mut conn).await?;
        //     }
        // }

        Ok(())
    }

    pub async fn create_reader_progress_db_table(
        &self,
        start_checkpoint: u64,
        latest_checkpoint: u64,
        worker_pool_number: u32,
    ) -> Result<()> {
        // let mut conn = self.pg_pool.get().await?;
        // // Create reader_progress table first
        // diesel::sql_query(
        //     "CREATE TABLE IF NOT EXISTS reader_progress (
        //         progress_name VARCHAR(255),
        //         start_checkpoint BIGINT,
        //         end_checkpoint BIGINT,
        //         last_indexed_checkpoint BIGINT,
        //         PRIMARY KEY (progress_name)
        //     )",
        // )
        // .execute(&mut conn)
        // .await?;

        // diesel::sql_query(
        //     "INSERT INTO reader_progress (progress_name, start_checkpoint, end_checkpoint, last_indexed_checkpoint) 
        //      VALUES ($1, $2, $3, $4)
        //      ON CONFLICT (progress_name) 
        //      DO UPDATE SET start_checkpoint = $2, end_checkpoint = $3, last_indexed_checkpoint = $4"
        // )
        // .bind::<diesel::sql_types::Text, _>("latest_reader_progress")
        // .bind::<diesel::sql_types::Bigint, _>(0 as i64)
        // .bind::<diesel::sql_types::Bigint, _>(0 as i64)
        // .bind::<diesel::sql_types::Bigint, _>(latest_checkpoint as i64)
        // .execute(&mut conn)
        // .await?;

        // TODO: Split checkpoints into worker_pool_number parts
        // let total_checkpoints = latest_checkpoint - start_checkpoint + 1;
        // let checkpoints_per_worker = total_checkpoints / worker_pool_number as u64;
        // let remainder = total_checkpoints % worker_pool_number as u64;

        // for i in 0..worker_pool_number {
        //     let worker_start = start_checkpoint + (i as u64 * checkpoints_per_worker);
        //     let worker_end = if i == worker_pool_number - 1 {
        //         // 最后一个 worker 处理剩余的检查点
        //         end_checkpoint
        //     } else {
        //         worker_start + checkpoints_per_worker - 1
        //     };

        //     let progress_name = format!("task_{}", i);
        //     diesel::sql_query(
        //         "INSERT INTO reader_progress (progress_name, start_checkpoint, end_checkpoint, last_indexed_checkpoint)
        //          VALUES ($1, $2, $3, $4)
        //          ON CONFLICT (progress_name)
        //          DO UPDATE SET start_checkpoint = $2, end_checkpoint = $3, last_indexed_checkpoint = $4"
        //     )
        //     .bind::<diesel::sql_types::Text, _>(progress_name)
        //     .bind::<diesel::sql_types::Bigint, _>(worker_start as i64)
        //     .bind::<diesel::sql_types::Bigint, _>(worker_end as i64)
        //     .bind::<diesel::sql_types::Bigint, _>(worker_start as i64)
        //     .execute(&mut conn)
        //     .await?;
        // }

        Ok(())
    }

    pub async fn handle_store_set_record(&self, current_checkpoint: u64, set_record: &StorageSetRecord) -> Result<()> {
        // let mut conn = self.pg_pool.get().await?;
        // let table_name = String::from_utf8_lossy(&set_record.table_id[3..]).to_string();
        // println!("Table name: {}", table_name);

        // // Get table field information from database
        // let table_metadata = self
        //     .tables
        //     .iter()
        //     .find(|t| t.name == table_name)
        //     .expect("Table not found");

        // // Separate key and value fields
        // let mut key_fields = Vec::new();
        // let mut value_fields = Vec::new();

        // for field in &table_metadata.fields {
        //     if field.is_key {
        //         key_fields.push((field.field_name.clone(), field.field_type.clone()));
        //     } else {
        //         value_fields.push((field.field_name.clone(), field.field_type.clone()));
        //     }
        // }
        // // Parse key and value
        // let key_values = table_metadata.parse_table_keys(set_record.key_tuple.clone());
        // let value_values = table_metadata.parse_table_values(set_record.value_tuple.clone());

        // println!("Key values: {:?}", key_values);
        // println!("Value values: {:?}", value_values);

        // Generate and execute SQL
        // let sql = generate_set_record_sql(
        //     current_checkpoint,
        //     &table_name,
        //     &key_fields,
        //     &value_fields,
        //     &key_values,
        //     &value_values,
        // );

        // println!("Final SQL: {}", sql);

        // // Execute SQL with proper error handling
        // match diesel::sql_query(&sql).execute(&mut conn).await {
        //     Ok(rows_affected) => {
        //         println!(
        //             "Successfully executed SQL, rows affected: {}",
        //             rows_affected
        //         );
        //     }
        //     Err(e) => {
        //         eprintln!("Error executing SQL: {:?}", e);
        //         eprintln!("Failed SQL: {}", sql);
        //         // Return the error instead of continuing
        //         return Err(e.into());
        //     }
        // }

        Ok(())
    }

    pub async fn handle_store_set_field(&self, current_checkpoint: u64, set_field: &StoreSetField) -> Result<()> {
        // let mut conn = self.pg_pool.get().await?;
        // let table_name = String::from_utf8_lossy(&set_field.table_id[3..]).to_string();
        // println!("Table name: {}", table_name);

        // // Get table field information from database
        // let table_metadata = self
        //     .tables
        //     .iter()
        //     .find(|t| t.name == table_name)
        //     .expect("Table not found");

        // // Separate key and value fields
        // let mut key_fields = Vec::new();
        // let mut field_name = String::new();
        // let mut field_type = String::new();

        // for field in &table_metadata.fields {
        //     if field.is_key {
        //         key_fields.push((field.field_name.clone(), field.field_type.clone()));
        //     }
        //     if field.field_index == set_field.field_index {
        //         field_name = field.field_name.clone();
        //         field_type = field.field_type.clone();
        //     }
        // }

        // // Parse key
        // let key_values = table_metadata.parse_table_keys(set_field.key_tuple.clone());

        // // Parse value to be updated
        // let value_json = table_metadata.parse_table_field(
        //     &field_name.as_bytes().to_vec(),
        //     &field_type.as_bytes().to_vec(),
        //     &set_field.value,
        // );
        // let value = value_json.get(&field_name).unwrap();

        // Generate and execute SQL
        // let sql = generate_set_field_sql(
        //     current_checkpoint,
        //     &table_name,
        //     &field_name,
        //     &field_type,
        //     &value,
        //     &key_fields,
        //     &key_values,
        // );

        // println!("Update SQL: {}", sql);

        // // Execute SQL with proper error handling
        // match diesel::sql_query(&sql).execute(&mut conn).await {
        //     Ok(rows_affected) => {
        //         println!(
        //             "Successfully executed update SQL, rows affected: {}",
        //             rows_affected
        //         );
        //     }
        //     Err(e) => {
        //         eprintln!("Error executing update SQL: {:?}", e);
        //         eprintln!("Failed SQL: {}", sql);
        //         // Return the error instead of continuing
        //         return Err(e.into());
        //     }
        // }

        Ok(())
    }
}

#[async_trait]
impl Worker for DubheIndexerWorker {
    type Result = ();
    async fn process_checkpoint(&self, checkpoint: &CheckpointData) -> Result<()> {
        let current_checkpoint = checkpoint.checkpoint_summary.sequence_number;
        println!(
            "Processing current_checkpoint: {:?}",
            current_checkpoint
        );
        let mut set_record_count = 0;
        let mut set_field_count = 0;

        for transaction in &checkpoint.transactions {
            let maybe_events = &transaction.events;
            if let Some(events) = maybe_events {
                for event in &events.data {
                    if event.package_id == ObjectID::from_str(&self.package_id).unwrap() {
                        println!("Event: {:?}", event);
                        println!("================================================");

                        if event.type_.name.to_string() == "Store_SetRecord" {
                            let set_record: StorageSetRecord =
                                bcs::from_bytes(event.contents.as_slice())
                                    .expect("Failed to parse set record");
                            println!("Set record: {:?}", set_record);

                            // Process StoreSetRecord event
                            self.handle_store_set_record(current_checkpoint, &set_record).await?;
                            set_record_count += 1;
                        }

                        if event.type_.name.to_string() == "Store_SetField" {
                            let set_field: StoreSetField =
                                bcs::from_bytes(event.contents.as_slice())
                                    .expect("Failed to parse set field");

                            println!("Set field: {:?}", set_field);
                            // Process StoreSetField event
                            self.handle_store_set_field(current_checkpoint, &set_field).await?;
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
