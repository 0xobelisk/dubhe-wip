use serde::Deserialize;
use std::fs;
use crate::{config::Args, error::Error};

#[derive(Clone, Debug, Deserialize)]
pub struct Settings {
    pub sui: SuiSettings,
    pub database: DatabaseSettings,
    pub grpc: GrpcSettings,
    pub subscription: SubscriptionSettings,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SuiSettings {
    pub network: String,
    pub package_id: String,
    pub start_checkpoint: u64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct DatabaseSettings {
    pub db_type: String,
    pub url: String,
    pub max_connections: u32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct GrpcSettings {
    pub addr: String,
    pub tls_cert: Option<String>,
    pub tls_key: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SubscriptionSettings {
    pub max_clients: usize,
    pub channel_capacity: usize,
}

impl Settings {
    pub fn new(args: &Args) -> Result<Self, Error> {
        let config_content = fs::read_to_string(&args.config)
            .map_err(|e| Error::Config(format!("无法读取配置文件: {}", e)))?;
            
        let mut settings: Settings = if args.config.ends_with(".yaml") || args.config.ends_with(".yml") {
            serde_yaml::from_str(&config_content)
                .map_err(|e| Error::Config(format!("YAML解析错误: {}", e)))?
        } else if args.config.ends_with(".toml") {
            toml::from_str(&config_content)
                .map_err(|e| Error::Config(format!("TOML解析错误: {}", e)))?
        } else {
            return Err(Error::Config("不支持的配置文件格式".to_string()));
        };
        
        // 命令行参数覆盖配置文件
        if let Some(db_url) = &args.db_url {
            settings.database.url = db_url.clone();
        }
        if args.db_type != "sqlite" {
            settings.database.db_type = args.db_type.clone();
        }
        if args.grpc_addr != "127.0.0.1:50051" {
            settings.grpc.addr = args.grpc_addr.clone();
        }
        
        Ok(settings)
    }
} 