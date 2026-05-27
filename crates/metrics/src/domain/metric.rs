//! Metric Event

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

/// Metric event types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MetricEventType {
    Started,
    Completed,
    Failed,
    Progress,
    ArtifactCreated,
    ToolCall,
}

/// Metric event for execution monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricEvent {
    pub execution_arn: String,
    pub stage_id: String,
    pub timestamp: DateTime<Utc>,
    pub event_type: MetricEventType,
    pub metrics: MetricData,
}

impl MetricEvent {
    pub fn new(
        execution_arn: String,
        stage_id: String,
        event_type: MetricEventType,
    ) -> Self {
        Self {
            execution_arn,
            stage_id,
            timestamp: Utc::now(),
            event_type,
            metrics: MetricData::default(),
        }
    }

    pub fn with_tokens(mut self, tokens: u64) -> Self {
        self.metrics.tokens_used = Some(tokens);
        self
    }

    pub fn with_duration(mut self, ms: u64) -> Self {
        self.metrics.duration_ms = Some(ms);
        self
    }

    pub fn with_progress(mut self, percent: f32) -> Self {
        self.metrics.progress_percent = Some(percent);
        self
    }

    pub fn with_artifacts(mut self, artifacts: Vec<String>) -> Self {
        self.metrics.artifacts_created = Some(artifacts);
        self
    }

    pub fn with_error(mut self, error: String) -> Self {
        self.metrics.errors = Some(vec![error]);
        self
    }

    pub fn with_custom(mut self, custom: serde_json::Value) -> Self {
        self.metrics.custom = Some(custom);
        self
    }
}

/// Metrics data within an event
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MetricData {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_used: Option<u64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress_percent: Option<f32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifacts_created: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom: Option<serde_json::Value>,
}

/// Execution stage metrics summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageMetrics {
    pub stage_id: String,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<u64>,
    pub tokens_used: u64,
    pub tool_invocations: u32,
    pub artifacts_count: u32,
    pub errors_count: u32,
}

impl StageMetrics {
    pub fn new(stage_id: String) -> Self {
        Self {
            stage_id,
            started_at: None,
            completed_at: None,
            duration_ms: None,
            tokens_used: 0,
            tool_invocations: 0,
            artifacts_count: 0,
            errors_count: 0,
        }
    }

    pub fn start(&mut self) {
        self.started_at = Some(Utc::now());
    }

    pub fn complete(&mut self) {
        self.completed_at = Some(Utc::now());
        if let (Some(start), Some(end)) = (self.started_at, self.completed_at) {
            self.duration_ms = Some((end - start).num_milliseconds() as u64);
        }
    }
}

/// Execution metrics summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionMetrics {
    pub execution_arn: String,
    pub total_duration_ms: Option<u64>,
    pub total_tokens: u64,
    pub stages_completed: u32,
    pub stages_failed: u32,
    pub total_artifacts: u32,
    pub stage_metrics: Vec<StageMetrics>,
}

impl ExecutionMetrics {
    pub fn new(execution_arn: String) -> Self {
        Self {
            execution_arn,
            total_duration_ms: None,
            total_tokens: 0,
            stages_completed: 0,
            stages_failed: 0,
            total_artifacts: 0,
            stage_metrics: Vec::new(),
        }
    }

    pub fn add_stage_metrics(&mut self, stage: StageMetrics) {
        self.total_tokens += stage.tokens_used;
        if stage.errors_count > 0 {
            self.stages_failed += 1;
        } else {
            self.stages_completed += 1;
        }
        self.total_artifacts += stage.artifacts_count;
        self.stage_metrics.push(stage);
    }
}
