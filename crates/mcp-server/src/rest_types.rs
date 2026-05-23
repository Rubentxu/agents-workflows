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
// Agent DTOs — ADR-0010: superset of opencode AgentConfig
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateAgentRequest {
    pub scope: String,
    pub name: String,
    pub description: String,
    /// Model in provider/model-id format (e.g. "anthropic/claude-sonnet-4-20250514")
    pub model: String,
    /// ARN of the Prompt resource for system instructions (single reference)
    pub prompt: Option<String>,
    /// ARN references to Skill resources
    #[serde(default)]
    pub skills: Vec<String>,
    /// Tool enable/disable map — tool name → enabled
    #[serde(default)]
    pub tools: std::collections::HashMap<String, bool>,
    /// Granular permission config (glob patterns, ask/allow/deny)
    pub permission: Option<serde_json::Value>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    /// Max agentic iterations before forcing text-only response
    pub steps: Option<u32>,
    /// primary | subagent | all
    #[serde(default = "default_agent_mode")]
    pub mode: String,
    /// Hide from autocomplete (subagent only)
    #[serde(default)]
    pub hidden: bool,
    /// Visual color: hex (#FF5733) or theme color (primary, secondary, etc.)
    pub color: Option<String>,
    /// Model variant
    pub variant: Option<String>,
    /// Arbitrary passthrough to provider as model options
    pub options: Option<serde_json::Value>,
}

fn default_agent_mode() -> String {
    "all".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateAgentRequest {
    pub description: Option<String>,
    pub model: Option<String>,
    pub prompt: Option<String>,
    pub skills: Option<Vec<String>>,
    pub tools: Option<std::collections::HashMap<String, bool>>,
    pub permission: Option<serde_json::Value>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub steps: Option<u32>,
    pub mode: Option<String>,
    pub hidden: Option<bool>,
    pub color: Option<String>,
    pub variant: Option<String>,
    pub options: Option<serde_json::Value>,
}

// ============================================================================
// Skill DTOs — ADR-0011: content_path + required_tools + references
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSkillRequest {
    pub name: String,
    pub description: String,
    /// Path to SKILL.md file (relative to registry root)
    pub content_path: Option<String>,
    /// Legacy inline content (deprecated, prefer content_path)
    pub content: Option<String>,
    #[serde(default)]
    pub triggers: Vec<String>,
    #[serde(default = "default_global_scope")]
    pub scope: String,
    pub version: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    /// ARN references to other skills (shared modules)
    #[serde(default)]
    pub references: Vec<String>,
    /// Tool names this skill requires — agents must merge these into their tools
    #[serde(default)]
    pub required_tools: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSkillRequest {
    pub description: Option<String>,
    pub content_path: Option<String>,
    pub content: Option<String>,
    pub triggers: Option<Vec<String>>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub references: Option<Vec<String>>,
    pub required_tools: Option<Vec<String>>,
}

// ============================================================================
// Prompt DTOs — ADR-0012: prompt-as-function with typed I/O
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePromptRequest {
    pub name: String,
    pub description: String,
    /// Path to prompt body file with {{variable}} placeholders
    pub content_path: Option<String>,
    /// Legacy inline content (deprecated, prefer content_path)
    pub content: Option<String>,
    #[serde(default = "default_global_scope")]
    pub scope: String,
    /// Prompt classification: system | user | template
    #[serde(default = "default_prompt_kind")]
    pub kind: Option<String>,
    /// ARN of Template resource for output format
    pub template: Option<String>,
}

fn default_prompt_kind() -> Option<String> {
    Some("system".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdatePromptRequest {
    pub description: Option<String>,
    pub content_path: Option<String>,
    pub content: Option<String>,
    pub kind: Option<String>,
    pub template: Option<String>,
}

// ============================================================================
// Template DTOs — ADR-0013: native format files with frontmatter
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTemplateRequest {
    pub name: String,
    pub description: String,
    /// Path to template file in native format (markdown, json, yaml, text)
    pub content_path: String,
    /// Output format: markdown | json | yaml | text
    pub format: String,
    /// What resource type uses this template: prompt | agent | skill | tool | any
    #[serde(default = "default_target_kind")]
    pub target_kind: Option<String>,
    #[serde(default = "default_global_scope")]
    pub scope: String,
}

fn default_target_kind() -> Option<String> {
    Some("any".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateTemplateRequest {
    pub description: Option<String>,
    pub content_path: Option<String>,
    pub format: Option<String>,
    pub target_kind: Option<String>,
}

// ============================================================================
// Tool DTOs — ADR-0014: MCP catalog + builtin + custom
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateToolRequest {
    pub name: String,
    pub description: String,
    /// Tool origin: mcp://{server} | builtin://{name} | custom://{name}
    pub source: String,
    /// mcp | builtin | custom
    pub source_type: String,
    /// JSON Schema describing input parameters
    pub input_schema: Option<serde_json::Value>,
    /// JSON Schema describing output (optional)
    pub output_schema: Option<serde_json::Value>,
    /// Catalog grouping category
    #[serde(default = "default_tool_category")]
    pub category: Option<String>,
    /// Search/filter labels
    #[serde(default)]
    pub tags: Vec<String>,
    /// Path to implementation script (custom tools only)
    pub implementation_path: Option<String>,
    /// Runtime for custom tools: bash | node | python
    pub runtime: Option<String>,
    #[serde(default = "default_global_scope")]
    pub scope: String,
}

fn default_tool_category() -> Option<String> {
    Some("custom".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateToolRequest {
    pub description: Option<String>,
    pub input_schema: Option<serde_json::Value>,
    pub output_schema: Option<serde_json::Value>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub implementation_path: Option<String>,
    pub runtime: Option<String>,
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
