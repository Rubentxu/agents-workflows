//! Execution Repository Adapter
//!
//! Implements the workflow domain's ExecutionRepository port using the
//! existing ExecutionStore from mcp-server. This adapter lives in the
//! infrastructure layer and bridges the domain port to the existing
//! persistence implementation.
//!
//! This allows the application service to work with any repository
//! implementing the port, while reusing the existing ExecutionStore.

use crate::execution_store::{ExecutionStore, ExecutionUpdate, PersistedExecution};
#[allow(deprecated)]
use crate::types::{ExecutionListParams, TriggerInfo as McpTriggerInfo, StageOutput as McpStageOutput};
use std::collections::HashMap;
use std::sync::Arc;
use workflow::domain::execution_repository::{ExecutionRepository, ExecutionSummary};
use workflow::domain::execution_state::{ExecutionState, ExecutionStatus, TriggerInfo};
use workflow::domain::StateMachineError;
use chrono::{DateTime, Utc};

/// Adapter that implements ExecutionRepository for the existing ExecutionStore
pub struct ExecutionRepositoryAdapter {
    store: Arc<ExecutionStore>,
}

impl ExecutionRepositoryAdapter {
    pub fn new(store: Arc<ExecutionStore>) -> Self {
        Self { store }
    }

    /// Convert PersistedExecution (mcp-server type) to domain ExecutionState
    ///
    /// Note: The mcp-server StageOutput only persists artifacts, not status/metrics.
    /// We infer stage status from the execution status and completed_stages list.
    fn to_domain(&self, persisted: PersistedExecution) -> Result<ExecutionState, StateMachineError> {
        let status = ExecutionStatus::from_str(&persisted.status)
            .ok_or_else(|| StateMachineError::InvalidTransition {
                from: "unknown".to_string(),
                to: persisted.status,
                reason: "Unknown execution status".to_string(),
            })?;

        // Infer stage status from execution status and completed_stages
        let infer_stage_status = |stage_id: &str| -> workflow::domain::execution_state::StageStatus {
            if persisted.completed_stages.contains(&stage_id.to_string()) {
                workflow::domain::execution_state::StageStatus::Completed
            } else if persisted.current_stage.as_deref() == Some(stage_id) {
                workflow::domain::execution_state::StageStatus::Running
            } else {
                workflow::domain::execution_state::StageStatus::Pending
            }
        };

        let stage_outputs: HashMap<String, workflow::domain::execution_state::StageOutput> = persisted
            .stage_outputs
            .into_iter()
            .map(|(k, v)| {
                let stage_status = infer_stage_status(&k);
                let metrics = workflow::domain::execution_state::StageMetrics {
                    tokens_used: None,
                    duration_ms: None,
                    started_at: None,
                    completed_at: None,
                };
                (
                    k,
                    workflow::domain::execution_state::StageOutput {
                        status: stage_status,
                        artifacts: v.artifacts.iter().map(|a| a.name.clone()).collect(),
                        next_recommended: None,
                        error: None,
                        metrics,
                    },
                )
            })
            .collect();

        let started_at = persisted.started_at.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc)));
        let completed_at = persisted.completed_at.and_then(|s| DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc)));
        let created_at = started_at.unwrap_or_else(Utc::now);
        let updated_at = created_at;

        Ok(ExecutionState {
            execution_arn: persisted.arn,
            workflow_arn: persisted.workflow_arn,
            workspace_id: persisted.workspace_id,
            status,
            current_stage: persisted.current_stage,
            completed_stages: persisted.completed_stages,
            pending_stages: Vec::new(), // Derived at runtime from workflow DAG
            stage_outputs,
            stage_statuses: HashMap::new(), // Derived at runtime
            execution_context: persisted.execution_context,
            triggered_by: TriggerInfo {
                trigger_type: persisted.triggered_by.trigger_type,
                source: None, // MCP seam doesn't expose source
                input: persisted.triggered_by.input,
            },
            started_at,
            completed_at,
            created_at,
            updated_at,
        })
    }

    /// Convert domain ExecutionState to PersistedExecution (mcp-server type)
    #[allow(deprecated)]
    fn from_domain(&self, state: &ExecutionState) -> PersistedExecution {
        let stage_outputs: HashMap<String, McpStageOutput> = state
            .stage_outputs
            .iter()
            .map(|(k, v)| {
                (
                    k.clone(),
                    McpStageOutput {
                        artifacts: v.artifacts.iter().map(|arn| crate::types::ArtifactRef {
                            name: arn.clone(),
                            path_template: String::new(),
                        }).collect(),
                    },
                )
            })
            .collect();

        PersistedExecution {
            arn: state.execution_arn.clone(),
            workflow_arn: state.workflow_arn.clone(),
            workspace_id: state.workspace_id.clone(),
            status: state.status.as_str().to_string(),
            current_stage: state.current_stage.clone(),
            completed_stages: state.completed_stages.clone(),
            stage_outputs,
            execution_context: state.execution_context.clone(),
            triggered_by: McpTriggerInfo {
                trigger_type: state.triggered_by.trigger_type.clone(),
                source: None,
                input: state.triggered_by.input.clone(),
            },
            started_at: state.started_at.map(|dt| dt.to_rfc3339()),
            completed_at: state.completed_at.map(|dt| dt.to_rfc3339()),
        }
    }
}

impl ExecutionRepository for ExecutionRepositoryAdapter {
    fn save(&self, execution: &ExecutionState) -> Result<(), StateMachineError> {
        let persisted = self.from_domain(execution);
        self.store.create(&persisted).map_err(|e| StateMachineError::DatabaseError(e))
    }

    fn find_by_arn(&self, execution_arn: &str) -> Result<Option<ExecutionState>, StateMachineError> {
        match self.store.get(execution_arn) {
            Ok(persisted) => {
                let domain_state = self.to_domain(persisted)?;
                Ok(Some(domain_state))
            }
            Err(e) if e.contains("not found") => Ok(None),
            Err(e) => Err(StateMachineError::DatabaseError(e)),
        }
    }

    #[allow(deprecated)]
    fn update(&self, execution: &ExecutionState) -> Result<(), StateMachineError> {
        let stage_outputs: HashMap<String, McpStageOutput> = execution
            .stage_outputs
            .iter()
            .map(|(k, v)| {
                (
                    k.clone(),
                    McpStageOutput {
                        artifacts: v.artifacts.iter().map(|arn| crate::types::ArtifactRef {
                            name: arn.clone(),
                            path_template: String::new(),
                        }).collect(),
                    },
                )
            })
            .collect();

        let update = ExecutionUpdate {
            execution_arn: execution.execution_arn.clone(),
            status: execution.status.as_str().to_string(),
            current_stage: execution.current_stage.clone(),
            completed_stages: execution.completed_stages.clone(),
            stage_outputs,
            execution_context: execution.execution_context.clone(),
        };
        self.store.update(&update).map_err(|e| StateMachineError::DatabaseError(e))
    }

    fn list(
        &self,
        workspace_id: Option<&str>,
        workflow_arn: Option<&str>,
        status: Option<&str>,
        limit: Option<usize>,
    ) -> Result<Vec<ExecutionSummary>, StateMachineError> {
        let params = ExecutionListParams {
            workspace_id: workspace_id.map(String::from),
            workflow_arn: workflow_arn.map(String::from),
            status: status.map(String::from),
            limit,
        };

        self.store.list(&params)
            .map(|summaries| {
                summaries
                    .into_iter()
                    .map(|s| ExecutionSummary {
                        arn: s.arn,
                        workflow_arn: s.workflow_arn,
                        workspace_id: s.workspace_id,
                        status: s.status,
                        current_stage: s.current_stage,
                        started_at: s.started_at,
                    })
                    .collect()
            })
            .map_err(|e| StateMachineError::DatabaseError(e))
    }

    fn current_status(&self, execution_arn: &str) -> Result<Option<String>, StateMachineError> {
        self.store.current_status(execution_arn).map_err(|e| StateMachineError::DatabaseError(e))
    }

    fn abort(&self, execution_arn: &str) -> Result<(), StateMachineError> {
        let now = Utc::now().to_rfc3339();
        self.store.abort(execution_arn, &now).map_err(|e| StateMachineError::DatabaseError(e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use registry::infrastructure::db::Database;

    fn make_adapter() -> ExecutionRepositoryAdapter {
        let db = Arc::new(Database::open_in_memory().expect("in-memory db"));
        // Insert workflow node first (required for foreign key constraint)
        {
            let conn = db.connection().expect("db connection");
            conn.execute(
                "INSERT INTO nodes (id, type, name, scope, registry, namespace) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    "arn:local:global:workflow/test",
                    "workflow",
                    "test",
                    "global",
                    "local",
                    "global",
                ],
            )
            .expect("insert workflow node");
        }
        let store = Arc::new(ExecutionStore::new(db));
        ExecutionRepositoryAdapter::new(store)
    }

    #[test]
    fn test_save_and_find() {
        let adapter = make_adapter();

        let state = ExecutionState::new(
            "arn:local:workspace/test:execution/1".to_string(),
            "arn:local:global:workflow/test".to_string(),
            "test".to_string(),
            vec!["stage1".to_string()],
            TriggerInfo {
                trigger_type: "manual".to_string(),
                source: None,
                input: serde_json::json!({"goal": "test"}),
            },
        );

        adapter.save(&state).expect("save should succeed");
        let found = adapter.find_by_arn("arn:local:workspace/test:execution/1")
            .expect("find should succeed")
            .expect("execution should exist");

        assert_eq!(found.execution_arn, state.execution_arn);
        assert_eq!(found.workflow_arn, state.workflow_arn);
    }

    #[test]
    fn test_find_not_found() {
        let adapter = make_adapter();
        let result = adapter.find_by_arn("nonexistent").expect("query should succeed");
        assert!(result.is_none());
    }
}