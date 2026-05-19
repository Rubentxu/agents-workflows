//! REST API Request/Response DTOs
//!
//! Data transfer objects for REST API endpoints.

use serde::{Deserialize, Serialize};

fn default_global_scope() -> String {
    "global".to_string()
}

// ============================================================================
// Workspace DTOs
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateWorkspaceRequest {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceResponse {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub stats: Option<WorkspaceStats>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceStats {
    pub executions_count: i64,
    pub artifacts_count: i64,
    pub last_execution: Option<String>,
}

// ============================================================================
// Workflow DTOs
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateWorkflowRequest {
    pub scope: String,
    pub name: String,
    pub description: Option<String>,
    pub stages: Vec<StageRequest>,
    pub execution: ExecutionConfigRequest,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StageRequest {
    pub id: String,
    pub agent: String,
    pub depends_on: Vec<String>,
    pub input: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecutionConfigRequest {
    pub mode: String,
    pub on_failure: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateWorkflowRequest {
    pub description: Option<String>,
    pub stages: Option<Vec<StageRequest>>,
    pub execution: Option<ExecutionConfigRequest>,
}

// ============================================================================
// Agent DTOs
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateAgentRequest {
    pub scope: String,
    pub name: String,
    pub description: Option<String>,
    pub model: String,
    pub skills: Vec<String>,
    pub tools: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateAgentRequest {
    pub description: Option<String>,
    pub model: Option<String>,
    pub skills: Option<Vec<String>>,
    pub tools: Option<Vec<String>>,
}

// ============================================================================
// Skill DTOs
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSkillRequest {
    pub name: String,
    pub description: String,
    pub content: String,
    pub triggers: Vec<String>,
    #[serde(default = "default_global_scope")]
    pub scope: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSkillRequest {
    pub description: Option<String>,
    pub content: Option<String>,
    pub triggers: Option<Vec<String>>,
}

// ============================================================================
// Prompt DTOs
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePromptRequest {
    pub name: String,
    pub description: Option<String>,
    pub content: String,
    #[serde(default = "default_global_scope")]
    pub scope: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdatePromptRequest {
    pub description: Option<String>,
    pub content: Option<String>,
}

// ============================================================================
// Execution DTOs
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ExecutionListQuery {
    pub workspace_id: Option<String>,
    pub workflow_arn: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ============================================================================
// Insight DTOs
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct InsightsQuery {
    pub execution_arn: Option<String>,
    pub stage_id: Option<String>,
    pub insight_type: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
}

// ============================================================================
// Metrics DTOs
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct MetricsQuery {
    pub execution_arn: Option<String>,
    pub stage_id: Option<String>,
}

// ============================================================================
// Config DTOs
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigResponse {
    pub default_workflow: String,
    pub max_concurrent_executions: i64,
    pub artifact_size_threshold_bytes: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateConfigRequest {
    pub default_workflow: Option<String>,
    pub max_concurrent_executions: Option<i64>,
}

// ============================================================================
// Error Response
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: ErrorDetail,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorDetail {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl ErrorResponse {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            error: ErrorDetail {
                code: code.to_string(),
                message: message.to_string(),
                details: None,
            },
        }
    }

    #[allow(dead_code)]
    pub fn with_details(code: &str, message: &str, details: serde_json::Value) -> Self {
        Self {
            error: ErrorDetail {
                code: code.to_string(),
                message: message.to_string(),
                details: Some(details),
            },
        }
    }
}

// Alerts types
#[derive(Debug, Serialize, Deserialize)]
pub struct AlertListQuery {
    pub state: Option<String>,
    pub severity: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateAlertRequest {
    pub message: String,
    pub severity: String,
    pub source: Option<String>,
    pub workspace_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateAlertRequest {
    pub state: Option<String>,
}
