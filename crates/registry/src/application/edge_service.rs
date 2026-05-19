//! Edge Service - Relationship management

use crate::domain::{
    Edge, RelationshipType, RegistryResult
};
use crate::infrastructure::edge_repository::EdgeRepository;
use std::sync::Arc;

/// Edge Service - application service for edge operations
pub struct EdgeService {
    repository: Arc<dyn EdgeRepository>,
}

impl EdgeService {
    pub fn new(repository: Arc<dyn EdgeRepository>) -> Self {
        Self { repository }
    }

    /// Create a new edge
    pub fn create(&self, edge: Edge) -> RegistryResult<Edge> {
        self.repository.save(edge)
    }

    /// Delete an edge
    pub fn delete(&self, from_id: &str, to_id: &str, rel_type: RelationshipType) -> RegistryResult<()> {
        self.repository.delete(from_id, to_id, rel_type)
    }

    /// Get all edges from a node (outgoing relationships)
    pub fn get_outgoing(&self, node_id: &str) -> RegistryResult<Vec<Edge>> {
        self.repository.find_by_from(node_id)
    }

    /// Get all edges to a node (incoming relationships)
    pub fn get_incoming(&self, node_id: &str) -> RegistryResult<Vec<Edge>> {
        self.repository.find_by_to(node_id)
    }

    /// Get edges by relationship type
    pub fn get_by_type(&self, rel_type: RelationshipType) -> RegistryResult<Vec<Edge>> {
        self.repository.find_by_type(rel_type)
    }

    /// Get all nodes that a node depends on (transitive)
    pub fn get_dependencies(&self, node_id: &str) -> RegistryResult<Vec<String>> {
        let mut deps = Vec::new();
        let mut visited = std::collections::HashSet::new();
        self.collect_dependencies(node_id, &mut deps, &mut visited);
        Ok(deps)
    }

    fn collect_dependencies(
        &self,
        node_id: &str,
        deps: &mut Vec<String>,
        visited: &mut std::collections::HashSet<String>,
    ) {
        if visited.contains(node_id) {
            return;
        }
        visited.insert(node_id.to_string());

        let edges = self.get_incoming(node_id).unwrap_or_default();
        for edge in edges {
            if edge.relationship_type == RelationshipType::DependsOn
                || edge.relationship_type == RelationshipType::Uses
            {
                deps.push(edge.from_id.clone());
                self.collect_dependencies(&edge.from_id, deps, visited);
            }
        }
    }

    /// Get full expansion of a node (all related nodes)
    pub fn get_expansion(&self, node_id: &str) -> RegistryResult<Vec<(Edge, String)>> {
        let mut result = Vec::new();

        // Outgoing
        for edge in self.get_outgoing(node_id)? {
            result.push((edge.clone(), edge.to_id.clone()));
        }

        // Incoming
        for edge in self.get_incoming(node_id)? {
            result.push((edge.clone(), edge.from_id.clone()));
        }

        Ok(result)
    }
}
