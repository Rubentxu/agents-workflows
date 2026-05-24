//! Metrics Domain Errors

use thiserror::Error;

#[derive(Error, Debug)]
pub enum MetricsError {
    #[error("Failed to emit metric: {0}")]
    EmissionFailed(String),

    #[error("Invalid metric format: {0}")]
    InvalidFormat(String),

    #[error("Streaming error: {0}")]
    StreamError(String),

    #[error("Alert not found: {0}")]
    AlertNotFound(i64),

    #[error("Invalid alert state: {0}")]
    InvalidAlertState(String),

    #[error("Database error: {0}")]
    DatabaseError(String),
}

pub type MetricsResult<T> = Result<T, MetricsError>;
