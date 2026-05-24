//! Artifact Domain Errors

use thiserror::Error;

#[derive(Error, Debug)]
pub enum ArtifactError {
    #[error("Artifact not found: {0}")]
    NotFound(String),

    #[error("Artifact too large: {0} bytes (max 1GB)")]
    TooLarge(u64),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Checksum mismatch: expected={expected}, actual={actual}")]
    ChecksumMismatch { expected: String, actual: String },

    #[error("Content type not supported: {0}")]
    UnsupportedContentType(String),

    #[error("Repository error: {0}")]
    RepositoryError(String),
}

pub type ArtifactResult<T> = Result<T, ArtifactError>;
