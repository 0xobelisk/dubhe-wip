use thiserror::Error;

/// Application error types
#[derive(Debug, Error)]
pub enum Error {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("GRPC error: {0}")]
    Grpc(String),

    #[error("Subscription error: {0}")]
    Subscription(String),

    #[error("Event error: {0}")]
    Event(String),

    #[error("Table error: {0}")]
    Table(String),

    #[error("Time error: {0}")]
    Time(String),

    #[error("Hash error: {0}")]
    Hash(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Metrics error: {0}")]
    Metrics(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("SQL error: {0}")]
    Sql(String),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

/// Specialized Result type for application
pub type Result<T> = std::result::Result<T, Error>;

// Conversion implementations for various error types
impl From<sqlx::Error> for Error {
    fn from(err: sqlx::Error) -> Self {
        Error::Database(err.to_string())
    }
}

impl From<tonic::transport::Error> for Error {
    fn from(err: tonic::transport::Error) -> Self {
        Error::Grpc(err.to_string())
    }
}

impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error::Other(err.into())
    }
}

impl From<serde_json::Error> for Error {
    fn from(err: serde_json::Error) -> Self {
        Error::Other(err.into())
    }
}

impl From<chrono::ParseError> for Error {
    fn from(err: chrono::ParseError) -> Self {
        Error::Time(err.to_string())
    }
}

impl From<rusqlite::Error> for Error {
    fn from(err: rusqlite::Error) -> Self {
        Error::Sql(err.to_string())
    }
}

// Helper functions for creating errors
impl Error {
    pub fn config<T: ToString>(msg: T) -> Self {
        Error::Config(msg.to_string())
    }

    pub fn storage<T: ToString>(msg: T) -> Self {
        Error::Storage(msg.to_string())
    }

    pub fn grpc<T: ToString>(msg: T) -> Self {
        Error::Grpc(msg.to_string())
    }

    pub fn subscription<T: ToString>(msg: T) -> Self {
        Error::Subscription(msg.to_string())
    }

    pub fn event<T: ToString>(msg: T) -> Self {
        Error::Event(msg.to_string())
    }

    pub fn table<T: ToString>(msg: T) -> Self {
        Error::Table(msg.to_string())
    }

    pub fn time<T: ToString>(msg: T) -> Self {
        Error::Time(msg.to_string())
    }

    pub fn hash<T: ToString>(msg: T) -> Self {
        Error::Hash(msg.to_string())
    }

    pub fn validation<T: ToString>(msg: T) -> Self {
        Error::Validation(msg.to_string())
    }

    pub fn metrics<T: ToString>(msg: T) -> Self {
        Error::Metrics(msg.to_string())
    }

    pub fn database<T: ToString>(msg: T) -> Self {
        Error::Database(msg.to_string())
    }

    pub fn sql<T: ToString>(msg: T) -> Self {
        Error::Sql(msg.to_string())
    }
} 