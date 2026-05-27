//! Workflow Types for MCP API
//!
//! These types are DTOs at the MCP/presentation boundary.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Workflow DTOs
// ============================================================================

/// Workflow summary for list operations
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WorkflowSummary {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
    pub stage_count: usize,
}

/// Workflow definition DTO - presentation layer representation
/// Renamed from Workflow to WorkflowDto to avoid confusion with domain Workflow
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WorkflowDto {
    pub arn: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub scope: String,
    #[serde(alias = "stages", default)]
    pub stages: HashMap<String, StageDto>,
    #[serde(default)]
    pub execution: Option<ExecutionConfig>,
}

/// Stage DTO - presentation layer representation
/// Renamed from Stage to StageDto to avoid confusion with domain Stage
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StageDto {
    #[serde(alias = "id")]
    pub id: Option<String>,
    pub agent: String,
    #[serde(alias = "dependsOn", default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub input: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub output: Option<StageOutputDto>,
    #[serde(default)]
    pub execution: Option<StageExecution>,
    #[serde(default)]
    pub conditions: Vec<Condition>,
}

/// Stage output DTO - presentation layer representation
/// Renamed from StageOutput to StageOutputDto to avoid confusion with domain StageOutput
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StageOutputDto {
    pub artifacts: Vec<ArtifactRef>,
}

/// Artifact reference in stage output
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ArtifactRef {
    pub name: String,
    pub path_template: String,
}

/// Stage execution configuration
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StageExecution {
    pub mode: String,
    pub retry: RetryConfig,
}

/// Retry configuration for stage execution
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct RetryConfig {
    pub max_attempts: usize,
    pub backoff_ms: u64,
}

/// Condition for stage execution
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Condition {
    pub when: String,
    pub operator: String,
    pub value: serde_json::Value,
}

/// Execution configuration for workflow
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ExecutionConfig {
    pub mode: String,
    #[serde(alias = "onFailure")]
    pub on_failure: String,
}

// ============================================================================
// DAG Types (for workflow_get_dag)
// ============================================================================

/// DAG representation of workflow stages
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Dag {
    pub nodes: Vec<DagNode>,
    pub edges: Vec<DagEdge>,
    pub parallel_groups: Vec<Vec<String>>,
}

/// Node in the DAG
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DagNode {
    pub id: String,
    pub stage: String,
    pub depends_on: Vec<String>,
}

/// Edge in the DAG (dependency)
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DagEdge {
    pub from: String,
    pub to: String,
}

// ============================================================================
// Backwards Compatibility Aliases
// ============================================================================

/// Alias for backwards compatibility - prefer WorkflowDto
#[deprecated(since = "2.0.0", note = "Use WorkflowDto instead to avoid domain confusion")]
pub type Workflow = WorkflowDto;

/// Alias for backwards compatibility - prefer StageDto
#[deprecated(since = "2.0.0", note = "Use StageDto instead to avoid domain confusion")]
pub type Stage = StageDto;

/// Alias for backwards compatibility - prefer StageOutputDto
#[deprecated(since = "2.0.0", note = "Use StageOutputDto instead to avoid domain confusion")]
pub type StageOutput = StageOutputDto;
