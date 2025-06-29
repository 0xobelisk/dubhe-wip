use clap::Parser;

#[derive(Debug, Parser)]
#[command(author, version, about, long_about = None)]
pub struct Args {
    /// Configuration file path
    #[arg(long, default_value = "config.yaml")]
    pub config: String,

    /// Path to the configuration file
    #[arg(long, default_value = "dubhe.config.json")]
    pub config_json: String,
    
    /// Database type (sqlite or postgres)
    #[arg(long, default_value = "sqlite")]
    pub db_type: String,
    
    /// Database connection string
    #[arg(long)]
    pub db_url: Option<String>,
    
    /// GRPC service listen address
    #[arg(short, long, default_value = "127.0.0.1:50051")]
    pub grpc_addr: String,
}

impl Args {
    pub fn parse() -> Self {
        Parser::parse()
    }
} 