// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use clap::Parser;
use dubhe_indexer::{DubheIndexerArgs, IndexerBuilder};

#[tokio::main]
async fn main() -> Result<()> {
    // 解析命令行参数
    let args = DubheIndexerArgs::parse();

    // 创建 IndexerBuilder 并初始化
    let mut builder = IndexerBuilder::new(args);
    builder.initialize().await?;

    // 构建 Cluster
    let cluster = builder.build_cluster().await?;
    let handle = cluster.run().await?;

    // 构建 ProxyServer
    let proxy_server = builder.build_proxy_server().await?;
    
    // 打印启动信息（提取 grpc_port 用于日志）
    builder.print_startup_info(8081);

    // 启动 Proxy Server
    let database = builder.database()
        .ok_or_else(|| anyhow::anyhow!("Database not initialized"))?;
    
    let proxy_handle = tokio::spawn(async move {
        if let Err(e) = proxy_server.start(database).await {
            log::error!("❌ Proxy server failed: {}", e);
            std::process::exit(1);
        }
    });

    // 等待任一任务完成
    tokio::select! {
        result = proxy_handle => {
            match result {
                Ok(_) => log::info!("✅ Proxy server completed successfully"),
                Err(e) => log::error!("❌ Proxy server task failed: {}", e),
            }
        }
        result = handle => {
            match result {
                Ok(_) => log::info!("✅ Indexer executor completed successfully"),
                Err(e) => log::error!("❌ Indexer executor task failed: {}", e),
            }
        }
    }

    Ok(())
}
