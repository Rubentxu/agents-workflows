//! Execution Application Service
//!
//! Orchestrates execution lifecycle: creation, starting, stage completion.
//! Acts as the application service layer coordinating domain objects and
//! the execution repository.
//!
//! This service works with domain types and the ExecutionRepository port,
//! keeping handlers in mcp-server decoupled from domain logic.

use crate::application::WorkflowNavigator;
use crate::domain::execution_state::{ExecutionState, ExecutionStatus, StageMetrics, StageOutput as DomainStageOutput, StageStatus, TriggerInfo};
use crate::domain::execution_repository::{ExecutionRepository, ExecutionSummary};
use crate::domain::{StateMachineError, Workflow};
use std::collections::HashMap;

/// Execution application service - orchestrates execution lifecycle
pub struct ExecutionApplicationService<R: ExecutionRepository> {
    repository: std::sync::Arc<R>,
    navigator: WorkflowNavigator,
}

impl<R: ExecutionRepository> ExecutionApplicationService<R> {
    /// Create a new execution service with the given repository
    pub fn new(repository: std::sync::Arc<R>) -> Self {
        Self {
            repository,
            navigator: WorkflowNavigator::new(),
        }
    }

    /// Create and start a new execution from a workflow
    ///
    /// Returns the created execution ARN and the first stage to execute
    pub fn create_and_start_execution(
        &self,
        execution_arn: String,
        workflow: &Workflow,
        workspace_id: String,
        triggered_by: TriggerInfo,
    ) -> Result<(String, String), StateMachineError> {
        // 1. Create execution state from workflow
        let stage_ids: Vec<String> = workflow.stages.iter().map(|s| s.id.clone()).collect();
        let mut state = ExecutionState::new(
            execution_arn.clone(),
            workflow.arn.clone(),
            workspace_id,
            stage_ids,
            triggered_by,
        );

        // 2. Determine the first executable stage from the workflow definition
        let first_stage = self
            .navigator
            .find_first_executable_stage(workflow, &state)
            .ok_or_else(|| StateMachineError::InvalidTransition {
                from: "pending".to_string(),
                to: "running".to_string(),
                reason: "No executable entry stage found in workflow".to_string(),
            })?;

        state.start(first_stage.clone()).map_err(|e| StateMachineError::InvalidTransition {
            from: e.code,
            to: "running".to_string(),
            reason: e.message,
        })?;

        // 3. Persist the initial execution state
        self.repository.save(&state).map_err(|e| StateMachineError::DatabaseError(e.to_string()))?;

        // 4. Return ARN and first stage for the caller to process
        Ok((state.execution_arn, first_stage))
    }

    /// Get an execution by ARN
    pub fn get_execution(&self, execution_arn: &str) -> Result<Option<ExecutionState>, StateMachineError> {
        self.repository.find_by_arn(execution_arn)
    }

    /// Update execution state after stage completion
    ///
    /// Returns the updated execution state. Note: this does NOT auto-compute
    /// the next stage since that requires the workflow DAG. Callers should use
    /// `StateMachineService::get_next_stage` directly or pass the workflow to
    /// `get_next_stage_with_workflow`.
    pub fn complete_stage(
        &self,
        execution_arn: &str,
        stage_id: &str,
        output: DomainStageOutput,
    ) -> Result<ExecutionState, StateMachineError> {
        // 1. Load current state
        let mut state = self.repository
            .find_by_arn(execution_arn)
            .map_err(|e| StateMachineError::DatabaseError(e.to_string()))?
            .ok_or_else(|| StateMachineError::ExecutionNotFound(execution_arn.to_string()))?;

        // 2. Complete the stage in domain
        state.complete_stage(stage_id, output).map_err(|e| StateMachineError::InvalidTransition {
            from: e.code,
            to: "running".to_string(),
            reason: e.message,
        })?;

        // 3. Check for completion
        state.check_completion().map_err(|e| StateMachineError::InvalidTransition {
            from: state.status.as_str().to_string(),
            to: "completed".to_string(),
            reason: e.message,
        })?;

        // 4. Persist updated state
        self.repository.update(&state).map_err(|e| StateMachineError::DatabaseError(e.to_string()))?;

        Ok(state)
    }

    /// Get the next executable stage based on workflow
    ///
    /// This should be called after `complete_stage` to determine what to run next.
    /// Returns the next stage ID or None if execution is complete.
    pub fn get_next_stage_with_workflow(
        &self,
        execution: &ExecutionState,
        workflow: &Workflow,
    ) -> Result<Option<String>, StateMachineError> {
        Ok(self.navigator.find_next_stage(workflow, execution))
    }

    /// Load, compute and move execution to the next stage if one exists.
    pub fn advance_to_next_stage(
        &self,
        execution_arn: &str,
        workflow: &Workflow,
    ) -> Result<ExecutionState, StateMachineError> {
        let mut state = self
            .repository
            .find_by_arn(execution_arn)?
            .ok_or_else(|| StateMachineError::ExecutionNotFound(execution_arn.to_string()))?;

        if let Some(next_stage) = self.navigator.find_next_stage(workflow, &state) {
            state.current_stage = Some(next_stage.clone());
            state.pending_stages.retain(|s| s != &next_stage);
            state
                .stage_statuses
                .insert(next_stage, crate::domain::execution_state::StageStatus::Running);
        } else {
            state.check_completion().map_err(|e| StateMachineError::InvalidTransition {
                from: state.status.as_str().to_string(),
                to: "completed".to_string(),
                reason: e.message,
            })?;
        }

        self.repository.update(&state)?;
        Ok(state)
    }

    /// List executions with optional filters
    pub fn list_executions(
        &self,
        workspace_id: Option<&str>,
        workflow_arn: Option<&str>,
        status: Option<&str>,
        limit: Option<usize>,
    ) -> Result<Vec<ExecutionSummary>, StateMachineError> {
        self.repository.list(workspace_id, workflow_arn, status, limit)
    }

    /// Transitional application-level update method for orchestrator-driven state synchronization.
    ///
    /// Keeps the current MCP API contract while moving write orchestration behind
    /// the application service. This is intentionally permissive and should be
    /// tightened as the runtime aggregate becomes the only mutation surface.
    pub fn synchronize_execution_state(
        &self,
        execution_arn: &str,
        status: Option<&str>,
        current_stage: Option<String>,
        completed_stages: Option<Vec<String>>,
        stage_outputs: Option<HashMap<String, Vec<String>>>,
        execution_context: Option<serde_json::Value>,
    ) -> Result<ExecutionState, StateMachineError> {
        let mut state = self
            .repository
            .find_by_arn(execution_arn)?
            .ok_or_else(|| StateMachineError::ExecutionNotFound(execution_arn.to_string()))?;

        if let Some(status_str) = status {
            state.status = ExecutionStatus::from_str(status_str).ok_or_else(|| {
                StateMachineError::InvalidTransition {
                    from: state.status.as_str().to_string(),
                    to: status_str.to_string(),
                    reason: "Unknown execution status".to_string(),
                }
            })?;
            if matches!(state.status, ExecutionStatus::Completed | ExecutionStatus::Aborted | ExecutionStatus::Failed)
                && state.completed_at.is_none()
            {
                state.completed_at = Some(chrono::Utc::now());
            }
            if matches!(state.status, ExecutionStatus::Running) && state.started_at.is_none() {
                state.started_at = Some(chrono::Utc::now());
            }
        }

        if let Some(stage) = current_stage {
            state.current_stage = Some(stage);
        }

        if let Some(completed) = completed_stages {
            state.completed_stages = completed;
        }

        if let Some(context) = execution_context {
            state.execution_context = context;
        }

        if let Some(outputs) = stage_outputs {
            let completed_lookup = state.completed_stages.clone();
            let current_lookup = state.current_stage.clone();
            state.stage_outputs = outputs
                .into_iter()
                .map(|(stage_id, artifacts)| {
                    let inferred_status = if completed_lookup.contains(&stage_id) {
                        StageStatus::Completed
                    } else if current_lookup.as_deref() == Some(stage_id.as_str()) {
                        StageStatus::Running
                    } else {
                        StageStatus::Pending
                    };
                    (
                        stage_id,
                        DomainStageOutput {
                            status: inferred_status,
                            artifacts,
                            next_recommended: None,
                            error: None,
                            metrics: StageMetrics::default(),
                        },
                    )
                })
                .collect();
        }

        state.stage_statuses = HashMap::new();
        for stage_id in &state.completed_stages {
            state
                .stage_statuses
                .insert(stage_id.clone(), StageStatus::Completed);
        }
        if let Some(current) = state.current_stage.clone() {
            state.stage_statuses.insert(current, StageStatus::Running);
        }

        self.repository.update(&state)?;
        Ok(state)
    }

    /// Abort an execution
    pub fn abort_execution(&self, execution_arn: &str) -> Result<ExecutionState, StateMachineError> {
        let current_status = self.repository.current_status(execution_arn)?
            .ok_or_else(|| StateMachineError::ExecutionNotFound(execution_arn.to_string()))?;
        if matches!(current_status.as_str(), "completed" | "aborted") {
            return Err(StateMachineError::InvalidTransition {
                from: current_status,
                to: "aborted".to_string(),
                reason: "Execution is already terminal".to_string(),
            });
        }

        self.repository.abort(execution_arn)?;
        self.repository
            .find_by_arn(execution_arn)?
            .ok_or_else(|| StateMachineError::ExecutionNotFound(execution_arn.to_string()))
    }

    /// Get current status of an execution
    pub fn get_status(&self, execution_arn: &str) -> Result<Option<String>, StateMachineError> {
        self.repository.current_status(execution_arn)
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::execution_state::StageStatus;
    use std::collections::HashMap;
    use crate::domain::Stage;

    /// Mock repository for testing
    struct MockRepository {
        executions: std::sync::Mutex<HashMap<String, ExecutionState>>,
    }

    impl MockRepository {
        fn new() -> Self {
            Self {
                executions: std::sync::Mutex::new(HashMap::new()),
            }
        }
    }

    impl ExecutionRepository for MockRepository {
        fn save(&self, execution: &ExecutionState) -> Result<(), StateMachineError> {
            let mut execs = self.executions.lock().unwrap();
            execs.insert(execution.execution_arn.clone(), execution.clone());
            Ok(())
        }

        fn find_by_arn(&self, execution_arn: &str) -> Result<Option<ExecutionState>, StateMachineError> {
            let execs = self.executions.lock().unwrap();
            Ok(execs.get(execution_arn).cloned())
        }

        fn update(&self, execution: &ExecutionState) -> Result<(), StateMachineError> {
            let mut execs = self.executions.lock().unwrap();
            if execs.contains_key(&execution.execution_arn) {
                execs.insert(execution.execution_arn.clone(), execution.clone());
                Ok(())
            } else {
                Err(StateMachineError::ExecutionNotFound(execution.execution_arn.clone()))
            }
        }

        fn list(&self, _workspace_id: Option<&str>, _workflow_arn: Option<&str>, _status: Option<&str>, _limit: Option<usize>) -> Result<Vec<ExecutionSummary>, StateMachineError> {
            Ok(Vec::new())
        }

        fn current_status(&self, execution_arn: &str) -> Result<Option<String>, StateMachineError> {
            let execs = self.executions.lock().unwrap();
            Ok(execs.get(execution_arn).map(|e| e.status.as_str().to_string()))
        }

        fn abort(&self, _execution_arn: &str) -> Result<(), StateMachineError> {
            Ok(())
        }
    }

    fn create_test_workflow() -> Workflow {
        Workflow {
            arn: "arn:local:global:workflow/test".to_string(),
            name: "test-workflow".to_string(),
            version: "1.0".to_string(),
            description: "Test workflow".to_string(),
            agents: HashMap::new(),
            skills: HashMap::new(),
            stages: vec![
                Stage {
                    id: "init".to_string(),
                    agent: "agent1".to_string(),
                    depends_on: vec![],
                    description: "Initialize".to_string(),
                    input: HashMap::new(),
                    output: Default::default(),
                    execution: Default::default(),
                    conditions: vec![],
                    metrics: vec![],
                },
                Stage {
                    id: "execute".to_string(),
                    agent: "agent2".to_string(),
                    depends_on: vec!["init".to_string()],
                    description: "Execute".to_string(),
                    input: HashMap::new(),
                    output: Default::default(),
                    execution: Default::default(),
                    conditions: vec![],
                    metrics: vec![],
                },
            ],
            execution: Default::default(),
            metrics: Default::default(),
        }
    }

    #[test]
    fn test_create_and_start_execution() {
        let repo = std::sync::Arc::new(MockRepository::new());
        let service = ExecutionApplicationService::new(repo.clone());
        let workflow = create_test_workflow();

        let result = service.create_and_start_execution(
            "arn:local:workspace/test:execution/1".to_string(),
            &workflow,
            "test".to_string(),
            TriggerInfo {
                trigger_type: "manual".to_string(),
                source: None,
                input: serde_json::json!({"goal": "test"}),
            },
        );

        assert!(result.is_ok());
        let (arn, first_stage) = result.unwrap();
        assert_eq!(arn, "arn:local:workspace/test:execution/1");
        assert_eq!(first_stage, "init");

        // Verify state was persisted
        let state = repo.find_by_arn(&arn).unwrap().unwrap();
        assert_eq!(state.status.as_str(), "running");
        assert_eq!(state.current_stage, Some("init".to_string()));
    }

    #[test]
    fn test_complete_stage() {
        let repo = std::sync::Arc::new(MockRepository::new());
        let service = ExecutionApplicationService::new(repo.clone());
        let workflow = create_test_workflow();

        // Create execution first
        let (arn, _) = service.create_and_start_execution(
            "arn:local:workspace/test:execution/1".to_string(),
            &workflow,
            "test".to_string(),
            TriggerInfo {
                trigger_type: "manual".to_string(),
                source: None,
                input: serde_json::json!({"goal": "test"}),
            },
        ).unwrap();

        // Complete the init stage
        let output = DomainStageOutput {
            status: StageStatus::Completed,
            artifacts: vec![],
            next_recommended: None,
            error: None,
            metrics: Default::default(),
        };

        let result = service.complete_stage(&arn, "init", output);
        assert!(result.is_ok());
        let updated_state = result.unwrap();
        assert_eq!(updated_state.completed_stages, vec!["init"]);

        // Now get the next stage using the workflow
        let next_result = service.get_next_stage_with_workflow(&updated_state, &workflow);
        assert!(next_result.is_ok());
        let next_stage = next_result.unwrap();
        assert_eq!(next_stage, Some("execute".to_string())); // Next stage should be "execute"
    }
}
