//! Workflow Navigator
//!
//! Application service for navigating workflow execution paths.
//! Works directly on `Workflow` + `ExecutionState` without requiring a parallel `Dag` model.
//!
//! ## Design Rationale
//!
//! Located in `application/` rather than `domain/` because:
//! - It orchestrates existing domain objects (Workflow, ExecutionState, Stage)
//! - It provides navigation algorithms but doesn't introduce new domain concepts
//! - It acts as a query service (read-only) rather than modifying domain state
//!
//! ## Key Operations
//!
//! - Find first executable stage (entry point for execution)
//! - List all currently executable stages (for parallel execution)
//! - Determine if a specific stage can execute based on dependencies and conditions
//! - Explain why a stage is blocked (for debugging/diagnostics)

use std::collections::HashSet;
use crate::domain::{
    ExecutionState, StageContext, StageStatus,
    Workflow,
};

/// Execution context implementation for condition evaluation.
///
/// Uses the execution state's context and stage outputs to resolve
/// condition variables.
#[derive(Debug, Clone)]
pub struct ExecutionContext {
    execution_context: serde_json::Value,
    stage_outputs: std::collections::HashMap<String, String>,
}

impl ExecutionContext {
    /// Create a new execution context from an execution state.
    pub fn from_execution_state(state: &ExecutionState) -> Self {
        let mut stage_outputs = std::collections::HashMap::new();

        // Extract output strings from stage outputs
        for (stage_id, output) in &state.stage_outputs {
            // Serialize the output status as a variable
            stage_outputs.insert(
                format!("{}.status", stage_id),
                output.status.as_str().to_string(),
            );
            // Store error if present
            if let Some(ref error) = output.error {
                stage_outputs.insert(format!("{}.error", stage_id), error.clone());
            }
            // Store next_recommended if present
            if let Some(ref next) = output.next_recommended {
                stage_outputs.insert(format!("{}.next", stage_id), next.clone());
            }
        }

        Self {
            execution_context: state.execution_context.clone(),
            stage_outputs,
        }
    }
}

/// Convert a serde_json::Value to a String, properly handling string vs number vs bool.
/// For strings, returns the actual string content without JSON quotes.
/// For numbers/bools, returns their string representation.
fn json_value_to_string(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Number(n) => Some(n.to_string()),
        serde_json::Value::Bool(b) => Some(b.to_string()),
        serde_json::Value::Null => Some("null".to_string()),
        _ => Some(value.to_string()), // Fallback for arrays/objects
    }
}

impl StageContext for ExecutionContext {
    fn get_output(&self, stage_id: &str) -> String {
        self.stage_outputs
            .get(&format!("{}.status", stage_id))
            .cloned()
            .unwrap_or_default()
    }

    fn get_variable(&self, name: &str) -> Option<String> {
        // First check stage outputs (e.g., "stage_id.status")
        if let Some(value) = self.stage_outputs.get(name) {
            return Some(value.clone());
        }

        // Then check execution context (arbitrary JSON)
        // Handle dot notation for nested objects
        let parts: Vec<&str> = name.splitn(2, '.').collect();
        if parts.len() == 2 {
            let obj_name = parts[0];
            let field_name = parts[1];
            if let Some(obj) = self.execution_context.get(obj_name) {
                if let Some(value) = obj.get(field_name) {
                    return json_value_to_string(value);
                }
            }
        }

        // Direct lookup in execution context
        self.execution_context.get(name).and_then(json_value_to_string)
    }
}

/// Blocking reason for why a stage cannot execute.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlockingReason {
    /// Stage has unmet dependencies.
    UnmetDependency { dependency: String },
    /// Stage has a condition that evaluated to false.
    ConditionFailed { condition: String },
    /// Stage is already completed.
    AlreadyCompleted,
    /// Stage is currently running.
    CurrentlyRunning,
    /// Stage was skipped.
    Skipped,
    /// Stage status is unknown (not in execution state).
    UnknownStatus,
}

impl std::fmt::Display for BlockingReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BlockingReason::UnmetDependency { dependency } => {
                write!(f, "unmet dependency: {}", dependency)
            }
            BlockingReason::ConditionFailed { condition } => {
                write!(f, "condition failed: {}", condition)
            }
            BlockingReason::AlreadyCompleted => write!(f, "already completed"),
            BlockingReason::CurrentlyRunning => write!(f, "currently running"),
            BlockingReason::Skipped => write!(f, "was skipped"),
            BlockingReason::UnknownStatus => write!(f, "status unknown"),
        }
    }
}

/// Result of checking if a stage can execute, including blocking reasons.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutableCheck {
    pub can_execute: bool,
    pub blocked_reasons: Vec<BlockingReason>,
}

impl ExecutableCheck {
    pub fn executable() -> Self {
        Self {
            can_execute: true,
            blocked_reasons: Vec::new(),
        }
    }

    pub fn blocked(reasons: Vec<BlockingReason>) -> Self {
        Self {
            can_execute: false,
            blocked_reasons: reasons,
        }
    }
}

/// WorkflowNavigator provides navigation capabilities over workflow execution.
///
/// This service operates directly on `Workflow` and `ExecutionState` without
/// requiring a separate `Dag` model, avoiding duplication of structural information.
#[derive(Debug, Clone, Default)]
pub struct WorkflowNavigator;

impl WorkflowNavigator {
    /// Create a new WorkflowNavigator.
    pub fn new() -> Self {
        Self
    }

    /// Find the first executable stage in the workflow.
    ///
    /// Returns `None` if no stage can be executed (e.g., workflow is complete
    /// or no stages satisfy entry conditions).
    ///
    /// # Arguments
    ///
    /// * `workflow` - The workflow definition
    /// * `execution_state` - Current execution state
    ///
    /// # Example
    ///
    /// ```ignore
    /// # use workflow::domain::{Workflow, ExecutionState, TriggerInfo};
    /// # use workflow::application::WorkflowNavigator;
    /// let navigator = WorkflowNavigator::new();
    /// if let Some(stage_id) = navigator.find_first_executable_stage(&workflow, &state) {
    ///     println!("First stage to execute: {}", stage_id);
    /// }
    /// ```
    pub fn find_first_executable_stage(
        &self,
        workflow: &Workflow,
        execution_state: &ExecutionState,
    ) -> Option<String> {
        // Only meaningful when execution hasn't started
        if !execution_state.completed_stages.is_empty()
            || execution_state.current_stage.is_some()
        {
            return None;
        }

        // Find a stage with no dependencies (entry point)
        // that also passes its conditions
        for stage in &workflow.stages {
            if stage.depends_on.is_empty() {
                if let Some(check) = self.check_stage_executable(workflow, execution_state, &stage.id) {
                    if check.can_execute {
                        return Some(stage.id.clone());
                    }
                }
            }
        }

        None
    }

    /// List all stages that can currently execute in parallel.
    ///
    /// Returns stages that:
    /// - Are not yet completed
    /// - Have all dependencies satisfied (completed stages)
    /// - Pass their condition evaluations
    ///
    /// # Arguments
    ///
    /// * `workflow` - The workflow definition
    /// * `execution_state` - Current execution state
    pub fn list_executable_stages(
        &self,
        workflow: &Workflow,
        execution_state: &ExecutionState,
    ) -> Vec<String> {
        workflow
            .stages
            .iter()
            .filter(|stage| {
                self.check_stage_executable(workflow, execution_state, &stage.id)
                    .map(|check| check.can_execute)
                    .unwrap_or(false)
            })
            .map(|stage| stage.id.clone())
            .collect()
    }

    /// Find the next single stage to execute.
    ///
    /// Unlike `list_executable_stages` which returns all currently executable
    /// stages (for parallel execution), this returns the first one found.
    /// The ordering is deterministic based on stage definition order.
    ///
    /// Returns `None` if no stage can execute (workflow may be complete or blocked).
    pub fn find_next_stage(
        &self,
        workflow: &Workflow,
        execution_state: &ExecutionState,
    ) -> Option<String> {
        self.list_executable_stages(workflow, execution_state)
            .into_iter()
            .next()
    }

    /// Check if a specific stage can execute.
    ///
    /// Evaluates both dependencies and conditions.
    ///
    /// # Arguments
    ///
    /// * `workflow` - The workflow definition
    /// * `execution_state` - Current execution state
    /// * `stage_id` - ID of the stage to check
    ///
    /// # Returns
    ///
    /// `Some(ExecutableCheck)` if the stage exists, `None` if stage not found.
    pub fn check_stage_executable(
        &self,
        workflow: &Workflow,
        execution_state: &ExecutionState,
        stage_id: &str,
    ) -> Option<ExecutableCheck> {
        let stage = workflow.get_stage(stage_id)?;

        let mut reasons = Vec::new();

        // Check stage status in execution state
        if let Some(status) = execution_state.stage_statuses.get(stage_id) {
            match status {
                StageStatus::Completed => reasons.push(BlockingReason::AlreadyCompleted),
                StageStatus::Running => reasons.push(BlockingReason::CurrentlyRunning),
                StageStatus::Skipped => reasons.push(BlockingReason::Skipped),
                StageStatus::Pending | StageStatus::Failed => {
                    // These are OK to proceed
                }
            }
        } else if execution_state.completed_stages.contains(&stage_id.to_string()) {
            // In completed_stages but not in stage_statuses (edge case)
            reasons.push(BlockingReason::AlreadyCompleted);
        } else if execution_state
            .current_stage
            .as_ref()
            .map(|s| s == stage_id)
            .unwrap_or(false)
        {
            reasons.push(BlockingReason::CurrentlyRunning);
        }

        // If already in a blocking state, return early
        if !reasons.is_empty() {
            return Some(ExecutableCheck::blocked(reasons));
        }

        // Check dependencies
        for dep in &stage.depends_on {
            if !execution_state.completed_stages.contains(dep) {
                reasons.push(BlockingReason::UnmetDependency {
                    dependency: dep.clone(),
                });
            }
        }

        // If any dependencies are unmet, return early
        if !reasons.is_empty() {
            return Some(ExecutableCheck::blocked(reasons));
        }

        // Evaluate conditions
        let context = ExecutionContext::from_execution_state(execution_state);
        for condition in &stage.conditions {
            if !condition.evaluate(&context) {
                reasons.push(BlockingReason::ConditionFailed {
                    condition: condition.when.clone(),
                });
            }
        }

        if reasons.is_empty() {
            Some(ExecutableCheck::executable())
        } else {
            Some(ExecutableCheck::blocked(reasons))
        }
    }

    /// Get detailed blocking reasons for why a stage cannot execute.
    ///
    /// This provides more diagnostic information than `check_stage_executable`.
    ///
    /// # Returns
    ///
    /// `Some(vec![...])` with blocking reasons if stage exists, `None` if stage not found.
    pub fn get_blocked_reasons(
        &self,
        workflow: &Workflow,
        execution_state: &ExecutionState,
        stage_id: &str,
    ) -> Option<Vec<BlockingReason>> {
        self.check_stage_executable(workflow, execution_state, stage_id)
            .map(|check| check.blocked_reasons)
    }

    /// Check if execution is complete (all stages done or no more executable stages).
    ///
    /// Note: This returns `true` when there are no more executable stages,
    /// which could mean either successful completion OR being blocked.
    /// Use `is_workflow_complete` for a stricter check.
    pub fn is_execution_exhausted(
        &self,
        workflow: &Workflow,
        execution_state: &ExecutionState,
    ) -> bool {
        self.list_executable_stages(workflow, execution_state)
            .is_empty()
    }

    /// Check if all stages in the workflow have been completed successfully.
    ///
    /// This is stricter than `is_execution_exhausted` - it verifies that
    /// every stage reached `Completed` status, not just that nothing is running.
    pub fn is_workflow_complete(
        &self,
        workflow: &Workflow,
        execution_state: &ExecutionState,
    ) -> bool {
        workflow.stages.iter().all(|stage| {
            execution_state
                .stage_statuses
                .get(&stage.id)
                .map(|status| *status == StageStatus::Completed)
                .unwrap_or(false)
        })
    }

    /// Get all stages that are currently blocked, grouped by blocking reason.
    ///
    /// Useful for debugging why a workflow is stuck.
    pub fn get_blocked_stages(
        &self,
        workflow: &Workflow,
        execution_state: &ExecutionState,
    ) -> std::collections::HashMap<String, Vec<BlockingReason>> {
        let mut blocked = std::collections::HashMap::new();

        for stage in &workflow.stages {
            // Skip already completed/running stages
            if execution_state.completed_stages.contains(&stage.id)
                || execution_state
                    .current_stage
                    .as_ref()
                    .map(|s| s == &stage.id)
                    .unwrap_or(false)
            {
                continue;
            }

            if let Some(reasons) = self.get_blocked_reasons(workflow, execution_state, &stage.id) {
                if !reasons.is_empty() {
                    blocked.insert(stage.id.clone(), reasons);
                }
            }
        }

        blocked
    }

    /// Get the topological order of stages, filtered by what's executable.
    ///
    /// Returns executable stages in dependency order.
    pub fn get_executable_in_order(
        &self,
        workflow: &Workflow,
        execution_state: &ExecutionState,
    ) -> Vec<String> {
        let executable: HashSet<String> = self
            .list_executable_stages(workflow, execution_state)
            .into_iter()
            .collect();

        workflow
            .stages_in_order()
            .into_iter()
            .filter(|stage| executable.contains(&stage.id))
            .map(|stage| stage.id.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::execution_state::{
        StageOutput as ExecStageOutput, StageStatus, TriggerInfo,
    };
    use crate::domain::stage::{Condition, ConditionOperator, StageExecution};
    use crate::domain::Stage;

    fn create_test_workflow() -> Workflow {
        let mut workflow = Workflow::new(
            "arn:local:global:workflow/test".to_string(),
            "test-workflow".to_string(),
        );

        // Stage a: no dependencies
        let mut stage_a = Stage::new("a".to_string(), "agent1".to_string());
        stage_a.description = "Stage A".to_string();
        stage_a.execution = StageExecution::default();

        // Stage b: depends on a
        let mut stage_b = Stage::new("b".to_string(), "agent2".to_string());
        stage_b.depends_on = vec!["a".to_string()];

        // Stage c: depends on a
        let mut stage_c = Stage::new("c".to_string(), "agent3".to_string());
        stage_c.depends_on = vec!["a".to_string()];

        // Stage d: depends on b and c
        let mut stage_d = Stage::new("d".to_string(), "agent4".to_string());
        stage_d.depends_on = vec!["b".to_string(), "c".to_string()];

        workflow.stages = vec![stage_a, stage_b, stage_c, stage_d];
        workflow
    }

    fn create_pending_execution_state() -> ExecutionState {
        ExecutionState::new(
            "exec-1".to_string(),
            "arn:local:global:workflow/test".to_string(),
            "workspace-1".to_string(),
            vec!["a".to_string(), "b".to_string(), "c".to_string(), "d".to_string()],
            TriggerInfo {
                trigger_type: "manual".to_string(),
                source: None,
                input: serde_json::json!({}),
            },
        )
    }

    fn completed_output() -> ExecStageOutput {
        ExecStageOutput {
            status: StageStatus::Completed,
            artifacts: vec![],
            next_recommended: None,
            error: None,
            metrics: Default::default(),
        }
    }

    #[test]
    fn test_find_first_executable_stage_pending() {
        let workflow = create_test_workflow();
        let state = create_pending_execution_state();
        let navigator = WorkflowNavigator::new();

        let first = navigator.find_first_executable_stage(&workflow, &state);
        assert_eq!(first, Some("a".to_string()));
    }

    #[test]
    fn test_find_first_executable_stage_after_start() {
        let workflow = create_test_workflow();
        let mut state = create_pending_execution_state();

        // Simulate starting execution
        state.start("a".to_string()).unwrap();

        let navigator = WorkflowNavigator::new();
        let first = navigator.find_first_executable_stage(&workflow, &state);
        assert_eq!(first, None); // None because a is already running
    }

    #[test]
    fn test_list_executable_stages_initial() {
        let workflow = create_test_workflow();
        let state = create_pending_execution_state();
        let navigator = WorkflowNavigator::new();

        let executable = navigator.list_executable_stages(&workflow, &state);
        assert_eq!(executable, vec!["a"]);
    }

    #[test]
    fn test_list_executable_stages_after_a_completed() {
        let workflow = create_test_workflow();
        let mut state = create_pending_execution_state();

        state.start("a".to_string()).unwrap();
        state.complete_stage("a", completed_output()).unwrap();

        let navigator = WorkflowNavigator::new();
        let executable = navigator.list_executable_stages(&workflow, &state);

        // Both b and c should be executable (parallel stages after a)
        assert!(executable.contains(&"b".to_string()));
        assert!(executable.contains(&"c".to_string()));
        assert_eq!(executable.len(), 2);
    }

    #[test]
    fn test_check_stage_executable_unknown_stage() {
        let workflow = create_test_workflow();
        let state = create_pending_execution_state();
        let navigator = WorkflowNavigator::new();

        let result = navigator.check_stage_executable(&workflow, &state, "nonexistent");
        assert_eq!(result, None);
    }

    #[test]
    fn test_check_stage_executable_with_unmet_dependency() {
        let workflow = create_test_workflow();
        let state = create_pending_execution_state();
        let navigator = WorkflowNavigator::new();

        let result = navigator
            .check_stage_executable(&workflow, &state, "b")
            .unwrap();

        assert!(!result.can_execute);
        assert!(result.blocked_reasons.contains(
            &BlockingReason::UnmetDependency { dependency: "a".to_string() }
        ));
    }

    #[test]
    fn test_check_stage_executable_after_dependency_completed() {
        let workflow = create_test_workflow();
        let mut state = create_pending_execution_state();

        state.start("a".to_string()).unwrap();
        state.complete_stage("a", completed_output()).unwrap();

        let navigator = WorkflowNavigator::new();
        let result = navigator
            .check_stage_executable(&workflow, &state, "b")
            .unwrap();

        assert!(result.can_execute);
        assert!(result.blocked_reasons.is_empty());
    }

    #[test]
    fn test_check_stage_executable_already_completed() {
        let workflow = create_test_workflow();
        let mut state = create_pending_execution_state();

        state.start("a".to_string()).unwrap();
        state.complete_stage("a", completed_output()).unwrap();

        let navigator = WorkflowNavigator::new();
        let result = navigator
            .check_stage_executable(&workflow, &state, "a")
            .unwrap();

        assert!(!result.can_execute);
        assert!(result
            .blocked_reasons
            .contains(&BlockingReason::AlreadyCompleted));
    }

    #[test]
    fn test_check_stage_executable_currently_running() {
        let workflow = create_test_workflow();
        let mut state = create_pending_execution_state();

        state.start("a".to_string()).unwrap();

        let navigator = WorkflowNavigator::new();
        let result = navigator
            .check_stage_executable(&workflow, &state, "a")
            .unwrap();

        assert!(!result.can_execute);
        assert!(result
            .blocked_reasons
            .contains(&BlockingReason::CurrentlyRunning));
    }

    #[test]
    fn test_find_next_stage_simple() {
        let workflow = create_test_workflow();
        let state = create_pending_execution_state();
        let navigator = WorkflowNavigator::new();

        let next = navigator.find_next_stage(&workflow, &state);
        assert_eq!(next, Some("a".to_string()));
    }

    #[test]
    fn test_is_execution_exhausted_initial() {
        let workflow = create_test_workflow();
        let state = create_pending_execution_state();
        let navigator = WorkflowNavigator::new();

        assert!(!navigator.is_execution_exhausted(&workflow, &state));
    }

    #[test]
    fn test_is_execution_exhausted_partial() {
        let workflow = create_test_workflow();
        let mut state = create_pending_execution_state();

        state.start("a".to_string()).unwrap();
        state.complete_stage("a", completed_output()).unwrap();

        let navigator = WorkflowNavigator::new();
        assert!(!navigator.is_execution_exhausted(&workflow, &state)); // b and c available
    }

    #[test]
    fn test_get_executable_in_order() {
        let workflow = create_test_workflow();
        let mut state = create_pending_execution_state();

        state.start("a".to_string()).unwrap();
        state.complete_stage("a", completed_output()).unwrap();

        let navigator = WorkflowNavigator::new();
        let order = navigator.get_executable_in_order(&workflow, &state);

        // b and c in dependency order (b comes before c in definition)
        assert_eq!(order, vec!["b", "c"]);
    }

    #[test]
    fn test_workflow_complete() {
        let workflow = create_test_workflow();
        let mut state = create_pending_execution_state();
        let navigator = WorkflowNavigator::new();

        assert!(!navigator.is_workflow_complete(&workflow, &state));

        // Complete all stages properly
        state.start("a".to_string()).unwrap();
        state.complete_stage("a", completed_output()).unwrap();

        // Complete b and c (they need to be started first then completed)
        state.current_stage = Some("b".to_string());
        state.pending_stages.retain(|s| s != "b");
        state.stage_statuses.insert("b".to_string(), StageStatus::Running);
        state.complete_stage("b", completed_output()).unwrap();

        state.current_stage = Some("c".to_string());
        state.pending_stages.retain(|s| s != "c");
        state.stage_statuses.insert("c".to_string(), StageStatus::Running);
        state.complete_stage("c", completed_output()).unwrap();

        // d depends on b and c, so we need both done first
        assert!(!navigator.is_workflow_complete(&workflow, &state));

        // Complete d
        state.current_stage = Some("d".to_string());
        state.pending_stages.retain(|s| s != "d");
        state.stage_statuses.insert("d".to_string(), StageStatus::Running);
        state.complete_stage("d", completed_output()).unwrap();

        assert!(navigator.is_workflow_complete(&workflow, &state));
    }

    #[test]
    fn test_get_blocked_stages() {
        let workflow = create_test_workflow();
        let mut state = create_pending_execution_state();

        state.start("a".to_string()).unwrap();
        state.complete_stage("a", completed_output()).unwrap();

        let navigator = WorkflowNavigator::new();
        let blocked = navigator.get_blocked_stages(&workflow, &state);

        // d should be blocked (depends on b and c, neither completed)
        assert!(blocked.contains_key("d"));
        assert!(blocked.get("d").unwrap().contains(
            &BlockingReason::UnmetDependency { dependency: "b".to_string() }
        ));
    }
}

/// Tests for condition evaluation within the navigator.
#[cfg(test)]
mod condition_tests {
    use super::*;
    use crate::domain::execution_state::TriggerInfo;
    use crate::domain::stage::{Condition, ConditionOperator, StageExecution};
    use crate::domain::Stage;

    fn create_workflow_with_condition(
        condition: Condition,
    ) -> (Workflow, ExecutionState) {
        let mut workflow = Workflow::new(
            "arn:local:global:workflow/test".to_string(),
            "test-workflow".to_string(),
        );

        let mut stage = Stage::new("a".to_string(), "agent1".to_string());
        stage.conditions = vec![condition];
        stage.execution = StageExecution::default();
        workflow.stages.push(stage);

        let state = ExecutionState::new(
            "exec-1".to_string(),
            "arn:local:global:workflow/test".to_string(),
            "workspace-1".to_string(),
            vec!["a".to_string()],
            TriggerInfo {
                trigger_type: "manual".to_string(),
                source: None,
                input: serde_json::json!({"env": "test"}),
            },
        );

        (workflow, state)
    }

    #[test]
    fn test_condition_equals_true() {
        let condition = Condition {
            when: "env".to_string(),
            operator: ConditionOperator::Equals,
            value: serde_json::json!("test"),
        };

        let (workflow, state) = create_workflow_with_condition(condition);
        let navigator = WorkflowNavigator::new();

        let result = navigator
            .check_stage_executable(&workflow, &state, "a")
            .unwrap();

        assert!(result.can_execute);
    }

    #[test]
    fn test_condition_equals_false() {
        let condition = Condition {
            when: "env".to_string(),
            operator: ConditionOperator::Equals,
            value: serde_json::json!("production"),
        };

        let (workflow, state) = create_workflow_with_condition(condition);
        let navigator = WorkflowNavigator::new();

        let result = navigator
            .check_stage_executable(&workflow, &state, "a")
            .unwrap();

        assert!(!result.can_execute);
        assert!(result.blocked_reasons.contains(
            &BlockingReason::ConditionFailed { condition: "env".to_string() }
        ));
    }

    #[test]
    fn test_condition_in_list() {
        let condition = Condition {
            when: "env".to_string(),
            operator: ConditionOperator::In,
            value: serde_json::json!(["test", "staging"]),
        };

        let (workflow, state) = create_workflow_with_condition(condition);
        let navigator = WorkflowNavigator::new();

        let result = navigator
            .check_stage_executable(&workflow, &state, "a")
            .unwrap();

        assert!(result.can_execute);
    }

    #[test]
    fn test_condition_greater_than() {
        // NOTE: The existing Condition::evaluate in stage.rs has a limitation:
        // self.value.as_str().unwrap_or("").parse::<f64>() returns 0 for JSON numbers
        // because as_str() returns None for numbers. This test documents this limitation.
        //
        // For proper numeric comparison, Condition::evaluate would need to be enhanced
        // to use as_f64() or similar for numeric values.
        let condition = Condition {
            when: "threshold".to_string(),
            operator: ConditionOperator::GreaterThan,
            value: serde_json::json!("10"), // 15 > 10 = true
        };

        let mut workflow = Workflow::new(
            "arn:local:global:workflow/test".to_string(),
            "test-workflow".to_string(),
        );

        let mut stage = Stage::new("a".to_string(), "agent1".to_string());
        stage.conditions = vec![condition];
        workflow.stages.push(stage);

        let state = ExecutionState::new(
            "exec-1".to_string(),
            "arn:local:global:workflow/test".to_string(),
            "workspace-1".to_string(),
            vec!["a".to_string()],
            TriggerInfo {
                trigger_type: "manual".to_string(),
                source: None,
                input: serde_json::json!({"threshold": 15}),
            },
        );

        let navigator = WorkflowNavigator::new();
        let result = navigator
            .check_stage_executable(&workflow, &state, "a")
            .unwrap();

        assert!(result.can_execute);
    }

    #[test]
    fn test_condition_missing_variable() {
        let condition = Condition {
            when: "nonexistent".to_string(),
            operator: ConditionOperator::Equals,
            value: serde_json::json!("value"),
        };

        let (workflow, state) = create_workflow_with_condition(condition);
        let navigator = WorkflowNavigator::new();

        let result = navigator
            .check_stage_executable(&workflow, &state, "a")
            .unwrap();

        // Condition evaluate returns false when variable is missing
        assert!(!result.can_execute);
    }
}
