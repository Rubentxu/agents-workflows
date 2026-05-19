//! Execution Configuration

use serde::{Deserialize, Serialize};

/// Global execution configuration for a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionConfig {
    pub mode: WorkflowExecutionMode,
    pub parallel_stages: Vec<Vec<String>>,  // Groups of stages that can run in parallel
    pub on_failure: FailureStrategy,
    pub incremental: IncrementalConfig,
}

impl Default for ExecutionConfig {
    fn default() -> Self {
        Self {
            mode: WorkflowExecutionMode::Sequential,
            parallel_stages: Vec::new(),
            on_failure: FailureStrategy::Interactive,
            incremental: IncrementalConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowExecutionMode {
    Sequential,
    Parallel,
    Hybrid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FailureStrategy {
    Stop,
    Continue,
    Interactive,
    Retry,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncrementalConfig {
    pub enabled: bool,
    pub cache_dir: String,
    pub skip_if_outputs_valid: bool,
}

impl Default for IncrementalConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            cache_dir: ".workflow-cache".to_string(),
            skip_if_outputs_valid: true,
        }
    }
}
