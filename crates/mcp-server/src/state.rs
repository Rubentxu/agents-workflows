//! Application state holding references to all services

use std::sync::Arc;
use std::path::PathBuf;
use anyhow::Result;
use crate::execution_store::ExecutionStore;
use crate::artifact_store::ArtifactStore;
use registry::domain::{Node, NodeType};
use registry::application::node_service::NodeService;
use registry::infrastructure::db::Database;
use registry::infrastructure::node_repository::SqliteNodeRepository;
use workflow::application::WorkflowPlanner;
use workflow::PlanningResult;
use artifact::application::artifact_service::ArtifactService;
use insights::analytics::AnalyticsService;
use metrics::application::{SseEmitter, MetricsAggregator};

/// Application state - holds all services
pub struct AppState {
    pub node_service: Arc<NodeService>,
    pub db: Arc<Database>,
    pub execution_store: Arc<ExecutionStore>,
    pub artifact_store: Arc<ArtifactStore>,
    pub artifact_service: Arc<ArtifactService>,
    pub analytics_service: Arc<AnalyticsService>,
    pub sse_emitter: Arc<SseEmitter>,
    pub metrics_aggregator: Arc<MetricsAggregator>,
}

impl AppState {
    /// Initialize application state with workspace directory
    pub async fn new(workspace_dir: &str) -> Result<Self> {
        // Create global directory if it doesn't exist
        let global_dir = format!("{}/global", workspace_dir);
        std::fs::create_dir_all(&global_dir).ok(); // idempotent

        // Create artifacts directory
        let artifacts_dir = format!("{}/artifacts", workspace_dir);
        std::fs::create_dir_all(&artifacts_dir).ok(); // idempotent

        // Open database in workspace global directory
        let db_path = format!("{}/global/registry.db", workspace_dir);

        let db = Arc::new(Database::open(&db_path)?);

        // Create repository and service
        let repository = Arc::new(SqliteNodeRepository::new(db.clone()));
        let node_service = Arc::new(NodeService::new(repository));
        let execution_store = Arc::new(ExecutionStore::new(db.clone()));
        let artifact_store = Arc::new(ArtifactStore::new(db.clone()));

        // Create artifact service with workspace artifacts directory
        let artifact_service = Arc::new(ArtifactService::new(PathBuf::from(artifacts_dir)));

        // Create insights analytics service
        let analytics_service = Arc::new(AnalyticsService::new());

        // Create metrics services
        let sse_emitter = Arc::new(SseEmitter::new());
        let metrics_aggregator = Arc::new(MetricsAggregator::new());

        Ok(Self { node_service, db, execution_store, artifact_store, artifact_service, analytics_service, sse_emitter, metrics_aggregator })
    }

    /// List all workflows from registry
    pub async fn list_workflows(&self) -> Vec<Node> {
        self.node_service
            .list_by_type(NodeType::Workflow)
            .unwrap_or_default()
    }

    /// Get workflow by ARN
    pub async fn get_workflow(&self, arn: &str) -> Result<Option<Node>> {
        Ok(self.node_service.get(arn).ok().flatten())
    }

    /// Get all stage IDs for a workflow, preserving declared order where possible.
    pub async fn get_workflow_stage_ids(&self, arn: &str) -> Result<Vec<String>> {
        let node = self
            .node_service
            .get(arn)
            .ok()
            .flatten()
            .ok_or_else(|| anyhow::anyhow!("Workflow not found: {}", arn))?;

        let config = node
            .config_json
            .ok_or_else(|| anyhow::anyhow!("Workflow node has no config: {}", arn))?;

        let yaml_val: serde_yaml::Value = serde_yaml::from_str(&config)
            .map_err(|e| anyhow::anyhow!("Failed to parse workflow YAML: {}", e))?;

        Ok(extract_stage_ids(&yaml_val))
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
                self.node_service.list_by_type(nt).unwrap_or_default()
            }
            None => {
                // List all nodes regardless of type
                self.node_service.list_all().unwrap_or_default()
            }
        }
    }

    /// Get node by ARN
    pub async fn get_node(&self, arn: &str) -> Result<Option<Node>> {
        Ok(self.node_service.get(arn).ok().flatten())
    }

    /// List recent artifacts
    pub async fn list_artifacts(&self, limit: usize) -> Vec<serde_json::Value> {
        self.artifact_store.list(limit).unwrap_or_default()
    }

    /// Get artifact by ID
    pub async fn get_artifact(&self, id: &str) -> Result<Option<serde_json::Value>> {
        self.artifact_store
            .get(id)
            .map_err(|e| anyhow::anyhow!("{}", e))
    }

    /// Generate an execution plan for a workflow
    pub async fn generate_execution_plan(&self, arn: &str) -> Result<Option<PlanningResult>> {
        use workflow::{Workflow, parse_registry_workflow_yaml};

        // Get the workflow node from registry
        let node = match self.node_service.get(arn).ok().flatten() {
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
}

fn extract_stage_ids(yaml_val: &serde_yaml::Value) -> Vec<String> {
    let spec = yaml_val
        .get("spec")
        .and_then(|v| v.as_mapping())
        .cloned();

    let stages_val = spec
        .as_ref()
        .and_then(|m| m.get(serde_yaml::Value::from("stages")))
        .or_else(|| yaml_val.get("stages"));

    match stages_val {
        Some(serde_yaml::Value::Mapping(map)) => map
            .iter()
            .filter_map(|(stage_name, stage_val)| {
                let key_name = stage_name.as_str().map(String::from);
                let explicit_id = stage_val
                    .as_mapping()
                    .and_then(|m| m.get(serde_yaml::Value::from("id")))
                    .and_then(|v| v.as_str())
                    .map(String::from);
                explicit_id.or(key_name)
            })
            .collect(),
        Some(serde_yaml::Value::Sequence(seq)) => seq
            .iter()
            .enumerate()
            .map(|(idx, stage_val)| {
                stage_val
                    .as_mapping()
                    .and_then(|m| m.get(serde_yaml::Value::from("id")))
                    .and_then(|v| v.as_str())
                    .map(String::from)
                    .unwrap_or_else(|| format!("stage-{}", idx))
            })
            .collect(),
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::extract_stage_ids;

    #[test]
    fn extract_stage_ids_from_top_level_mapping() {
        let yaml = serde_yaml::from_str::<serde_yaml::Value>(
            r#"
stages:
  explore:
    id: sdd-explore
    agent: orchestrator
  propose:
    id: sdd-propose
    agent: orchestrator
"#,
        )
        .expect("yaml");

        assert_eq!(
            extract_stage_ids(&yaml),
            vec!["sdd-explore".to_string(), "sdd-propose".to_string()]
        );
    }

    #[test]
    fn extract_stage_ids_from_spec_mapping() {
        let yaml = serde_yaml::from_str::<serde_yaml::Value>(
            r#"
spec:
  stages:
    build:
      id: build
      agent: build-agent
    test:
      id: test
      agent: test-agent
"#,
        )
        .expect("yaml");

        assert_eq!(
            extract_stage_ids(&yaml),
            vec!["build".to_string(), "test".to_string()]
        );
    }
}
