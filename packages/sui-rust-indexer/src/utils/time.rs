use chrono::{DateTime, Duration, TimeZone, Utc};
use crate::error::{Error, Result};

/// Convert timestamp (seconds) to DateTime<Utc>
pub fn timestamp_to_datetime(timestamp: i64) -> Result<DateTime<Utc>> {
    Utc.timestamp_opt(timestamp, 0)
        .single()
        .ok_or_else(|| Error::time(format!("Invalid timestamp: {}", timestamp)))
}

/// Convert DateTime<Utc> to timestamp (seconds)
pub fn datetime_to_timestamp(dt: DateTime<Utc>) -> i64 {
    dt.timestamp()
}

/// Get current timestamp in seconds
pub fn current_timestamp() -> i64 {
    Utc::now().timestamp()
}

/// Get current timestamp in milliseconds
pub fn current_timestamp_ms() -> i64 {
    Utc::now().timestamp_millis()
}

/// Add duration to DateTime
pub fn add_duration(dt: DateTime<Utc>, days: i64, hours: i64, minutes: i64, seconds: i64) -> DateTime<Utc> {
    dt + Duration::days(days)
        + Duration::hours(hours)
        + Duration::minutes(minutes)
        + Duration::seconds(seconds)
}

/// Format DateTime to RFC3339 string
pub fn format_rfc3339(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339()
}

/// Parse RFC3339 string to DateTime
pub fn parse_rfc3339(s: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| Error::time(format!("Failed to parse RFC3339 date: {}", e)))
} 