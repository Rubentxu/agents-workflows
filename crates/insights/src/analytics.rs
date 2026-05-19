//! Analytics service for aggregating and analyzing insights data
//!
//! Provides aggregated views of workflow execution insights including
//! token usage totals, duration summaries, quality scores, and insight counts.

use crate::domain::{Insight, InsightType};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Aggregated metrics for an execution
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

/// Aggregated metrics for a specific stage
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

/// Summary of an execution's insight activity
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

impl Insight {
    /// Extract token usage from insight data
    pub fn extract_tokens(&self) -> Option<i64> {
        self.data.get("tokens_used")
            .or_else(|| self.data.get("tokens"))
            .and_then(|v| v.as_i64())
    }

    /// Extract duration from insight data
    pub fn extract_duration_ms(&self) -> Option<i64> {
        self.data.get("duration_ms")
            .or_else(|| self.data.get("duration"))
            .and_then(|v| v.as_i64())
    }

    /// Extract quality score from insight data
    pub fn extract_quality_score(&self) -> Option<f64> {
        self.data.get("quality_score")
            .or_else(|| self.data.get("score"))
            .and_then(|v| v.as_f64())
    }
}

/// Analytics service for aggregating insight data
pub struct AnalyticsService;

impl AnalyticsService {
    /// Create a new analytics service
    pub fn new() -> Self {
        Self
    }

    /// Aggregate insights for an entire execution
    pub fn aggregate_execution(&self, insights: &[Insight]) -> ExecutionAnalytics {
        let mut by_type: HashMap<String, usize> = HashMap::new();
        let mut by_stage: HashMap<String, usize> = HashMap::new();
        let mut total_tokens: Option<i64> = None;
        let mut total_duration_ms: Option<i64> = None;
        let mut quality_scores: Vec<f64> = Vec::new();

        for insight in insights {
            // Count by type
            *by_type.entry(insight.insight_type.as_str().to_string()).or_insert(0) += 1;

            // Count by stage
            if let Some(ref stage_id) = insight.stage_id {
                *by_stage.entry(stage_id.clone()).or_insert(0) += 1;
            }

            // Extract metrics
            if let Some(tokens) = insight.extract_tokens() {
                total_tokens = Some(total_tokens.unwrap_or(0) + tokens);
            }
            if let Some(duration) = insight.extract_duration_ms() {
                total_duration_ms = Some(total_duration_ms.unwrap_or(0) + duration);
            }
            if let Some(score) = insight.extract_quality_score() {
                quality_scores.push(score);
            }
        }

        let avg_quality = if quality_scores.is_empty() {
            None
        } else {
            Some(quality_scores.iter().sum::<f64>() / quality_scores.len() as f64)
        };

        let execution_id = insights.first()
            .map(|i| i.execution_id.clone())
            .unwrap_or_default();

        ExecutionAnalytics {
            execution_id,
            total_insights: insights.len(),
            insights_by_type: by_type,
            insights_by_stage: by_stage,
            total_tokens,
            total_duration_ms,
            avg_quality_score: avg_quality,
        }
    }

    /// Aggregate insights for a specific stage
    pub fn aggregate_stage(&self, insights: &[Insight], stage_id: &str) -> StageAnalytics {
        let stage_insights: Vec<&Insight> = insights.iter()
            .filter(|i| i.stage_id.as_deref() == Some(stage_id))
            .collect();

        let mut by_type: HashMap<String, usize> = HashMap::new();
        let mut total_tokens: Option<i64> = None;
        let mut total_duration_ms: Option<i64> = None;
        let mut quality_scores: Vec<f64> = Vec::new();

        for insight in &stage_insights {
            *by_type.entry(insight.insight_type.as_str().to_string()).or_insert(0) += 1;

            if let Some(tokens) = insight.extract_tokens() {
                total_tokens = Some(total_tokens.unwrap_or(0) + tokens);
            }
            if let Some(duration) = insight.extract_duration_ms() {
                total_duration_ms = Some(total_duration_ms.unwrap_or(0) + duration);
            }
            if let Some(score) = insight.extract_quality_score() {
                quality_scores.push(score);
            }
        }

        let avg_quality = if quality_scores.is_empty() {
            None
        } else {
            Some(quality_scores.iter().sum::<f64>() / quality_scores.len() as f64)
        };

        let execution_id = insights.first()
            .map(|i| i.execution_id.clone())
            .unwrap_or_default();

        StageAnalytics {
            execution_id,
            stage_id: stage_id.to_string(),
            total_insights: stage_insights.len(),
            insights_by_type: by_type,
            total_tokens,
            total_duration_ms,
            avg_quality_score: avg_quality,
        }
    }

    /// Generate an execution insight summary
    pub fn execution_summary(&self, insights: &[Insight]) -> ExecutionInsightSummary {
        let mut workflow_started = false;
        let mut workflow_completed = false;
        let mut workflow_failed = false;
        let mut completed_stages = Vec::new();
        let mut failed_stages = Vec::new();
        let mut skipped_stages = Vec::new();
        let mut total_tokens: Option<i64> = None;
        let mut total_duration_ms: Option<i64> = None;
        let mut last_insight_at: Option<String> = None;

        for insight in insights {
            match insight.insight_type {
                InsightType::WorkflowStarted => workflow_started = true,
                InsightType::WorkflowCompleted => workflow_completed = true,
                InsightType::WorkflowFailed => workflow_failed = true,
                InsightType::StageCompleted => {
                    if let Some(ref stage_id) = insight.stage_id {
                        if !completed_stages.contains(stage_id) {
                            completed_stages.push(stage_id.clone());
                        }
                    }
                }
                InsightType::StageFailed => {
                    if let Some(ref stage_id) = insight.stage_id {
                        if !failed_stages.contains(stage_id) {
                            failed_stages.push(stage_id.clone());
                        }
                    }
                }
                InsightType::StageSkipped => {
                    if let Some(ref stage_id) = insight.stage_id {
                        if !skipped_stages.contains(stage_id) {
                            skipped_stages.push(stage_id.clone());
                        }
                    }
                }
                _ => {}
            }

            if let Some(tokens) = insight.extract_tokens() {
                total_tokens = Some(total_tokens.unwrap_or(0) + tokens);
            }
            if let Some(duration) = insight.extract_duration_ms() {
                total_duration_ms = Some(total_duration_ms.unwrap_or(0) + duration);
            }

            if last_insight_at.is_none() || insight.created_at.to_rfc3339() > last_insight_at.as_ref().unwrap().clone() {
                last_insight_at = Some(insight.created_at.to_rfc3339());
            }
        }

        let execution_id = insights.first()
            .map(|i| i.execution_id.clone())
            .unwrap_or_default();

        let stage_count = completed_stages.len() + failed_stages.len() + skipped_stages.len();

        ExecutionInsightSummary {
            execution_id,
            workflow_started,
            workflow_completed,
            workflow_failed,
            stage_count,
            completed_stages,
            failed_stages,
            skipped_stages,
            total_token_usage: total_tokens,
            total_duration_ms,
            last_insight_at,
        }
    }
}

impl Default for AnalyticsService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn create_test_insight(
        execution_id: &str,
        stage_id: Option<&str>,
        insight_type: InsightType,
        tokens: Option<i64>,
        duration_ms: Option<i64>,
    ) -> Insight {
        let mut data = serde_json::json!({});
        if let Some(t) = tokens {
            data["tokens_used"] = serde_json::json!(t);
        }
        if let Some(d) = duration_ms {
            data["duration_ms"] = serde_json::json!(d);
        }

        Insight {
            id: None,
            execution_id: execution_id.to_string(),
            stage_id: stage_id.map(String::from),
            insight_type,
            data,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn test_aggregate_execution() {
        let insights = vec![
            create_test_insight("exec-1", Some("stage-1"), InsightType::StageStarted, None, None),
            create_test_insight("exec-1", Some("stage-1"), InsightType::StageCompleted, Some(1000), Some(5000)),
            create_test_insight("exec-1", Some("stage-2"), InsightType::StageStarted, None, None),
            create_test_insight("exec-1", Some("stage-2"), InsightType::StageCompleted, Some(2000), Some(8000)),
        ];

        let service = AnalyticsService::new();
        let result = service.aggregate_execution(&insights);

        assert_eq!(result.execution_id, "exec-1");
        assert_eq!(result.total_insights, 4);
        assert_eq!(result.insights_by_stage.get("stage-1"), Some(&2));
        assert_eq!(result.insights_by_stage.get("stage-2"), Some(&2));
        assert_eq!(result.total_tokens, Some(3000));
        assert_eq!(result.total_duration_ms, Some(13000));
    }

    #[test]
    fn test_execution_summary() {
        let insights = vec![
            create_test_insight("exec-1", None, InsightType::WorkflowStarted, None, None),
            create_test_insight("exec-1", Some("stage-1"), InsightType::StageCompleted, Some(1000), Some(5000)),
            create_test_insight("exec-1", Some("stage-2"), InsightType::StageFailed, None, Some(3000)),
            create_test_insight("exec-1", None, InsightType::WorkflowFailed, None, None),
        ];

        let service = AnalyticsService::new();
        let result = service.execution_summary(&insights);

        assert!(result.workflow_started);
        assert!(!result.workflow_completed);
        assert!(result.workflow_failed);
        assert_eq!(result.completed_stages, vec!["stage-1"]);
        assert_eq!(result.failed_stages, vec!["stage-2"]);
        assert_eq!(result.total_token_usage, Some(1000));
        assert_eq!(result.total_duration_ms, Some(8000));
    }
}
