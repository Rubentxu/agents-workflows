//! MCP API Type Definitions
//!
//! Request/Response types for all MCP tools following the ARN format:
//! arn:local:{scope}:{type}/{name}

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Workflow Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowSummary {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
    pub stage_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub arn: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub scope: String,
    #[serde(alias = "stages", default)]
    pub stages: HashMap<String, Stage>,
    #[serde(default)]
    pub execution: Option<ExecutionConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stage {
    #[serde(alias = "id")]
    pub id: Option<String>,
    pub agent: String,
    #[serde(alias = "dependsOn")]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub input: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub output: Option<StageOutput>,
    #[serde(default)]
    pub execution: Option<StageExecution>,
    #[serde(default)]
    pub conditions: Vec<Condition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageOutput {
    pub artifacts: Vec<ArtifactRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactRef {
    pub name: String,
    pub path_template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageExecution {
    pub mode: String,
    pub retry: RetryConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryConfig {
    pub max_attempts: usize,
    pub backoff_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Condition {
    pub when: String,
    pub operator: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionConfig {
    pub mode: String,
    #[serde(alias = "onFailure")]
    pub on_failure: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dag {
    pub nodes: Vec<DagNode>,
    pub edges: Vec<DagEdge>,
    pub parallel_groups: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DagNode {
    pub id: String,
    pub stage: String,
    pub depends_on: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DagEdge {
    pub from: String,
    pub to: String,
}

// ============================================================================
// Agent Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSummary {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
    pub model: String,
    pub skills: Vec<String>,
    pub tools: Vec<String>,
}

// ============================================================================
// Skill Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillSummary {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
    pub content: String,
    pub triggers: Vec<String>,
}

// ============================================================================
// Prompt Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptSummary {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prompt {
    pub arn: String,
    pub name: String,
    pub description: String,
    pub scope: String,
    pub content: String,
}

// ============================================================================
// Execution Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionSummary {
    pub arn: String,
    pub workflow_arn: String,
    pub workspace_id: String,
    pub status: String,
    pub current_stage: Option<String>,
    pub started_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Execution {
    pub arn: String,
    pub workflow_arn: String,
    pub workspace_id: String,
    pub status: String,
    pub current_stage: Option<String>,
    pub completed_stages: Vec<String>,
    pub pending_stages: Vec<String>,
    pub stage_outputs: HashMap<String, serde_json::Value>,
    pub triggered_by: TriggerInfo,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerInfo {
    #[serde(rename = "type")]
    pub trigger_type: String,
    pub input: serde_json::Value,
}

impl Default for TriggerInfo {
    fn default() -> Self {
        Self {
            trigger_type: "manual".to_string(),
            input: serde_json::Value::Null,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionState {
    pub execution_arn: String,
    pub workflow_arn: String,
    pub status: String,
    pub current_stage: String,
    pub completed_stages: Vec<String>,
    pub pending_stages: Vec<String>,
    pub stage_outputs: HashMap<String, StageOutput>,
    pub execution_context: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextStage {
    pub suggested_stage: String,
    pub conditions_met: bool,
    pub alternatives: Vec<StageAlternative>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageAlternative {
    pub stage: String,
    pub condition: String,
}

// ============================================================================
// Artifact Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactSummary {
    pub arn: String,
    pub execution_arn: String,
    pub stage_id: Option<String>,
    pub name: String,
    pub size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub arn: String,
    pub execution_arn: String,
    pub stage_id: Option<String>,
    pub name: String,
    pub content: String,
    pub content_type: String,
    pub size: i64,
}

// ============================================================================
// Insight Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Insight {
    pub id: i64,
    pub execution_arn: String,
    pub stage_id: Option<String>,
    pub insight_type: String,
    pub data: serde_json::Value,
    pub created_at: String,
}

// ============================================================================
// Analytics Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionAnalytics {
    pub execution_id: String,
    pub total_insights: usize,
    pub insights_by_type: std::collections::HashMap<String, usize>,
    pub insights_by_stage: std::collections::HashMap<String, usize>,
    pub total_tokens: Option<i64>,
    pub total_duration_ms: Option<i64>,
    pub avg_quality_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageAnalytics {
    pub execution_id: String,
    pub stage_id: String,
    pub total_insights: usize,
    pub insights_by_type: std::collections::HashMap<String, usize>,
    pub total_tokens: Option<i64>,
    pub total_duration_ms: Option<i64>,
    pub avg_quality_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionInsightSummary {
    pub execution_id: String,
    pub workflow_started: bool,
    pub workflow_completed: bool,
    pub workflow_failed: bool,
    pub stage_count: usize,
    pub completed_stages: Vec<String>,
    pub failed_stages: Vec<String>,
    pub skipped_stages: Vec<String>,
    pub total_token_usage: Option<i64>,
    pub total_duration_ms: Option<i64>,
    pub last_insight_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightsAggregateParams {
    pub execution_arn: String,
    pub stage_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum InsightsAggregateResult {
    Execution {
        analytics: ExecutionAnalytics,
        summary: ExecutionInsightSummary,
    },
    Stage {
        analytics: StageAnalytics,
    },
}

// ============================================================================
// Metrics Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsResponse {
    pub execution_arn: String,
    pub metrics: Vec<StageMetrics>,
    pub total_tokens: i64,
    pub total_duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageMetrics {
    pub stage_id: String,
    pub status: String,
    pub tokens_used: Option<i64>,
    pub duration_ms: Option<i64>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseUrl {
    pub url: String,
}

// ============================================================================
// Request Parameters
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ListParams {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetByArnParams {
    pub arn: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowExecuteParams {
    pub workflow_arn: String,
    pub workspace_id: String,
    pub input: Option<HashMap<String, serde_json::Value>>,
    pub trigger_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowGetStateParams {
    pub execution_arn: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowUpdateStateParams {
    pub execution_arn: String,
    pub status: Option<String>,
    pub current_stage: Option<String>,
    pub completed_stages: Option<Vec<String>>,
    pub pending_stages: Option<Vec<String>>,
    pub stage_outputs: Option<HashMap<String, StageOutput>>,
    pub execution_context: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowGetNextStageParams {
    pub execution_arn: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowAbortParams {
    pub execution_arn: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentQueryParams {
    pub query: String,
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillQueryParams {
    pub query: String,
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExecutionListParams {
    pub workflow_arn: Option<String>,
    pub workspace_id: Option<String>,
    pub status: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionHistoryParams {
    pub execution_arn: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactCreateParams {
    pub execution_arn: String,
    pub stage_id: Option<String>,
    pub name: String,
    pub content: String,
    pub content_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ArtifactListParams {
    pub execution_arn: Option<String>,
    pub stage_id: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightsLogParams {
    pub execution_arn: String,
    pub stage_id: Option<String>,
    pub insight_type: String,
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InsightsQueryParams {
    pub execution_arn: Option<String>,
    pub stage_id: Option<String>,
    pub insight_type: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsQueryParams {
    pub execution_arn: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MetricsSubscribeParams {
    pub execution_arn: Option<String>,
}

// ============================================================================
// Impact Analysis Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImpactItem {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub arn: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentExecution {
    pub id: String,
    pub status: String,
    #[serde(rename = "workspaceId")]
    pub workspace_id: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImpactData {
    #[serde(rename = "resourceArn")]
    pub resource_arn: String,
    #[serde(rename = "resourceName")]
    pub resource_name: String,
    #[serde(rename = "resourceKind")]
    pub resource_kind: String,
    pub severity: String,
    pub dependents: Vec<ImpactItem>,
    #[serde(rename = "affectedWorkspaces")]
    pub affected_workspaces: Vec<String>,
    #[serde(rename = "recentExecutions")]
    pub recent_executions: Vec<RecentExecution>,
    #[serde(rename = "derivedOverrides")]
    pub derived_overrides: Vec<ImpactItem>,
    #[serde(rename = "policyEffects")]
    pub policy_effects: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyzeImpactParams {
    pub arn: String,
    pub kind: String,
}
