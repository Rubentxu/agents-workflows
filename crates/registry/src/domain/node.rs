//! Node Entity and Value Objects

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// Node type enum - all resource types in the system
///
/// Note: Artifact and Execution are workspace-scoped only.
/// Global resources (workflows, agents, skills, prompts, tools) are shared across workspaces.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    Workflow,
    Agent,
    Skill,
    Prompt,
    Tool,
    Stage,
    Artifact,
    Execution,
}

impl NodeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            NodeType::Workflow => "workflow",
            NodeType::Agent => "agent",
            NodeType::Skill => "skill",
            NodeType::Prompt => "prompt",
            NodeType::Tool => "tool",
            NodeType::Stage => "stage",
            NodeType::Artifact => "artifact",
            NodeType::Execution => "execution",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "workflow" => Some(NodeType::Workflow),
            "agent" => Some(NodeType::Agent),
            "skill" => Some(NodeType::Skill),
            "prompt" => Some(NodeType::Prompt),
            "tool" => Some(NodeType::Tool),
            "stage" => Some(NodeType::Stage),
            "artifact" => Some(NodeType::Artifact),
            "execution" => Some(NodeType::Execution),
            _ => None,
        }
    }

    /// Check if this node type is workspace-scoped only
    pub fn is_workspace_scoped(&self) -> bool {
        matches!(self, NodeType::Artifact | NodeType::Execution)
    }

    /// Check if this node type is globally scoped
    pub fn is_global_scoped(&self) -> bool {
        !self.is_workspace_scoped()
    }
}

/// Node entity - represents any resource in the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    /// Full ARN identifier
    pub id: String,
    /// Node type
    pub node_type: NodeType,
    /// Resource name
    pub name: String,
    /// Scope: "global" or "workspace/{id}"
    pub scope: String,
    /// Registry: "local" (kept for compatibility)
    pub registry: String,
    /// Namespace: "global" for global resources, "workspace/{id}" for workspace resources
    pub namespace: String,
    /// Path to source file (optional)
    pub path: Option<String>,
    /// SHA256 checksum of source (optional)
    pub checksum: Option<String>,
    /// Resolved configuration JSON (optional)
    pub config_json: Option<String>,
    /// Metadata JSON (optional)
    pub metadata_json: Option<String>,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Last update timestamp
    pub updated_at: DateTime<Utc>,
}

impl Node {
    /// Create a new Node with required fields
    pub fn new(
        id: String,
        node_type: NodeType,
        name: String,
        scope: String,
        namespace: String,
    ) -> Self {
        let now = Utc::now();
        Self {
            id,
            node_type,
            name,
            scope,
            registry: "local".to_string(),
            namespace,
            path: None,
            checksum: None,
            config_json: None,
            metadata_json: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Create a global-scoped node
    pub fn new_global(
        id: String,
        node_type: NodeType,
        name: String,
    ) -> Self {
        Self::new(
            id,
            node_type,
            name,
            "global".to_string(),
            "global".to_string(),
        )
    }

    /// Create a workspace-scoped node
    pub fn new_workspace(
        id: String,
        node_type: NodeType,
        name: String,
        workspace_id: &str,
    ) -> Self {
        let scope = format!("workspace/{}", workspace_id);
        Self::new(
            id,
            node_type,
            name,
            scope.clone(),
            scope,
        )
    }

    pub fn with_path(mut self, path: String) -> Self {
        self.path = Some(path);
        self
    }

    pub fn with_checksum(mut self, checksum: String) -> Self {
        self.checksum = Some(checksum);
        self
    }

    pub fn with_config(mut self, config: serde_json::Value) -> Self {
        self.config_json = Some(config.to_string());
        self
    }

    pub fn with_metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata_json = Some(metadata.to_string());
        self
    }

    /// Check if this node is globally scoped
    pub fn is_global(&self) -> bool {
        self.scope == "global"
    }

    /// Check if this node is workspace-scoped
    pub fn is_workspace(&self) -> bool {
        self.scope.starts_with("workspace/")
    }

    /// Extract workspace ID if this is a workspace-scoped node
    pub fn workspace_id(&self) -> Option<String> {
        if self.scope.starts_with("workspace/") {
            Some(self.scope.strip_prefix("workspace/").unwrap().to_string())
        } else {
            None
        }
    }
}