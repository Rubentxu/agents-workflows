//! Metrics Types for MCP API

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// ============================================================================
// Metrics DTOs
// ============================================================================

/// Metrics response DTO
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct MetricsResponse {
    pub execution_arn: String,
    pub metrics: Vec<StageMetrics>,
    pub total_tokens: i64,
    pub total_duration_ms: i64,
}

/// Stage metrics DTO
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct StageMetrics {
    pub stage_id: String,
    pub status: String,
    pub tokens_used: Option<i64>,
    pub duration_ms: Option<i64>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

/// SSE URL for metrics subscription
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SseUrl {
    pub url: String,
}

// ============================================================================
// Request Parameters
// ============================================================================

/// Parameters for metrics query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsQueryParams {
    pub execution_arn: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
}

/// Parameters for metrics subscription
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MetricsSubscribeParams {
    pub execution_arn: Option<String>,
}