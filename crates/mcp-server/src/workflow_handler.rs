//! Workflow MCP Handler
//!
//! Handles workflow management and execution tool calls.

use crate::state::AppState;
use crate::types::*;
use crate::metrics_sse::MetricsBroadcaster;
use crate::execution_repository_adapter::ExecutionRepositoryAdapter;
use crate::handler::McpHandler;
use std::collections::HashMap;
use std::sync::Arc;
use workflow::application::{ExecutionApplicationService, WorkflowNavigator};
use workflow::application::parse_registry_workflow_yaml;
use workflow::domain::{Workflow as DomainWorkflow, TriggerInfo as DomainTriggerInfo};

/// Workflow MCP Handler - handles workflow and execution tool calls
pub struct WorkflowMcpHandler {
    state: Arc<AppState>,
    broadcaster: Arc<MetricsBroadcaster>,
}

impl WorkflowMcpHandler {
    pub fn new(state: Arc<AppState>, broadcaster: Arc<MetricsBroadcaster>, _parent: Arc<McpHandler>) -> Self {
        Self { state, broadcaster }
    }

    fn execution_service(&self) -> ExecutionApplicationService<ExecutionRepositoryAdapter> {
        let repo = Arc::new(ExecutionRepositoryAdapter::new(self.state.execution_store.clone()));
        ExecutionApplicationService::new(repo)
    }

    fn parse_domain_workflow(node: &registry::domain::Node) -> Result<DomainWorkflow, String> {
        let config_str = node
            .config_json
            .as_ref()
            .ok_or_else(|| format!("Workflow {} has no config", node.id))?;
        parse_registry_workflow_yaml(&node.id, &node.name, config_str)
            .map_err(|e| format!("Failed to parse workflow YAML: {}", e))
    }

    // ============================================================================
    // Workflow Management
    // ============================================================================

    /// List all registered workflows
    pub async fn workflow_list(&self, _params: ListParams) -> Result<Vec<WorkflowSummary>, String> {
        let nodes = self.state.list_workflows().await;
        let workflows: Vec<WorkflowSummary> = nodes
            .into_iter()
            .map(|node| {
                let description = McpHandler::extract_description(&node);
                WorkflowSummary {
                    arn: node.id.clone(), // id is the ARN
                    name: node.name,
                    description,
                    scope: node.scope,
                    stage_count: 0, // Will be populated when full workflow is loaded
                }
            })
            .collect();
        Ok(workflows)
    }

    /// Get a workflow by ARN.
    /// config_json stores the Kubernetes-style YAML manifest.
    pub async fn workflow_get(&self, params: GetByArnParams) -> Result<Workflow, String> {
        let node = self.state.get_workflow(&params.arn).await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Workflow not found: {}", params.arn))?;

        let workflow: Workflow = match &node.config_json {
            Some(config) => {
                // Use the shared domain YAML parser for consistency
                let domain_wf = workflow::application::parser::parse_registry_workflow_yaml(
                    &node.id,
                    &node.name,
                    config,
                ).map_err(|e| format!("Failed to parse workflow YAML: {}", e))?;

                // Convert domain stages (Vec<Stage>) to MCP stages (HashMap<String, Stage>)
                let mut stages_map = std::collections::HashMap::new();
                for stage in &domain_wf.stages {
                    stages_map.insert(stage.id.clone(), Stage {
                        id: Some(stage.id.clone()),
                        agent: stage.agent.clone(),
                        depends_on: stage.depends_on.clone(),
                        input: stage.input.iter().map(|(k, v)| {
                            (k.clone(), serde_json::to_value(v).unwrap_or(serde_json::Value::Null))
                        }).collect(),
                        output: None,
                        execution: None,
                        conditions: vec![],
                    });
                }

                let (exec_mode, on_failure) = {
                    let ec = &domain_wf.execution;
                    (
                        match ec.mode {
                            workflow::domain::WorkflowExecutionMode::Parallel => "parallel",
                            workflow::domain::WorkflowExecutionMode::Hybrid => "hybrid",
                            _ => "sequential",
                        },
                        match ec.on_failure {
                            workflow::domain::FailureStrategy::Stop => "abort",
                            workflow::domain::FailureStrategy::Continue => "continue",
                            workflow::domain::FailureStrategy::Retry => "retry",
                            _ => "abort",
                        }
                    )
                };

                Workflow {
                    arn: node.id.clone(),
                    name: domain_wf.name,
                    description: domain_wf.description,
                    scope: node.scope.clone(),
                    stages: stages_map,
                    execution: Some(ExecutionConfig {
                        mode: exec_mode.to_string(),
                        on_failure: on_failure.to_string(),
                    }),
                }
            }
            None => {
                let description = McpHandler::extract_description(&node);
                Workflow {
                    arn: node.id.clone(),
                    name: node.name,
                    description,
                    scope: node.scope.clone(),
                    stages: std::collections::HashMap::new(),
                    execution: Some(ExecutionConfig {
                        mode: "sequential".to_string(),
                        on_failure: "abort".to_string(),
                    }),
                }
            }
        };

        Ok(workflow)
    }

    /// Get the DAG for a workflow
    pub async fn workflow_get_dag(&self, params: GetByArnParams) -> Result<Dag, String> {
        // Get the workflow
        let workflow = self.workflow_get(params).await?;

        // Build DAG from stages
        let mut nodes: Vec<DagNode> = Vec::new();
        let mut edges: Vec<DagEdge> = Vec::new();
        let stage_list: Vec<&Stage> = workflow.stages.values().collect();

        for (stage_id, stage) in &workflow.stages {
            let stage_id = stage.id.as_ref().unwrap_or(stage_id);
            nodes.push(DagNode {
                id: stage_id.clone(),
                stage: stage_id.clone(),
                depends_on: stage.depends_on.clone(),
            });

            for dep in &stage.depends_on {
                edges.push(DagEdge {
                    from: dep.clone(),
                    to: stage_id.clone(),
                });
            }
        }

        // Calculate parallel groups (stages with no dependencies on each other)
        let parallel_groups = self.calculate_parallel_groups(&stage_list);

        Ok(Dag {
            nodes,
            edges,
            parallel_groups,
        })
    }

    /// Calculate parallel execution groups
    fn calculate_parallel_groups(&self, stages: &[&Stage]) -> Vec<Vec<String>> {
        let mut groups: Vec<Vec<String>> = Vec::new();
        let mut completed: std::collections::HashSet<String> = std::collections::HashSet::new();

        loop {
            let mut group: Vec<String> = Vec::new();

            for stage in stages {
                let stage_id = stage.id.as_ref().unwrap();
                if completed.contains(stage_id) {
                    continue;
                }

                // Check if all dependencies are completed
                let all_deps_done = stage.depends_on.iter()
                    .all(|dep| completed.contains(dep));

                if all_deps_done {
                    group.push(stage_id.clone());
                }
            }

            if group.is_empty() {
                break;
            }

            for id in &group {
                completed.insert(id.clone());
            }
            groups.push(group);
        }

        groups
    }

    /// Create execution - creates execution record in DB
    pub async fn create_execution(&self, params: WorkflowExecuteParams) -> Result<Execution, String> {
        // 1. Load workflow node from registry
        let workflow_node = self.state.get_workflow(&params.workflow_arn).await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Workflow not found: {}", params.workflow_arn))?;
        let domain_workflow = Self::parse_domain_workflow(&workflow_node)?;

        // 5. Generate execution ARN
        let timestamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
        let execution_arn = format!(
            "arn:local:workspace/{}:execution/{}",
            params.workspace_id,
            timestamp
        );

        // 6. Create and start execution through the application service
        let domain_trigger = DomainTriggerInfo {
            trigger_type: params.trigger_type.clone().unwrap_or_else(|| "manual".to_string()),
            source: None,
            input: serde_json::to_value(params.input.clone()).unwrap_or(serde_json::Value::Null),
        };
        let service = self.execution_service();
        service
            .create_and_start_execution(
                execution_arn.clone(),
                &domain_workflow,
                params.workspace_id.clone(),
                domain_trigger,
            )
            .map_err(|e| format!("Failed to start execution: {}", e))?;

        let domain_state = service
            .get_execution(&execution_arn)
            .map_err(|e| format!("Failed to reload execution: {}", e))?
            .ok_or_else(|| format!("Execution not found after create: {}", execution_arn))?;

        // 8. Broadcast execution started event
        use metrics::domain::MetricEvent;
        use metrics::domain::MetricEventType;
        let event = MetricEvent::new(
            execution_arn,
            "init".to_string(),
            MetricEventType::Started,
        );
        self.broadcaster.broadcast(event);

        // 9. Build and return MCP Execution
        let started_at_mcp = domain_state.started_at
            .map(|dt: chrono::DateTime<chrono::Utc>| dt.to_rfc3339());
        let completed_at_mcp = domain_state.completed_at
            .map(|dt: chrono::DateTime<chrono::Utc>| dt.to_rfc3339());

        let execution = Execution {
            arn: domain_state.execution_arn.clone(),
            workflow_arn: domain_state.workflow_arn.clone(),
            workspace_id: domain_state.workspace_id.clone(),
            status: domain_state.status.as_str().to_string(),
            current_stage: domain_state.current_stage,
            completed_stages: domain_state.completed_stages,
            pending_stages: domain_state.pending_stages,
            stage_outputs: domain_state
                .stage_outputs
                .into_iter()
                .map(|(k, v)| {
                    (
                        k,
                        serde_json::to_value(v).unwrap_or(serde_json::Value::Null),
                    )
                })
                .collect(),
            triggered_by: TriggerInfo {
                trigger_type: domain_state.triggered_by.trigger_type,
                input: domain_state.triggered_by.input,
            },
            started_at: started_at_mcp,
            completed_at: completed_at_mcp,
        };

        Ok(execution)
    }

    // =============================================================================
    // Execution Management (CRUD on execution records)
    // =============================================================================

    /// Get execution state - reads from database
    pub async fn get_execution(&self, params: WorkflowGetStateParams) -> Result<ExecutionState, String> {
        let execution = self.state.execution_store.get(&params.execution_arn)?;
        let all_stage_ids = self
            .state
            .get_workflow_stage_ids(&execution.workflow_arn)
            .await
            .map_err(|e| e.to_string())?;
        let pending_stages = McpHandler::derive_pending_stages(
            all_stage_ids,
            &execution.completed_stages,
            execution.current_stage.as_ref(),
        );

        // Convert to ExecutionState
        Ok(ExecutionState {
            execution_arn: execution.arn,
            workflow_arn: execution.workflow_arn,
            status: execution.status,
            current_stage: execution.current_stage.unwrap_or_default(),
            completed_stages: execution.completed_stages,
            pending_stages,
            stage_outputs: execution.stage_outputs,
            execution_context: execution.execution_context,
        })
    }

    /// Update execution state - persists to database
    pub async fn update_execution(&self, params: WorkflowUpdateStateParams) -> Result<ExecutionState, String> {
        let service = self.execution_service();
        let stage_outputs = params.stage_outputs.map(|outputs| {
            outputs
                .into_iter()
                .map(|(stage_id, output)| {
                    (
                        stage_id,
                        output.artifacts.into_iter().map(|artifact| artifact.name).collect::<Vec<_>>(),
                    )
                })
                .collect::<HashMap<_, _>>()
        });

        service
            .synchronize_execution_state(
                &params.execution_arn,
                params.status.as_deref(),
                params.current_stage,
                params.completed_stages,
                stage_outputs,
                params.execution_context,
            )
            .map_err(|e| e.to_string())?;

        self.get_execution(WorkflowGetStateParams { execution_arn: params.execution_arn }).await
    }

    /// Get next suggested stage
    pub async fn workflow_get_next_stage(&self, params: WorkflowGetNextStageParams) -> Result<NextStage, String> {
        let service = self.execution_service();
        let execution = service
            .get_execution(&params.execution_arn)
            .map_err(|e| format!("Failed to get execution: {}", e))?
            .ok_or_else(|| format!("Execution not found: {}", params.execution_arn))?;

        let workflow_node = self
            .state
            .get_node(&execution.workflow_arn)
            .await
            .map_err(|e| format!("Workflow not found: {}", e))?
            .ok_or_else(|| format!("Workflow not found: {}", execution.workflow_arn))?;
        let workflow = Self::parse_domain_workflow(&workflow_node)?;
        let navigator = WorkflowNavigator::new();

        let executable = navigator.get_executable_in_order(&workflow, &execution);
        let next_stages: Vec<(String, String)> = executable
            .into_iter()
            .map(|stage_id| {
                let desc = workflow
                    .get_stage(&stage_id)
                    .map(|s| s.description.clone())
                    .unwrap_or_default();
                (stage_id, desc)
            })
            .collect();

        if next_stages.is_empty() {
            if let Some(current_stage) = execution.current_stage.clone() {
                return Ok(NextStage {
                    suggested_stage: current_stage,
                    conditions_met: true,
                    alternatives: vec![],
                });
            }
            return Ok(NextStage {
                suggested_stage: String::new(),
                conditions_met: false,
                alternatives: vec![],
            });
        }

        let (first_stage, _) = &next_stages[0];
        Ok(NextStage {
            suggested_stage: first_stage.clone(),
            conditions_met: true,
            alternatives: next_stages[1..].iter().map(|(stage, desc)| StageAlternative {
                stage: stage.clone(),
                condition: desc.clone(),
            }).collect(),
        })
    }

    /// Abort a workflow execution
    pub async fn workflow_abort(&self, params: WorkflowAbortParams) -> Result<ExecutionState, String> {
        let service = self.execution_service();
        if let Err(e) = service.abort_execution(&params.execution_arn) {
            if let workflow::domain::StateMachineError::InvalidTransition { from, to: _, reason: _ } = &e {
                if from == "completed" || from == "aborted" {
                    return Err(format!("Cannot abort execution in '{}' state", from));
                }
            }
            return Err(e.to_string());
        }

        self.get_execution(WorkflowGetStateParams { execution_arn: params.execution_arn }).await
    }

    // ============================================================================
    // Execution Tools
    // ============================================================================

    /// List executions
    pub async fn execution_list(&self, params: ExecutionListParams) -> Result<Vec<ExecutionSummary>, String> {
        self.state.execution_store.list(&params)
    }

    /// Get an execution by ARN
    pub async fn execution_get(&self, params: GetByArnParams) -> Result<Execution, String> {
        let execution = self.state.execution_store.get(&params.arn)?;
        let all_stage_ids = self
            .state
            .get_workflow_stage_ids(&execution.workflow_arn)
            .await
            .map_err(|e| e.to_string())?;
        let pending_stages = McpHandler::derive_pending_stages(
            all_stage_ids,
            &execution.completed_stages,
            execution.current_stage.as_ref(),
        );
        let stage_outputs = execution
            .stage_outputs
            .into_iter()
            .map(|(stage_id, output)| {
                (
                    stage_id,
                    serde_json::to_value(output).unwrap_or(serde_json::Value::Null),
                )
            })
            .collect();

        Ok(Execution {
            arn: execution.arn,
            workflow_arn: execution.workflow_arn,
            workspace_id: execution.workspace_id,
            status: execution.status,
            current_stage: execution.current_stage,
            completed_stages: execution.completed_stages,
            pending_stages,
            stage_outputs,
            triggered_by: execution.triggered_by,
            started_at: execution.started_at,
            completed_at: execution.completed_at,
        })
    }

    /// Get execution history — queries real execution records from the store
    pub async fn execution_history(&self, params: ExecutionHistoryParams) -> Result<Vec<ExecutionSummary>, String> {
        let list_params = ExecutionListParams {
            workspace_id: None,
            workflow_arn: None,
            status: None,
            limit: params.limit,
        };
        let summaries = self.state.execution_store.list(&list_params)
            .map_err(|e| format!("Failed to list executions: {}", e))?;

        Ok(summaries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::handler::McpHandler;
    use crate::execution_store::ExecutionStore;
    use crate::metrics_sse::MetricsBroadcaster;
    use crate::state::AppState;
    use registry::application::node_service::NodeService;
    use registry::domain::{Node, NodeType};
    use registry::infrastructure::db::Database;
    use registry::infrastructure::node_repository::SqliteNodeRepository;
    use std::sync::Arc;

    fn test_workflow_node() -> Node {
        let yaml = r#"
name: Test Workflow
version: "1.0"
stages:
  explore:
    id: sdd-explore
    agent: orchestrator
    depends_on: []
  propose:
    id: sdd-propose
    agent: orchestrator
    depends_on: ["sdd-explore"]
  verify:
    id: sdd-verify
    agent: orchestrator
    depends_on: ["sdd-propose"]
"#;

        let mut node = Node::new_global(
            "arn:local:global:workflow/test-workflow".to_string(),
            NodeType::Workflow,
            "test-workflow".to_string(),
        )
        .with_metadata(serde_json::json!({"description": "Test workflow"}));
        node.config_json = Some(yaml.to_string());
        node
    }

    fn make_workflow_handler() -> (Arc<McpHandler>, WorkflowMcpHandler) {
        use std::path::PathBuf;

        let db = Arc::new(Database::open_in_memory().expect("in-memory db"));
        let repository = Arc::new(SqliteNodeRepository::new(db.clone()));
        let node_service = Arc::new(NodeService::new(repository));
        node_service
            .create(test_workflow_node())
            .expect("create workflow node");

        let execution_store = Arc::new(ExecutionStore::new(db.clone()));
        let artifact_service = Arc::new(artifact::application::artifact_service::ArtifactService::new(
            PathBuf::from("/tmp/test-artifacts")
        ));
        let analytics_service = Arc::new(insights::AnalyticsService::new());
        let sse_emitter = Arc::new(metrics::application::SseEmitter::new());
        let metrics_aggregator = Arc::new(metrics::application::MetricsAggregator::new());
        let artifact_store = Arc::new(crate::artifact_store::ArtifactStore::new(db.clone()));
        let state = Arc::new(AppState {
            node_service,
            db,
            execution_store,
            artifact_store,
            artifact_service,
            analytics_service,
            sse_emitter,
            metrics_aggregator,
            workspace_root: PathBuf::from("/tmp/test-workspace"),
        });

        let mcp_handler = Arc::new(McpHandler::new(state.clone(), Arc::new(MetricsBroadcaster::new())));
        let workflow_handler = WorkflowMcpHandler::new(state, Arc::new(MetricsBroadcaster::new()), mcp_handler.clone());

        (mcp_handler, workflow_handler)
    }

    #[tokio::test]
    async fn get_execution_derives_pending_stages_from_workflow() {
        let (_mcp, handler) = make_workflow_handler();

        let execution = handler
            .create_execution(WorkflowExecuteParams {
                workflow_arn: "arn:local:global:workflow/test-workflow".to_string(),
                workspace_id: "test-workspace".to_string(),
                input: Some(std::collections::HashMap::from([(
                    "goal".to_string(),
                    serde_json::json!("test"),
                )])),
                trigger_type: Some("manual".to_string()),
            })
            .await
            .expect("create execution");

        let state = handler
            .get_execution(WorkflowGetStateParams {
                execution_arn: execution.arn,
            })
            .await
            .expect("get execution state");

        // After start_execution, the first stage moves from pending to current
        assert_eq!(state.current_stage, "sdd-explore");
        assert_eq!(
            state.pending_stages,
            vec!["sdd-propose".to_string(), "sdd-verify".to_string()]
        );
        assert!(state.completed_stages.is_empty());
        assert_eq!(state.execution_context, serde_json::json!({"goal": "test"}));
    }

    #[tokio::test]
    async fn execution_get_excludes_completed_and_current_from_pending_stages() {
        let (_mcp, handler) = make_workflow_handler();

        let execution = handler
            .create_execution(WorkflowExecuteParams {
                workflow_arn: "arn:local:global:workflow/test-workflow".to_string(),
                workspace_id: "test-workspace".to_string(),
                input: Some(std::collections::HashMap::from([(
                    "goal".to_string(),
                    serde_json::json!("test"),
                )])),
                trigger_type: Some("manual".to_string()),
            })
            .await
            .expect("create execution");

        handler
            .update_execution(WorkflowUpdateStateParams {
                execution_arn: execution.arn.clone(),
                status: Some("running".to_string()),
                current_stage: Some("sdd-propose".to_string()),
                completed_stages: Some(vec!["sdd-explore".to_string()]),
                pending_stages: None,
                stage_outputs: Some(std::collections::HashMap::from([(
                    "sdd-explore".to_string(),
                    StageOutput { artifacts: vec![] },
                )])),
                execution_context: Some(serde_json::json!({"goal": "test", "phase": "propose"})),
            })
            .await
            .expect("update execution");

        let state = handler
            .execution_get(GetByArnParams {
                arn: execution.arn,
            })
            .await
            .expect("execution get");

        assert_eq!(state.pending_stages, vec!["sdd-verify".to_string()]);
        assert_eq!(state.current_stage.as_deref(), Some("sdd-propose"));
        assert!(state.stage_outputs.contains_key("sdd-explore"));
    }

    #[tokio::test]
    async fn test_workflow_execute_creates_execution() {
        let (_mcp, handler) = make_workflow_handler();

        let execution = handler
            .create_execution(WorkflowExecuteParams {
                workflow_arn: "arn:local:global:workflow/test-workflow".to_string(),
                workspace_id: "test-workspace".to_string(),
                input: Some(std::collections::HashMap::from([(
                    "goal".to_string(),
                    serde_json::json!("test goal"),
                )])),
                trigger_type: Some("manual".to_string()),
            })
            .await
            .expect("create execution should succeed");

        assert!(!execution.arn.is_empty());
        assert_eq!(execution.workflow_arn, "arn:local:global:workflow/test-workflow");
        assert_eq!(execution.workspace_id, "test-workspace");
        assert_eq!(execution.status, "running");
        assert_eq!(execution.current_stage.as_deref(), Some("sdd-explore"));
        assert!(execution.started_at.is_some());
        assert!(execution.completed_at.is_none());
    }

    #[tokio::test]
    async fn test_workflow_update_state_stage_transitions() {
        let (_mcp, handler) = make_workflow_handler();

        let execution = handler
            .create_execution(WorkflowExecuteParams {
                workflow_arn: "arn:local:global:workflow/test-workflow".to_string(),
                workspace_id: "test-workspace".to_string(),
                input: Some(std::collections::HashMap::from([(
                    "goal".to_string(),
                    serde_json::json!("test"),
                )])),
                trigger_type: Some("manual".to_string()),
            })
            .await
            .expect("create execution");

        let updated = handler
            .update_execution(WorkflowUpdateStateParams {
                execution_arn: execution.arn.clone(),
                status: Some("running".to_string()),
                current_stage: Some("sdd-verify".to_string()),
                completed_stages: Some(vec!["sdd-explore".to_string(), "sdd-propose".to_string()]),
                pending_stages: None,
                stage_outputs: Some(std::collections::HashMap::from([(
                    "sdd-explore".to_string(),
                    StageOutput { artifacts: vec![] },
                ),(
                    "sdd-propose".to_string(),
                    StageOutput { artifacts: vec![] },
                )])),
                execution_context: None,
            })
            .await
            .expect("update execution");

        assert_eq!(updated.current_stage, "sdd-verify");
        assert_eq!(updated.completed_stages, vec!["sdd-explore", "sdd-propose"]);
        assert!(updated.stage_outputs.contains_key("sdd-explore"));
        assert!(updated.stage_outputs.contains_key("sdd-propose"));
    }

    #[tokio::test]
    async fn test_workflow_get_next_stage_suggests_correct_stage() {
        let (_mcp, handler) = make_workflow_handler();

        let execution = handler
            .create_execution(WorkflowExecuteParams {
                workflow_arn: "arn:local:global:workflow/test-workflow".to_string(),
                workspace_id: "test-workspace".to_string(),
                input: Some(std::collections::HashMap::new()),
                trigger_type: Some("manual".to_string()),
            })
            .await
            .expect("create execution");

        let next = handler
            .workflow_get_next_stage(WorkflowGetNextStageParams {
                execution_arn: execution.arn.clone(),
            })
            .await
            .expect("get next stage should succeed");

        // After create_execution with no completed stages, sdd-explore (no deps) is suggested
        assert_eq!(next.suggested_stage, "sdd-explore");
        assert!(next.conditions_met);
    }

    #[tokio::test]
    async fn test_workflow_abort_execution() {
        let (_mcp, handler) = make_workflow_handler();

        let execution = handler
            .create_execution(WorkflowExecuteParams {
                workflow_arn: "arn:local:global:workflow/test-workflow".to_string(),
                workspace_id: "test-workspace".to_string(),
                input: Some(std::collections::HashMap::new()),
                trigger_type: Some("manual".to_string()),
            })
            .await
            .expect("create execution");

        let aborted = handler
            .workflow_abort(WorkflowAbortParams {
                execution_arn: execution.arn.clone(),
            })
            .await
            .expect("abort should succeed");

        assert_eq!(aborted.status, "aborted");
    }

    #[tokio::test]
    async fn test_workflow_abort_already_completed_fails() {
        let (_mcp, handler) = make_workflow_handler();

        let execution = handler
            .create_execution(WorkflowExecuteParams {
                workflow_arn: "arn:local:global:workflow/test-workflow".to_string(),
                workspace_id: "test-workspace".to_string(),
                input: Some(std::collections::HashMap::new()),
                trigger_type: Some("manual".to_string()),
            })
            .await
            .expect("create execution");

        handler
            .update_execution(WorkflowUpdateStateParams {
                execution_arn: execution.arn.clone(),
                status: Some("completed".to_string()),
                current_stage: None,
                completed_stages: Some(vec!["sdd-explore".to_string(), "sdd-propose".to_string(), "sdd-verify".to_string()]),
                pending_stages: None,
                stage_outputs: None,
                execution_context: None,
            })
            .await
            .expect("mark as completed");

        let result = handler
            .workflow_abort(WorkflowAbortParams {
                execution_arn: execution.arn.clone(),
            })
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cannot abort execution in 'completed' state"));
    }

    #[tokio::test]
    async fn test_execution_context_propagation() {
        let (_mcp, handler) = make_workflow_handler();

        let execution = handler
            .create_execution(WorkflowExecuteParams {
                workflow_arn: "arn:local:global:workflow/test-workflow".to_string(),
                workspace_id: "test-workspace".to_string(),
                input: Some(std::collections::HashMap::from([
                    ("goal".to_string(), serde_json::json!("test goal")),
                    ("phase".to_string(), serde_json::json!("explore")),
                ])),
                trigger_type: Some("manual".to_string()),
            })
            .await
            .expect("create execution");

        let state = handler
            .get_execution(WorkflowGetStateParams {
                execution_arn: execution.arn,
            })
            .await
            .expect("get execution state");

        assert_eq!(state.execution_context, serde_json::json!({"goal": "test goal", "phase": "explore"}));
    }

    #[tokio::test]
    async fn test_pending_stages_and_stage_outputs_visibility() {
        let (_mcp, handler) = make_workflow_handler();

        let execution = handler
            .create_execution(WorkflowExecuteParams {
                workflow_arn: "arn:local:global:workflow/test-workflow".to_string(),
                workspace_id: "test-workspace".to_string(),
                input: Some(std::collections::HashMap::new()),
                trigger_type: Some("manual".to_string()),
            })
            .await
            .expect("create execution");

        handler
            .update_execution(WorkflowUpdateStateParams {
                execution_arn: execution.arn.clone(),
                status: Some("running".to_string()),
                current_stage: Some("sdd-verify".to_string()),
                completed_stages: Some(vec!["sdd-explore".to_string(), "sdd-propose".to_string()]),
                pending_stages: None,
                stage_outputs: Some(std::collections::HashMap::from([(
                    "sdd-explore".to_string(),
                    StageOutput { artifacts: vec![] },
                ),(
                    "sdd-propose".to_string(),
                    StageOutput { artifacts: vec![] },
                )])),
                execution_context: None,
            })
            .await
            .expect("update execution");

        let state = handler
            .get_execution(WorkflowGetStateParams {
                execution_arn: execution.arn.clone(),
            })
            .await
            .expect("get execution state");

        assert_eq!(state.pending_stages, Vec::<String>::new());
        assert!(state.stage_outputs.contains_key("sdd-explore"));
        assert!(state.stage_outputs.contains_key("sdd-propose"));
        assert!(!state.stage_outputs.contains_key("sdd-verify"));
    }
}
