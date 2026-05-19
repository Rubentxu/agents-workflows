//! Observation trait - unified interface for memory/artifact storage
//!
//! Observations capture agent memories and learnings during workflow execution.

use crate::domain::{Node, NodeType, RegistryResult};
use async_trait::async_trait;

/// Observation - represents a stored memory/artifact
#[derive(Debug, Clone)]
pub struct Observation {
    pub id: String,
    pub title: String,
    pub content: String,
    pub node_type: NodeType,
    pub topic_key: Option<String>,
    pub project: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

impl From<Node> for Observation {
    fn from(node: Node) -> Self {
        Self {
            id: node.id,
            title: node.name,
            content: node.config_json.unwrap_or_default(),
            node_type: node.node_type,
            topic_key: None,
            project: node.namespace,
            created_at: Some(node.created_at.to_rfc3339()),
            updated_at: Some(node.updated_at.to_rfc3339()),
        }
    }
}

/// Observation repository trait - async interface for storing/retrieving agent observations
#[async_trait]
pub trait ObservationRepository: Send + Sync {
    /// Save an observation
    async fn save(&self, obs: Observation) -> RegistryResult<Observation>;

    /// Get observation by ID
    async fn get(&self, id: &str) -> RegistryResult<Option<Observation>>;

    /// Update an observation
    async fn update(&self, id: &str, content: &str) -> RegistryResult<Observation>;

    /// Delete an observation
    async fn delete(&self, id: &str) -> RegistryResult<()>;

    /// Search observations
    async fn search(
        &self,
        query: &str,
        project: Option<&str>,
    ) -> RegistryResult<Vec<Observation>>;

    /// List observations by project
    async fn list_by_project(&self, project: &str) -> RegistryResult<Vec<Observation>>;
}
