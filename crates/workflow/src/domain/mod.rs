//! Workflow Domain Layer

pub mod workflow;
pub mod stage;
pub mod execution_config;
pub mod errors;
pub mod execution_state;
pub mod execution_repository;
pub mod state_errors;

// Explicit re-exports to avoid ambiguity with StageOutput
pub use workflow::{Workflow, AgentDefinition, SkillReference, MetricsConfig};
pub use stage::{Stage, StageOutput, InputValue, ArtifactRef, StageExecution,
    ExecutionMode, RetryConfig, Condition, ConditionOperator, StageContext};
pub use execution_config::{ExecutionConfig, WorkflowExecutionMode, FailureStrategy, IncrementalConfig};
pub use errors::{WorkflowError, WorkflowResult};
pub use execution_state::{
    ExecutionStatus, StageStatus, TriggerInfo, StageOutput as ExecStageOutput,
    StageMetrics, ExecutionState, StateError
};
pub use execution_repository::{ExecutionRepository, ExecutionSummary};
pub use state_errors::StateMachineError;
