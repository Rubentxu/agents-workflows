//! Insight entity and insight types
//!
//! Insights are structured log events capturing workflow execution behavior,
//! stage transitions, agent outputs, and metrics.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Insight entity - structured event log for workflow behavior analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Insight {
    /// Optional database ID
    pub id: Option<i64>,
    /// Execution ARN this insight belongs to
    pub execution_id: String,
    /// Optional stage ID if this insight is stage-specific
    pub stage_id: Option<String>,
    /// Type of insight
    pub insight_type: InsightType,
    /// Structured data payload
    pub data: serde_json::Value,
    /// When the insight was created
    pub created_at: DateTime<Utc>,
}

impl Insight {
    /// Create a new insight with current timestamp
    pub fn new(
        execution_id: String,
        insight_type: InsightType,
        data: serde_json::Value,
    ) -> Self {
        Self {
            id: None,
            execution_id,
            stage_id: None,
            insight_type,
            data,
            created_at: Utc::now(),
        }
    }

    /// Create a stage-specific insight
    pub fn for_stage(
        execution_id: String,
        stage_id: String,
        insight_type: InsightType,
        data: serde_json::Value,
    ) -> Self {
        Self {
            id: None,
            execution_id,
            stage_id: Some(stage_id),
            insight_type,
            data,
            created_at: Utc::now(),
        }
    }

    /// Set the database ID (used after persistence)
    pub fn with_id(mut self, id: i64) -> Self {
        self.id = Some(id);
        self
    }
}

/// Types of insights for workflow behavior analysis
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum InsightType {
    // Workflow-level insights
    WorkflowStarted,
    WorkflowCompleted,
    WorkflowFailed,

    // Stage-level insights
    StageStarted,
    StageCompleted,
    StageFailed,
    StageSkipped,
    ConditionEvaluated,

    // Agent insights
    AgentOutput,
    AgentError,

    // Metrics insights
    MetricsTokenUsage,
    MetricsDuration,
    MetricsQualityScore,
}

impl InsightType {
    /// Convert to string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            InsightType::WorkflowStarted => "workflow_started",
            InsightType::WorkflowCompleted => "workflow_completed",
            InsightType::WorkflowFailed => "workflow_failed",
            InsightType::StageStarted => "stage_started",
            InsightType::StageCompleted => "stage_completed",
            InsightType::StageFailed => "stage_failed",
            InsightType::StageSkipped => "stage_skipped",
            InsightType::ConditionEvaluated => "condition_evaluated",
            InsightType::AgentOutput => "agent_output",
            InsightType::AgentError => "agent_error",
            InsightType::MetricsTokenUsage => "metrics_token_usage",
            InsightType::MetricsDuration => "metrics_duration",
            InsightType::MetricsQualityScore => "metrics_quality_score",
        }
    }

    /// Parse from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "workflow_started" => Some(InsightType::WorkflowStarted),
            "workflow_completed" => Some(InsightType::WorkflowCompleted),
            "workflow_failed" => Some(InsightType::WorkflowFailed),
            "stage_started" => Some(InsightType::StageStarted),
            "stage_completed" => Some(InsightType::StageCompleted),
            "stage_failed" => Some(InsightType::StageFailed),
            "stage_skipped" => Some(InsightType::StageSkipped),
            "condition_evaluated" => Some(InsightType::ConditionEvaluated),
            "agent_output" => Some(InsightType::AgentOutput),
            "agent_error" => Some(InsightType::AgentError),
            "metrics_token_usage" => Some(InsightType::MetricsTokenUsage),
            "metrics_duration" => Some(InsightType::MetricsDuration),
            "metrics_quality_score" => Some(InsightType::MetricsQualityScore),
            _ => None,
        }
    }
}

impl std::fmt::Display for InsightType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_insight_type_as_str() {
        assert_eq!(InsightType::WorkflowStarted.as_str(), "workflow_started");
        assert_eq!(InsightType::StageCompleted.as_str(), "stage_completed");
        assert_eq!(InsightType::AgentOutput.as_str(), "agent_output");
    }

    #[test]
    fn test_insight_type_from_str() {
        assert_eq!(
            InsightType::from_str("workflow_started"),
            Some(InsightType::WorkflowStarted)
        );
        assert_eq!(
            InsightType::from_str("stage_completed"),
            Some(InsightType::StageCompleted)
        );
        assert_eq!(InsightType::from_str("invalid"), None);
    }

    #[test]
    fn test_insight_new() {
        let insight = Insight::new(
            "exec-001".to_string(),
            InsightType::WorkflowStarted,
            serde_json::json!({"timestamp": "2025-01-01T00:00:00Z"}),
        );
        assert!(insight.id.is_none());
        assert_eq!(insight.execution_id, "exec-001");
        assert!(insight.stage_id.is_none());
        assert!(insight.created_at <= Utc::now());
    }

    #[test]
    fn test_insight_for_stage() {
        let insight = Insight::for_stage(
            "exec-001".to_string(),
            "stage-1".to_string(),
            InsightType::StageStarted,
            serde_json::json!({"agent": "test-agent"}),
        );
        assert!(insight.id.is_none());
        assert_eq!(insight.execution_id, "exec-001");
        assert_eq!(insight.stage_id, Some("stage-1".to_string()));
    }

    #[test]
    fn test_insight_with_id() {
        let insight = Insight::new(
            "exec-001".to_string(),
            InsightType::WorkflowCompleted,
            serde_json::json!({}),
        )
        .with_id(42);
        assert_eq!(insight.id, Some(42));
    }
}
