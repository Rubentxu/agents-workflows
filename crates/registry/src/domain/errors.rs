//! Registry Domain Errors

use thiserror::Error;

#[derive(Error, Debug)]
pub enum RegistryError {
    #[error("Node not found: {0}")]
    NodeNotFound(String),

    #[error("Edge not found: from={0} to={1}")]
    EdgeNotFound(String, String),

    #[error("Invalid ARN: {0}")]
    InvalidArn(String),

    #[error("Duplicate node: {0}")]
    DuplicateNode(String),

    #[error("Resolution failed for ARN: {0}")]
    ResolutionFailed(String),

    #[error("Checksum mismatch for {arn}: expected={expected}, actual={actual}")]
    ChecksumMismatch {
        arn: String,
        expected: String,
        actual: String,
    },

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Database error: {0}")]
    DatabaseError(#[from] rusqlite::Error),
}

pub type RegistryResult<T> = Result<T, RegistryError>;
