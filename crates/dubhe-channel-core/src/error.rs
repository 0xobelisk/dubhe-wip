use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChannelError {
    pub code: String,
    pub message: String,
}

impl ChannelError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

impl Display for ChannelError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl Error for ChannelError {}

impl From<anyhow::Error> for ChannelError {
    fn from(value: anyhow::Error) -> Self {
        Self::new("internal_error", value.to_string())
    }
}

pub type ChannelResult<T> = Result<T, ChannelError>;
