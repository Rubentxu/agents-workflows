//! Artifact Repository Port
//!
//! Abstract interface for artifact metadata persistence. Implementations live in
//! the infrastructure layer (e.g., SQLite adapter).
//!
//! This follows DDD port/repository pattern where the interface is defined
//! in the domain layer and implemented in infrastructure.

use crate::domain::{Artifact, ArtifactResult};

/// Artifact repository port - abstracts persistence of artifact metadata
pub trait ArtifactRepository: Send + Sync {
    /// List recent artifacts
    fn list(&self, limit: usize) -> ArtifactResult<Vec<Artifact>>;

    /// Get a single artifact by ID
    fn get(&self, id: &str) -> ArtifactResult<Option<Artifact>>;

    /// Delete an artifact by ID
    fn delete(&self, id: &str) -> ArtifactResult<bool>;

    /// Get artifact location (filesystem path) by ID
    fn get_location(&self, id: &str) -> ArtifactResult<Option<String>>;

    /// Get storage metadata for download: (storage_type, location, content_type, name)
    fn get_download_info(
        &self,
        id: &str,
    ) -> ArtifactResult<Option<(String, String, String, Option<String>)>>;

    /// Get storage type and location for deletion purposes
    fn get_storage_info(&self, id: &str) -> ArtifactResult<Option<(String, String)>>;
}