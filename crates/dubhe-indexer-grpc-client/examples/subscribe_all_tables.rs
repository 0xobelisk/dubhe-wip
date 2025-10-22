//! Example: Subscribe to all tables
//! 
//! This example demonstrates how to subscribe to all tables by passing an empty table_ids vector.
//! 
//! Usage:
//!   1. Start the dubhe-indexer server first
//!   2. Note the gRPC port from server output (e.g., 8081)
//!   3. Run this example: 
//!      cargo run --example subscribe_all_tables
//!      or with custom port:
//!      GRPC_PORT=8081 cargo run --example subscribe_all_tables
//! 

use anyhow::Result;
use dubhe_indexer_grpc::types::dubhe_grpc_client::DubheGrpcClient;
use dubhe_indexer_grpc::types::SubscribeRequest;
use futures_util::StreamExt;
use std::env;

#[tokio::main]
async fn main() -> Result<()> {
    println!("🚀 Starting gRPC client example: Subscribe to all tables");
    
    // Get gRPC port from environment variable or use default
    let grpc_port = env::var("GRPC_PORT").unwrap_or_else(|_| "8080".to_string());
    let grpc_url = format!("http://localhost:{}", grpc_port);
    
    println!("📋 Connecting to {}...", grpc_url);
    println!("   💡 If connection fails, check server output for actual gRPC port");
    println!("   💡 Then run: GRPC_PORT=<port> cargo run --example subscribe_all_tables\n");
    
    // Connect to the gRPC server
    let mut client = DubheGrpcClient::connect(grpc_url).await?;
    
    println!("✅ Connected successfully!");
    
    // Create a subscribe request with empty table_ids to subscribe to all tables
    let request = SubscribeRequest {
        table_ids: vec![], // Empty vector means subscribe to all tables
    };
    
    println!("🔔 Subscribing to all tables...");
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

