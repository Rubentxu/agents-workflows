//! Execution Repository Port
//!
//! Abstract interface for execution persistence. Implementations live in
//! the infrastructure layer (e.g., SQLite adapter).
//!
//! This follows DDD port/repository pattern where the interface is defined
//! in the domain layer and implemented in infrastructure.

use crate::domain::execution_state::ExecutionState;
use crate::domain::StateMachineError;

/// Execution repository port - abstracts persistence of execution state.
/// This allows the application service to remain independent of the
/// underlying storage mechanism.
pub trait ExecutionRepository: Send + Sync {
    /// Save a new execution state
    fn save(&self, execution: &ExecutionState) -> Result<(), StateMachineError>;

    /// Retrieve an execution by ARN
    fn find_by_arn(&self, execution_arn: &str) -> Result<Option<ExecutionState>, StateMachineError>;

    /// Update an existing execution state
    fn update(&self, execution: &ExecutionState) -> Result<(), StateMachineError>;

    /// List executions with optional filters
    fn list(
        &self,
        workspace_id: Option<&str>,
        workflow_arn: Option<&str>,
        status: Option<&str>,
        limit: Option<usize>,
    ) -> Result<Vec<ExecutionSummary>, StateMachineError>;

    /// Get the current status of an execution
    fn current_status(&self, execution_arn: &str) -> Result<Option<String>, StateMachineError>;

    /// Abort an execution
    fn abort(&self, execution_arn: &str) -> Result<(), StateMachineError>;
}

/// Lightweight summary for listing - avoids loading full state
#[derive(Debug, Clone)]
pub struct ExecutionSummary {
    pub arn: String,
    pub workflow_arn: String,
    pub workspace_id: String,
    pub status: String,
    pub current_stage: Option<String>,
    pub started_at: Option<String>,
}