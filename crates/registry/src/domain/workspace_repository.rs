//! Workspace Repository Port
//!
//! Abstract interface for workspace persistence. Implementations live in
//! the infrastructure layer (e.g., SQLite adapter).
//!
//! This follows DDD port/repository pattern where the interface is defined
//! in the domain layer and implemented in infrastructure.

use crate::domain::RegistryResult;

/// Workspace entity - represents a scoped workspace environment
#[derive(Debug, Clone)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Workspace {
    pub fn new(id: String, name: String, description: Option<String>) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id,
            name,
            description,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

/// Workspace statistics
#[derive(Debug, Clone)]
pub struct WorkspaceStats {
    pub executions_count: i64,
    pub artifacts_count: i64,
    pub last_execution: Option<String>,
}

/// Workspace repository port - abstracts persistence of workspaces
pub trait WorkspaceRepository: Send + Sync {
    /// List all workspaces
    fn list(&self) -> RegistryResult<Vec<Workspace>>;

    /// Get a workspace by ID
    fn get(&self, id: &str) -> RegistryResult<Option<Workspace>>;

    /// Create a new workspace
    fn create(&self, workspace: &Workspace) -> RegistryResult<()>;

    /// Update an existing workspace
    fn update(&self, workspace: &Workspace) -> RegistryResult<()>;

    /// Delete a workspace by ID
    fn delete(&self, id: &str) -> RegistryResult<()>;

    /// Get workspace statistics
    fn stats(&self, id: &str) -> RegistryResult<WorkspaceStats>;
}
