//! Insights Domain Errors

use thiserror::Error;

#[derive(Error, Debug)]
pub enum InsightsError {
    #[error("Insight not found: {0}")]
    NotFound(i64),

    #[error("Execution not found: {0}")]
    ExecutionNotFound(String),

    #[error("Invalid insight type: {0}")]
    InvalidInsightType(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Query error: {0}")]
    QueryError(String),
}

pub type InsightsResult<T> = Result<T, InsightsError>;
