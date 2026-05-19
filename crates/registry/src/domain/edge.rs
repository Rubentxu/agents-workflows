//! Edge Entity - Relationships between nodes

use serde::{Deserialize, Serialize};

/// Relationship type between nodes
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RelationshipType {
    Uses,           // A references B (agent uses skill)
    DependsOn,      // A requires B before (stage depends on stage)
    Produces,       // A creates B (stage produces artifact)
    Consumes,       // A reads B (stage consumes artifact)
    References,     // A points to B (soft reference)
}

impl RelationshipType {
    pub fn as_str(&self) -> &'static str {
        match self {
            RelationshipType::Uses => "uses",
            RelationshipType::DependsOn => "depends_on",
            RelationshipType::Produces => "produces",
            RelationshipType::Consumes => "consumes",
            RelationshipType::References => "references",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "uses" => Some(RelationshipType::Uses),
            "depends_on" => Some(RelationshipType::DependsOn),
            "produces" => Some(RelationshipType::Produces),
            "consumes" => Some(RelationshipType::Consumes),
            "references" => Some(RelationshipType::References),
            _ => None,
        }
    }
}

/// Edge entity - represents a relationship between two nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub id: Option<i64>,
    pub from_id: String,           // Source node ARN
    pub to_id: String,             // Target node ARN
    pub relationship_type: RelationshipType,
    pub metadata_json: Option<String>,
}

impl Edge {
    pub fn new(from_id: String, to_id: String, relationship_type: RelationshipType) -> Self {
        Self {
            id: None,
            from_id,
            to_id,
            relationship_type,
            metadata_json: None,
        }
    }
}
