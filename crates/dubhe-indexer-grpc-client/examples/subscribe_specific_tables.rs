//! Example: Subscribe to specific tables
//! 
//! This example demonstrates how to subscribe to specific tables by providing table names.
//! 
//! Usage:
//!   1. Start the dubhe-indexer server first
//!   2. Note the gRPC port from server output (e.g., 8081)
//!   3. Run this example:
//!      cargo run --example subscribe_specific_tables
//!      or with custom port:
//!      GRPC_PORT=8081 cargo run --example subscribe_specific_tables
//! 

use anyhow::Result;
use dubhe_indexer_grpc::types::dubhe_grpc_client::DubheGrpcClient;
use dubhe_indexer_grpc::types::SubscribeRequest;
use futures_util::StreamExt;
use std::env;

#[tokio::main]
async fn main() -> Result<()> {
    println!("🚀 Starting gRPC client example: Subscribe to specific tables");
    
    // Get gRPC port from environment variable or use default
    let grpc_port = env::var("GRPC_PORT").unwrap_or_else(|_| "8081".to_string());
    let grpc_url = format!("http://localhost:{}", grpc_port);
    
    println!("📋 Connecting to {}...", grpc_url);
    println!("   💡 If connection fails, check server output for actual gRPC port");
    println!("   💡 Then run: GRPC_PORT=<port> cargo run --example subscribe_specific_tables\n");
    
    // Connect to the gRPC server
    let mut client = DubheGrpcClient::connect(grpc_url).await?;
    
    println!("✅ Connected successfully!");
    
    // Specify the tables you want to subscribe to
    let tables = vec![
        "component11".to_string(),
        "component25".to_string(),
    ];
    
    // Create a subscribe request with specific table IDs
    let request = SubscribeRequest {
        table_ids: tables.clone(),
    };
    
    println!("🔔 Subscribing to tables: {:?}", tables);
    let mut stream = client.subscribe_table(request).await?.into_inner();
    
    println!("✅ Subscribed! Waiting for table updates...");
    println!("   Press Ctrl+C to stop\n");
    
    // Listen for updates
    loop {
        tokio::select! {
            Some(result) = stream.next() => {
                match result {
                    Ok(change) => {
                        println!("📊 [Table Update]");
                        println!("   Table: {}", change.table_id);
                        println!("   Data: {:?}\n", change.data);
                    }
                    Err(e) => {
                        eprintln!("❌ gRPC stream error: {}", e);
                        break;
                    }
                }
            }
            _ = tokio::signal::ctrl_c() => {
                println!("\n🛑 Received Ctrl+C, shutting down...");
                break;
            }
            else => {
                println!("❌ gRPC subscription closed");
                break;
            }
        }
    }
    
    println!("👋 Goodbye!");
    Ok(())
}

