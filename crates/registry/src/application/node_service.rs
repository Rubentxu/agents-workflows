//! Node Service - CRUD operations for nodes

use crate::domain::{
    Node, NodeType, RegistryError, RegistryResult
};
use crate::infrastructure::node_repository::NodeRepository;
use std::sync::Arc;

/// Node Service - application service for node operations
pub struct NodeService {
    repository: Arc<dyn NodeRepository>,
}

impl NodeService {
    pub fn new(repository: Arc<dyn NodeRepository>) -> Self {
        Self { repository }
    }

    /// Create a new node
    pub fn create(&self, node: Node) -> RegistryResult<Node> {
        // Check for duplicate
        if self.repository.find_by_id(&node.id)?.is_some() {
            return Err(RegistryError::DuplicateNode(node.id.clone()));
        }
        self.repository.save(node)
    }

    /// Get node by ARN
    pub fn get(&self, arn: &str) -> RegistryResult<Option<Node>> {
        self.repository.find_by_id(arn)
    }

    /// Get node by ARN, error if not found
    pub fn get_required(&self, arn: &str) -> RegistryResult<Node> {
        self.repository
            .find_by_id(arn)?
            .ok_or_else(|| RegistryError::NodeNotFound(arn.to_string()))
    }

    /// Update an existing node
    pub fn update(&self, node: Node) -> RegistryResult<Node> {
        self.repository.update(node)
    }

    /// Delete a node
    pub fn delete(&self, arn: &str) -> RegistryResult<()> {
        self.repository.delete(arn)
    }

    /// List all nodes regardless of type
    pub fn list_all(&self) -> RegistryResult<Vec<Node>> {
        self.repository.find_all()
    }

    /// List all nodes of a specific type
    pub fn list_by_type(&self, node_type: NodeType) -> RegistryResult<Vec<Node>> {
        self.repository.find_by_type(node_type)
    }

    /// List all nodes in a registry
    pub fn list_by_registry(&self, registry: &str) -> RegistryResult<Vec<Node>> {
        self.repository.find_by_registry(registry)
    }

    /// List all nodes in a namespace
    pub fn list_by_namespace(&self, namespace: &str) -> RegistryResult<Vec<Node>> {
        self.repository.find_by_namespace(namespace)
    }

    /// Search nodes by name pattern
    pub fn search(&self, pattern: &str) -> RegistryResult<Vec<Node>> {
        self.repository.search(pattern)
    }

    /// Resolve an ARN to a node, with eager loading of config
    pub fn resolve(&self, arn: &str) -> RegistryResult<Node> {
        let node = self.get_required(arn)?;

        // If config is not loaded, this might be a lazy reference
        // In eager resolution mode, we validate the node exists
        Ok(node)
    }
}
