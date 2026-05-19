//! State Machine Errors
//!
//! Error types for the execution state machine.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum StateMachineError {
    #[error("Invalid state transition from {from} to {to}: {reason}")]
    InvalidTransition { from: String, to: String, reason: String },

    #[error("Stage not found: {0}")]
    StageNotFound(String),

    #[error("Execution not found: {0}")]
    ExecutionNotFound(String),

    #[error("Workflow not found: {0}")]
    WorkflowNotFound(String),

    #[error("Invalid ARN format: {0}")]
    InvalidArn(String),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("JSON error: {0}")]
    JsonError(String),
}
