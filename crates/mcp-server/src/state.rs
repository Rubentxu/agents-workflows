//! Application state holding references to all services
//!
//! AppState is decomposed into focused contexts following DDD:
//! - registry: NodeService, Database, WorkspaceRepository
//! - execution: ExecutionStore, ArtifactService, ArtifactRepository
//! - insights: InsightsRepository, AnalyticsService
//! - metrics: AlertRepository

use std::sync::Arc;
use std::path::PathBuf;
use anyhow::Result;
use registry::domain::{Node, NodeType};
use registry::infrastructure::db::Database;
use registry::domain::WorkspaceRepository;
use workflow::PlanningResult;
use workflow::parse_registry_workflow_yaml;
use workflow::application::WorkflowPlanner;
use artifact::application::artifact_service::ArtifactService;
use artifact::domain::ArtifactRepository;
use insights::domain::InsightsRepository;
use metrics::domain::AlertRepository;

pub use crate::context::{
    RegistryContext,
    ExecutionContext,
    InsightsContext,
    MetricsContext,
};

use crate::artifact_store::ArtifactStore;
use crate::execution_store::ExecutionStore;

/// Application state - holds all services in focused contexts
#[derive(Clone)]
pub struct AppState {
    /// Registry context - node service, database, workspace repository
    pub registry: Arc<RegistryContext>,
    /// Execution context - execution store, artifact service
    pub execution: Arc<ExecutionContext>,
    /// Insights context - insights repository, analytics service
    pub insights: Arc<InsightsContext>,
    /// Metrics context - alert repository
    pub metrics: Arc<MetricsContext>,
    /// Root path for workspace files
    pub workspace_root: PathBuf,
    /// When the server started
    pub started_at: std::time::Instant,
}

impl AppState {
    /// Initialize application state with workspace directory
    pub async fn new(workspace_dir: &str) -> Result<Self> {
        let workspace_root = PathBuf::from(workspace_dir);

        // Create global directory if it doesn't exist
        let global_dir = workspace_root.join("global");
        std::fs::create_dir_all(&global_dir).ok(); // idempotent

        // Create artifacts directory
        let artifacts_dir = workspace_root.join("artifacts");
        std::fs::create_dir_all(&artifacts_dir).ok(); // idempotent

        // Open database in workspace global directory
        let db_path = global_dir.join("registry.db");
        let db = Arc::new(Database::open(db_path.to_str().unwrap_or_default())?);

        // Create context structs
        let registry = Arc::new(RegistryContext::new(db.clone()));
        let execution = Arc::new(ExecutionContext::new(db.clone(), artifacts_dir));
        let insights = Arc::new(InsightsContext::new(db.clone()));
        let metrics = Arc::new(MetricsContext::new(db.clone()));

        Ok(Self {
            registry,
            execution,
            insights,
            metrics,
            workspace_root,
            started_at: std::time::Instant::now(),
        })
    }

    /// Get the file path for a resource ARN (ADR-0016)
    /// Returns None if the ARN doesn't map to a file path
    pub fn get_content_path(&self, arn: &str) -> Option<PathBuf> {
        // ARN format: arn:local:{scope}:{type}/{name}
        // Examples:
        //   arn:local:global:workflow/my-workflow
        //   arn:local:workspace/abc123:agent/orchestrator
        let parts: Vec<&str> = arn.splitn(4, ':').collect();
        if parts.len() != 4 || parts[0] != "arn" || parts[1] != "local" {
            return None;
        }

        let scope = parts[2];
        let resource = parts[3];
        let (resource_type, name) = resource.split_once('/')?;

        let base_dir = if scope == "global" {
            self.workspace_root.join("global")
        } else if scope.starts_with("workspace/") {
            let workspace_id = scope.strip_prefix("workspace/").unwrap_or("");
            self.workspace_root.join("workspaces").join(workspace_id)
        } else {
            return None;
        };

        let type_dir = match resource_type {
            "workflow" => base_dir.join("workflows"),
            "agent" => base_dir.join("agents"),
            "skill" => base_dir.join("skills").join(&name).join("SKILL.md"),
            "prompt" => base_dir.join("prompts").join(format!("{}.md", name)),
            "tool" => base_dir.join("tools"),
            "template" => base_dir.join("templates").join(format!("{}.md", name)),
            _ => return None,
        };

        // For skills, the path is already computed above
        if resource_type == "skill" {
            return Some(type_dir);
        }

        // For YAML-based resources, append .yaml
        if resource_type == "workflow" || resource_type == "agent" || resource_type == "tool" {
            Some(type_dir.join(format!("{}.yaml", name)))
        } else {
            Some(type_dir)
        }
    }

    /// List all workflows from registry
    pub async fn list_workflows(&self) -> Vec<Node> {
        self.registry.node_service
            .list_by_type(NodeType::Workflow)
            .unwrap_or_default()
    }

    /// Get workflow by ARN
    pub async fn get_workflow(&self, arn: &str) -> Result<Option<Node>> {
        Ok(self.registry.node_service.get(arn).ok().flatten())
    }

    /// Get all stage IDs for a workflow, preserving declared order where possible.
    pub async fn get_workflow_stage_ids(&self, arn: &str) -> Result<Vec<String>> {
        let node = self
            .registry.node_service
            .get(arn)
            .ok()
            .flatten()
            .ok_or_else(|| anyhow::anyhow!("Workflow not found: {}", arn))?;

        let config = node
            .config_json
            .ok_or_else(|| anyhow::anyhow!("Workflow node has no config: {}", arn))?;

        let workflow = parse_registry_workflow_yaml(&node.id, &node.name, &config)
            .map_err(|e| anyhow::anyhow!("Failed to parse workflow: {}", e))?;
        Ok(workflow.stages.iter().map(|s| s.id.clone()).collect())
    }

    /// List nodes, optionally filtered by type
    pub async fn list_nodes(&self, node_type: Option<&str>) -> Vec<Node> {
        match node_type {
            Some(t) => {
                let nt = match t.to_lowercase().as_str() {
                    "workflow" => NodeType::Workflow,
                    "agent" => NodeType::Agent,
                    "skill" => NodeType::Skill,
                    "tool" => NodeType::Tool,
                    _ => return vec![],
                };
                self.registry.node_service.list_by_type(nt).unwrap_or_default()
            }
            None => {
                // List all nodes regardless of type
                self.registry.node_service.list_all().unwrap_or_default()
            }
        }
    }

    /// Get node by ARN
    pub async fn get_node(&self, arn: &str) -> Result<Option<Node>> {
        Ok(self.registry.node_service.get(arn).ok().flatten())
    }

    /// List recent artifacts
    pub async fn list_artifacts(&self, limit: usize) -> Vec<serde_json::Value> {
        self.artifact_repository()
            .list(limit)
            .map(|artifacts| {
                artifacts
                    .into_iter()
                    .map(|a| {
                        serde_json::json!({
                            "id": a.id,
                            "execution_id": a.execution_id,
                            "stage_id": a.stage_id,
                            "name": a.name,
                            "size": a.size,
                            "storage_type": match a.storage_type {
                                artifact::domain::StorageType::Sqlite => "sqlite",
                                artifact::domain::StorageType::Filesystem => "filesystem",
                            },
                            "content_type": match a.content_type {
                                artifact::domain::ContentType::Markdown => "markdown",
                                artifact::domain::ContentType::Text => "text",
                                artifact::domain::ContentType::Json => "json",
                                artifact::domain::ContentType::Code => "code",
                                artifact::domain::ContentType::Binary => "binary",
                            },
                            "created_at": a.created_at.to_rfc3339(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get artifact by ID
    pub async fn get_artifact(&self, id: &str) -> Result<Option<serde_json::Value>> {
        self.artifact_repository()
            .get(id)
            .map(|opt| {
                opt.map(|a| {
                    serde_json::json!({
                        "id": a.id,
                        "execution_id": a.execution_id,
                        "stage_id": a.stage_id,
                        "name": a.name,
                        "size": a.size,
                        "storage_type": match a.storage_type {
                            artifact::domain::StorageType::Sqlite => "sqlite",
                            artifact::domain::StorageType::Filesystem => "filesystem",
                        },
                        "location": a.location,
                        "content_type": match a.content_type {
                            artifact::domain::ContentType::Markdown => "markdown",
                            artifact::domain::ContentType::Text => "text",
                            artifact::domain::ContentType::Json => "json",
                            artifact::domain::ContentType::Code => "code",
                            artifact::domain::ContentType::Binary => "binary",
                        },
                        "checksum": a.checksum,
                        "created_at": a.created_at.to_rfc3339(),
                    })
                })
            })
            .map_err(|e| anyhow::anyhow!("{}", e))
    }

    /// Generate an execution plan for a workflow
    pub async fn generate_execution_plan(&self, arn: &str) -> Result<Option<PlanningResult>> {
        use workflow::Workflow;

        // Get the workflow node from registry
        let node = match self.registry.node_service.get(arn).ok().flatten() {
            Some(n) => n,
            None => return Ok(None),
        };

        let workflow: Workflow = match node.config_json {
            Some(config) => parse_registry_workflow_yaml(&node.id, &node.name, &config)
                .map_err(|e| anyhow::anyhow!("Failed to parse workflow YAML: {}", e))?,
            None => return Err(anyhow::anyhow!("Workflow node has no config")),
        };

        // Generate execution plan
        let planner = WorkflowPlanner::new();
        let result = planner.plan(&workflow)
            .map_err(|e| anyhow::anyhow!("Planning error: {}", e))?;

        Ok(Some(result))
    }

    pub fn save_node(&self, node: Node) -> Result<Node, String> {
        match self.registry.node_service.create(node.clone()) {
            Ok(n) => Ok(n),
            Err(e) => {
                if matches!(e, registry::domain::RegistryError::DuplicateNode(_)) {
                    return self.registry.node_service.update(node).map_err(|e| e.to_string());
                }
                Err(e.to_string())
            }
        }
    }

    pub fn delete_node_by_arn(&self, arn: &str) -> Result<bool, String> {
        let node = self.registry.node_service.get(arn).map_err(|e| e.to_string())?;
        if node.is_none() {
            return Ok(false);
        }
        self.registry.node_service.delete(arn).map_err(|e| e.to_string())?;
        Ok(true)
    }

    pub fn list_by_type_str(&self, node_type: &str) -> Result<Vec<Node>, String> {
        let nt = match node_type.to_lowercase().as_str() {
            "workflow" => NodeType::Workflow,
            "agent" => NodeType::Agent,
            "skill" => NodeType::Skill,
            "tool" => NodeType::Tool,
            "prompt" => NodeType::Prompt,
            "template" => NodeType::Template,
            _ => return Ok(vec![]),
        };
        self.registry.node_service.list_by_type(nt).map_err(|e| e.to_string())
    }

    pub fn get_node_by_arn(&self, arn: &str) -> Result<Option<Node>, String> {
        self.registry.node_service.get(arn).map_err(|e| e.to_string())
    }

    // =========================================================================
    // Backward-compatible accessors for legacy code paths
    // These delegate to the new context structure
    // =========================================================================

    /// Get database connection (for raw SQL handlers)
    pub fn db(&self) -> &Arc<Database> {
        &self.registry.db
    }

    /// Get workspace store (for backward compatibility)
    pub fn workspace_store(&self) -> &Arc<dyn WorkspaceRepository> {
        &self.registry.workspace_repository
    }

    /// Get execution store
    pub fn execution_store(&self) -> &Arc<ExecutionStore> {
        &self.execution.execution_store
    }

    /// Get artifact repository (metadata persistence via trait)
    pub fn artifact_repository(&self) -> &Arc<dyn ArtifactRepository> {
        &self.execution.artifact_repository
    }

    /// Get artifact store (metadata persistence) — concrete type for backward compatibility
    pub fn artifact_store(&self) -> &Arc<ArtifactStore> {
        &self.execution.artifact_store
    }

    /// Get artifact service (storage operations)
    pub fn artifact_service(&self) -> &Arc<ArtifactService> {
        &self.execution.artifact_service
    }

    /// Get insights store
    pub fn insights_store(&self) -> &Arc<dyn InsightsRepository> {
        &self.insights.insights_repository
    }

    /// Get alert store
    pub fn alert_store(&self) -> &Arc<dyn AlertRepository> {
        &self.metrics.alert_repository
    }

    /// Get node service
    pub fn node_service(&self) -> &Arc<registry::application::node_service::NodeService> {
        &self.registry.node_service
    }
}

#[cfg(any(test, feature = "test-factory"))]
impl AppState {
    pub fn test() -> anyhow::Result<(Self, tempfile::TempDir)> {
        let temp_dir = tempfile::TempDir::new()?;
        let state = Self::test_with_workspace(temp_dir.path())?;
        Ok((state, temp_dir))
    }

    pub fn test_with_workspace(workspace: &std::path::Path) -> anyhow::Result<Self> {
        let global_dir = workspace.join("global");
        std::fs::create_dir_all(&global_dir).ok();

        let db = Arc::new(Database::open_in_memory()?);

        // Create context structs
        let registry = Arc::new(RegistryContext::new(db.clone()));
        let artifacts_dir = workspace.join("artifacts");
        std::fs::create_dir_all(&artifacts_dir).ok();
        let execution = Arc::new(ExecutionContext::new(db.clone(), artifacts_dir));
        let insights = Arc::new(InsightsContext::new(db.clone()));
        let metrics = Arc::new(MetricsContext::new(db.clone()));

        Ok(Self {
            registry,
            execution,
            insights,
            metrics,
            workspace_root: workspace.to_path_buf(),
            started_at: std::time::Instant::now(),
        })
    }
}
