//! Repository trait - unified interface for registry storage
//!
//! SQLite stores nodes and edges for the registry. This trait provides
//! a common interface for storage backends.

use crate::domain::{NodeType, RegistryResult};

/// Repository trait for node storage
pub trait Repository<T>: Send + Sync {
    /// Save an item
    fn save(&self, item: T) -> RegistryResult<T>;

    /// Find by ID
    fn find_by_id(&self, id: &str) -> RegistryResult<Option<T>>;

    /// List by type
    fn find_by_type(&self, node_type: NodeType) -> RegistryResult<Vec<T>>;

    /// List by registry
    fn find_by_registry(&self, registry: &str) -> RegistryResult<Vec<T>>;

    /// List by namespace
    fn find_by_namespace(&self, namespace: &str) -> RegistryResult<Vec<T>>;

    /// Search by name pattern
    fn search(&self, pattern: &str) -> RegistryResult<Vec<T>>;

    /// Update an item
    fn update(&self, item: T) -> RegistryResult<T>;

    /// Delete by ID
    fn delete(&self, id: &str) -> RegistryResult<()>;
}
