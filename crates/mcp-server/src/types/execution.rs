//! Execution Types for MCP API
//!
//! These types are DTOs at the MCP/presentation boundary.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::workflow_dto::StageOutputDto;

// ============================================================================
// Execution DTOs
// ============================================================================

/// Execution summary for list operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionSummary {
    pub arn: String,
    pub workflow_arn: String,
    pub workspace_id: String,
    pub status: String,
    pub current_stage: Option<String>,
    pub started_at: Option<String>,
}

/// Execution DTO - presentation layer representation
/// Note: This is a flat representation used in API responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionDto {
    pub arn: String,
    pub workflow_arn: String,
    pub workspace_id: String,
    pub status: String,
    pub current_stage: Option<String>,
    pub completed_stages: Vec<String>,
    pub pending_stages: Vec<String>,
    pub stage_outputs: HashMap<String, serde_json::Value>,
    pub triggered_by: TriggerInfoDto,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

/// Trigger info DTO - presentation layer representation
/// Renamed from TriggerInfo to TriggerInfoDto to avoid confusion with domain TriggerInfo
/// This type includes the `source` field which was previously missing in the MCP layer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerInfoDto {
    #[serde(rename = "type")]
    pub trigger_type: String,
    /// Source of the trigger (e.g., "cli", "api", "webhook")
    /// This field was added to fix the domain leak where source was hardcoded to None
    #[serde(default)]
    pub source: Option<String>,
    pub input: serde_json::Value,
}

impl Default for TriggerInfoDto {
    fn default() -> Self {
        Self {
            trigger_type: "manual".to_string(),
            source: None,
            input: serde_json::Value::Null,
        }
    }
}

/// Execution state DTO - presentation layer representation
/// Renamed from ExecutionState to ExecutionStateDto to avoid confusion with domain ExecutionState
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionStateDto {
    pub execution_arn: String,
    pub workflow_arn: String,
    pub status: String,
    pub current_stage: String,
    pub completed_stages: Vec<String>,
    pub pending_stages: Vec<String>,
    pub stage_outputs: HashMap<String, StageOutputDto>,
    pub execution_context: serde_json::Value,
}

/// Next stage suggestion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextStage {
    pub suggested_stage: String,
    pub conditions_met: bool,
    pub alternatives: Vec<StageAlternative>,
}

/// Alternative stage suggestion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageAlternative {
    pub stage: String,
    pub condition: String,
}

// ============================================================================
// Command DTOs (for handler input)
// ============================================================================

/// Command to start a new execution
/// This is an input DTO that handler uses instead of domain types
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartExecutionCommand {
    pub workflow_arn: String,
    pub workspace_id: String,
    pub trigger_type: Option<String>,
    /// Source of the trigger - previously missing, now properly captured
    pub source: Option<String>,
    pub input: Option<HashMap<String, serde_json::Value>>,
}

/// Command to update execution state
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateExecutionStateCommand {
    pub execution_arn: String,
    pub status: Option<String>,
    pub current_stage: Option<String>,
    pub completed_stages: Option<Vec<String>>,
    pub pending_stages: Option<Vec<String>>,
    pub stage_outputs: Option<HashMap<String, StageOutputDto>>,
    pub execution_context: Option<serde_json::Value>,
}

// ============================================================================
// Request Parameters
// ============================================================================

/// Parameters for workflow execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowExecuteParams {
    pub workflow_arn: String,
    pub workspace_id: String,
    pub input: Option<HashMap<String, serde_json::Value>>,
    pub trigger_type: Option<String>,
    /// Source of the trigger - added to fix domain leak
    pub source: Option<String>,
}

/// Parameters for getting execution state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowGetStateParams {
    pub execution_arn: String,
}

/// Parameters for updating execution state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowUpdateStateParams {
    pub execution_arn: String,
    pub status: Option<String>,
    pub current_stage: Option<String>,
    pub completed_stages: Option<Vec<String>>,
    pub pending_stages: Option<Vec<String>>,
    pub stage_outputs: Option<HashMap<String, StageOutputDto>>,
    pub execution_context: Option<serde_json::Value>,
}

/// Parameters for getting next stage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowGetNextStageParams {
    pub execution_arn: String,
}

/// Parameters for aborting execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowAbortParams {
    pub execution_arn: String,
}

/// List parameters for execution queries
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExecutionListParams {
    pub workflow_arn: Option<String>,
    pub workspace_id: Option<String>,
    pub status: Option<String>,
    pub limit: Option<usize>,
}

/// Parameters for execution history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionHistoryParams {
    pub execution_arn: String,
    pub limit: Option<usize>,
}

// ============================================================================
// Backwards Compatibility Aliases
// ============================================================================

/// Alias for backwards compatibility - prefer ExecutionDto
#[deprecated(since = "2.0.0", note = "Use ExecutionDto instead to avoid domain confusion")]
pub type Execution = ExecutionDto;

/// Alias for backwards compatibility - prefer ExecutionStateDto
#[deprecated(since = "2.0.0", note = "Use ExecutionStateDto instead to avoid domain confusion")]
pub type ExecutionState = ExecutionStateDto;

/// Alias for backwards compatibility - prefer TriggerInfoDto
#[deprecated(since = "2.0.0", note = "Use TriggerInfoDto instead to avoid domain confusion")]
pub type TriggerInfo = TriggerInfoDto;