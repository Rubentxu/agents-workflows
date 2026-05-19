//! Workflow Domain Errors

use thiserror::Error;

#[derive(Error, Debug)]
pub enum WorkflowError {
    #[error("Workflow not found: {0}")]
    WorkflowNotFound(String),

    #[error("Stage not found: {0}")]
    StageNotFound(String),

    #[error("Circular dependency detected: {0}")]
    CircularDependency(String),

    #[error("Invalid stage configuration: {0}")]
    InvalidStageConfig(String),

    #[error("Execution failed: {0}")]
    ExecutionFailed(String),

    #[error("Condition evaluation failed: {0}")]
    ConditionFailed(String),
}

pub type WorkflowResult<T> = Result<T, WorkflowError>;
