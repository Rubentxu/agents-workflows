//! Insight and Analytics Types for MCP API

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Insight DTOs
// ============================================================================

/// Insight record DTO
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightDto {
    pub id: i64,
    pub execution_arn: String,
    pub stage_id: Option<String>,
    pub insight_type: String,
    pub data: serde_json::Value,
    pub created_at: String,
}

/// Backwards compatibility alias
#[deprecated(since = "2.0.0", note = "Use InsightDto instead")]
pub type Insight = InsightDto;

// ============================================================================
// Analytics DTOs
// ============================================================================

/// Execution analytics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionAnalytics {
    pub execution_id: String,
    pub total_insights: usize,
    pub insights_by_type: HashMap<String, usize>,
    pub insights_by_stage: HashMap<String, usize>,
    pub total_tokens: Option<i64>,
    pub total_duration_ms: Option<i64>,
    pub avg_quality_score: Option<f64>,
}

/// Stage analytics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageAnalytics {
    pub execution_id: String,
    pub stage_id: String,
    pub total_insights: usize,
    pub insights_by_type: HashMap<String, usize>,
    pub total_tokens: Option<i64>,
    pub total_duration_ms: Option<i64>,
    pub avg_quality_score: Option<f64>,
}

/// Execution insight summary
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

/// Parameters for insights aggregation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightsAggregateParams {
    pub execution_arn: String,
    pub stage_id: Option<String>,
}

/// Result of insights aggregation
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
// Request Parameters
// ============================================================================

/// Parameters for logging an insight
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightsLogParams {
    pub execution_arn: String,
    pub stage_id: Option<String>,
    pub insight_type: String,
    pub data: serde_json::Value,
}

/// Parameters for insights query
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct InsightsQueryParams {
    pub execution_arn: Option<String>,
    pub stage_id: Option<String>,
    pub insight_type: Option<String>,
    pub limit: Option<usize>,
}