//! Execution State Domain
//!
//! State machine for workflow execution tracking.

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

// ============================================================================
// Execution Status
// ============================================================================

/// Execution status enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Aborted,
    Paused,
}

impl ExecutionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ExecutionStatus::Pending => "pending",
            ExecutionStatus::Running => "running",
            ExecutionStatus::Completed => "completed",
            ExecutionStatus::Failed => "failed",
            ExecutionStatus::Aborted => "aborted",
            ExecutionStatus::Paused => "paused",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(ExecutionStatus::Pending),
            "running" => Some(ExecutionStatus::Running),
            "completed" => Some(ExecutionStatus::Completed),
            "failed" => Some(ExecutionStatus::Failed),
            "aborted" => Some(ExecutionStatus::Aborted),
            "paused" => Some(ExecutionStatus::Paused),
            _ => None,
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self, ExecutionStatus::Completed | ExecutionStatus::Failed | ExecutionStatus::Aborted)
    }
}

// ============================================================================
// Stage Status
// ============================================================================

/// Stage status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StageStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Skipped,
}

impl StageStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            StageStatus::Pending => "pending",
            StageStatus::Running => "running",
            StageStatus::Completed => "completed",
            StageStatus::Failed => "failed",
            StageStatus::Skipped => "skipped",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(StageStatus::Pending),
            "running" => Some(StageStatus::Running),
            "completed" => Some(StageStatus::Completed),
            "failed" => Some(StageStatus::Failed),
            "skipped" => Some(StageStatus::Skipped),
            _ => None,
        }
    }
}

// ============================================================================
// Trigger Info
// ============================================================================

/// Trigger information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerInfo {
    #[serde(rename = "type")]
    pub trigger_type: String,  // "manual", "api", "schedule", "webhook"
    pub source: Option<String>,
    pub input: serde_json::Value,
}

// ============================================================================
// Stage Output
// ============================================================================

/// Stage output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageOutput {
    pub status: StageStatus,
    pub artifacts: Vec<String>,  // ARN of produced artifacts
    pub next_recommended: Option<String>,
    pub error: Option<String>,
    pub metrics: StageMetrics,
}

/// Stage metrics
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StageMetrics {
    pub tokens_used: Option<i64>,
    pub duration_ms: Option<i64>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
}

// ============================================================================
// Execution State
// ============================================================================

/// Execution state (the state machine)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionState {
    pub execution_arn: String,
    pub workflow_arn: String,
    pub workspace_id: String,
    pub status: ExecutionStatus,
    pub current_stage: Option<String>,
    pub completed_stages: Vec<String>,
    pub pending_stages: Vec<String>,
    pub stage_outputs: HashMap<String, StageOutput>,
    pub stage_statuses: HashMap<String, StageStatus>,
    pub execution_context: serde_json::Value,
    pub triggered_by: TriggerInfo,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl ExecutionState {
    /// Create a new execution state
    pub fn new(
        execution_arn: String,
        workflow_arn: String,
        workspace_id: String,
        stages: Vec<String>,
        triggered_by: TriggerInfo,
    ) -> Self {
        let now = Utc::now();
        let execution_context = triggered_by.input.clone();
        Self {
            execution_arn,
            workflow_arn,
            workspace_id,
            status: ExecutionStatus::Pending,
            current_stage: None,
            completed_stages: Vec::new(),
            pending_stages: stages,
            stage_outputs: HashMap::new(),
            stage_statuses: HashMap::new(),
            execution_context,
            triggered_by,
            started_at: None,
            completed_at: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Start execution with the first stage
    pub fn start(&mut self, first_stage: String) -> Result<(), StateError> {
        if self.status != ExecutionStatus::Pending {
            return Err(StateError::invalid_transition(
                self.status.as_str(),
                "running",
                "Execution must be pending to start",
            ));
        }

        self.status = ExecutionStatus::Running;
        self.current_stage = Some(first_stage.clone());
        self.pending_stages.retain(|s| s != &first_stage);
        self.stage_statuses.insert(first_stage, StageStatus::Running);
        self.started_at = Some(Utc::now());
        self.updated_at = Utc::now();
        Ok(())
    }

    /// Complete a stage with its output
    pub fn complete_stage(&mut self, stage_id: &str, output: StageOutput) -> Result<Vec<String>, StateError> {
        // Validate we're in a valid state
        if self.status != ExecutionStatus::Running {
            return Err(StateError::invalid_transition(
                self.status.as_str(),
                "running",
                "Execution must be running",
            ));
        }

        // Find stage in completed or current
        if !self.completed_stages.contains(&stage_id.to_string()) && self.current_stage.as_ref() != Some(&stage_id.to_string()) {
            return Err(StateError::stage_not_found(
                stage_id,
                "Stage is not part of this execution",
            ));
        }

        // Update stage output
        self.stage_outputs.insert(stage_id.to_string(), output.clone());
        self.stage_statuses.insert(stage_id.to_string(), output.status.clone());

        // Move from current to completed
        if self.current_stage.as_ref() == Some(&stage_id.to_string()) {
            self.current_stage = None;
        }
        if !self.completed_stages.contains(&stage_id.to_string()) {
            self.completed_stages.push(stage_id.to_string());
        }

        // Mark updated
        self.updated_at = Utc::now();

        // Next stage(s) to be determined by service
        Ok(vec![])
    }

    /// Check if execution is complete
    pub fn is_complete(&self) -> bool {
        self.pending_stages.is_empty() && self.current_stage.is_none()
    }

    /// Check and update completion status
    pub fn check_completion(&mut self) -> Result<ExecutionStatus, StateError> {
        if self.is_complete() {
            self.status = ExecutionStatus::Completed;
            self.completed_at = Some(Utc::now());
            self.updated_at = Utc::now();
        }
        Ok(self.status.clone())
    }
}



// ============================================================================
// State Machine Errors
// ============================================================================

/// State machine errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateError {
    pub code: String,
    pub message: String,
}

impl StateError {
    pub fn invalid_transition(from: &str, to: &str, reason: &str) -> Self {
        Self {
            code: "INVALID_TRANSITION".to_string(),
            message: format!("Cannot transition from {} to {}: {}", from, to, reason),
        }
    }

    pub fn stage_not_found(stage: &str, reason: &str) -> Self {
        Self {
            code: "STAGE_NOT_FOUND".to_string(),
            message: format!("Stage '{}' not found: {}", stage, reason),
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_workflow() -> crate::domain::Workflow {
        let mut wf = crate::domain::Workflow::new(
            "arn:local:global:workflow/test".to_string(),
            "test".to_string(),
        );
        wf.stages.push(crate::domain::Stage::new("a".to_string(), String::new()));
        let mut b = crate::domain::Stage::new("b".to_string(), String::new());
        b.depends_on = vec!["a".to_string()];
        wf.stages.push(b);
        let mut c = crate::domain::Stage::new("c".to_string(), String::new());
        c.depends_on = vec!["a".to_string()];
        wf.stages.push(c);
        let mut d = crate::domain::Stage::new("d".to_string(), String::new());
        d.depends_on = vec!["b".to_string(), "c".to_string()];
        wf.stages.push(d);
        wf
    }

    fn create_test_trigger() -> TriggerInfo {
        TriggerInfo {
            trigger_type: "manual".to_string(),
            source: None,
            input: serde_json::json!({}),
        }
    }

    #[test]
    fn test_execution_status_is_terminal() {
        assert!(!ExecutionStatus::Pending.is_terminal());
        assert!(!ExecutionStatus::Running.is_terminal());
        assert!(!ExecutionStatus::Paused.is_terminal());
        assert!(ExecutionStatus::Completed.is_terminal());
        assert!(ExecutionStatus::Failed.is_terminal());
        assert!(ExecutionStatus::Aborted.is_terminal());
    }

    #[test]
    fn test_execution_status_conversion() {
        assert_eq!(ExecutionStatus::Pending.as_str(), "pending");
        assert_eq!(ExecutionStatus::from_str("pending"), Some(ExecutionStatus::Pending));
        assert_eq!(ExecutionStatus::from_str("invalid"), None);
    }

    #[test]
    fn test_execution_state_new() {
        let state = ExecutionState::new(
            "exec-1".to_string(),
            "arn:local:global:workflow/test".to_string(),
            "workspace-1".to_string(),
            vec!["a".to_string(), "b".to_string()],
            create_test_trigger(),
        );

        assert_eq!(state.status, ExecutionStatus::Pending);
        assert!(state.current_stage.is_none());
        assert_eq!(state.pending_stages, vec!["a", "b"]);
        assert!(state.completed_stages.is_empty());
    }

    #[test]
    fn test_execution_state_start() {
        let mut state = ExecutionState::new(
            "exec-1".to_string(),
            "arn:local:global:workflow/test".to_string(),
            "workspace-1".to_string(),
            vec!["a".to_string(), "b".to_string()],
            create_test_trigger(),
        );

        let result = state.start("a".to_string());
        assert!(result.is_ok());
        assert_eq!(state.status, ExecutionStatus::Running);
        assert_eq!(state.current_stage, Some("a".to_string()));
        assert_eq!(state.pending_stages, vec!["b"]);
        assert!(state.started_at.is_some());
    }

    #[test]
    fn test_execution_state_start_invalid_transition() {
        let mut state = ExecutionState::new(
            "exec-1".to_string(),
            "arn:local:global:workflow/test".to_string(),
            "workspace-1".to_string(),
            vec!["a".to_string()],
            create_test_trigger(),
        );

        // Start first
        state.start("a".to_string()).unwrap();

        // Try to start again - should fail
        let result = state.start("b".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_execution_state_complete_stage() {
        let mut state = ExecutionState::new(
            "exec-1".to_string(),
            "arn:local:global:workflow/test".to_string(),
            "workspace-1".to_string(),
            vec!["a".to_string(), "b".to_string()],
            create_test_trigger(),
        );

        state.start("a".to_string()).unwrap();

        let output = StageOutput {
            status: StageStatus::Completed,
            artifacts: vec![],
            next_recommended: None,
            error: None,
            metrics: StageMetrics {
                tokens_used: None,
                duration_ms: Some(100),
                started_at: None,
                completed_at: None,
            },
        };

        let result = state.complete_stage("a", output);
        assert!(result.is_ok());
        assert_eq!(state.completed_stages, vec!["a"]);
        assert!(state.current_stage.is_none());
    }

    #[test]
    fn test_execution_state_get_next_stage_via_navigator() {
        let workflow = create_test_workflow();
        let mut state = ExecutionState::new(
            "exec-1".to_string(),
            "arn:local:global:workflow/test".to_string(),
            "workspace-1".to_string(),
            vec!["a".to_string(), "b".to_string(), "c".to_string(), "d".to_string()],
            create_test_trigger(),
        );

        state.start("a".to_string()).unwrap();
        state.complete_stage("a", StageOutput {
            status: StageStatus::Completed,
            artifacts: vec![],
            next_recommended: None,
            error: None,
            metrics: StageMetrics::default(),
        }).unwrap();

        // After completing 'a', both 'b' and 'c' should be available via navigator
        let navigator = crate::application::WorkflowNavigator::new();
        let next = navigator.find_next_stage(&workflow, &state);
        assert!(next.is_some());
    }

    #[test]
    fn test_execution_state_is_complete() {
        let mut state = ExecutionState::new(
            "exec-1".to_string(),
            "arn:local:global:workflow/test".to_string(),
            "workspace-1".to_string(),
            vec!["a".to_string()],
            create_test_trigger(),
        );

        assert!(!state.is_complete());

        state.start("a".to_string()).unwrap();
        assert!(!state.is_complete());

        state.complete_stage("a", StageOutput {
            status: StageStatus::Completed,
            artifacts: vec![],
            next_recommended: None,
            error: None,
            metrics: StageMetrics::default(),
        }).unwrap();

        assert!(state.is_complete());
    }
}
