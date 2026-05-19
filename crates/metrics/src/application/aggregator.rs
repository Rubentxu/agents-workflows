//! Metrics Aggregator

use crate::domain::{MetricEvent, MetricEventType, ExecutionMetrics, StageMetrics};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;

/// Aggregates metrics from multiple events into summary
pub struct MetricsAggregator {
    stage_metrics: Arc<RwLock<HashMap<String, StageMetrics>>>,
    execution_metrics: Arc<RwLock<HashMap<String, ExecutionMetrics>>>,
}

impl MetricsAggregator {
    pub fn new() -> Self {
        Self {
            stage_metrics: Arc::new(RwLock::new(HashMap::new())),
            execution_metrics: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Process a metric event and update aggregations
    pub fn process(&self, event: &MetricEvent) {
        match event.event_type {
            MetricEventType::Started => {
                let mut metrics = self.stage_metrics.write();
                let stage = metrics.entry(event.stage_id.clone())
                    .or_insert_with(|| StageMetrics::new(event.stage_id.clone()));
                stage.start();
            }
            MetricEventType::Completed => {
                let mut metrics = self.stage_metrics.write();
                if let Some(stage) = metrics.get_mut(&event.stage_id) {
                    stage.complete();
                    stage.tokens_used = event.metrics.tokens_used.unwrap_or(0);
                }
            }
            MetricEventType::Failed => {
                let mut metrics = self.stage_metrics.write();
                if let Some(stage) = metrics.get_mut(&event.stage_id) {
                    stage.complete();
                    stage.errors_count += 1;
                }
            }
            MetricEventType::Progress => {
                // Progress updates don't modify aggregation state
            }
            MetricEventType::ArtifactCreated => {
                let mut metrics = self.stage_metrics.write();
                if let Some(stage) = metrics.get_mut(&event.stage_id) {
                    if let Some(count) = event.metrics.artifacts_created.as_ref() {
                        stage.artifacts_count += count.len() as u32;
                    }
                }
            }
        }
    }

    /// Get aggregated stage metrics
    pub fn get_stage_metrics(&self, stage_id: &str) -> Option<StageMetrics> {
        self.stage_metrics.read().get(stage_id).cloned()
    }

    /// Get aggregated execution metrics
    pub fn get_execution_metrics(&self, execution_arn: &str) -> Option<ExecutionMetrics> {
        self.execution_metrics.read().get(execution_arn).cloned()
    }

    /// Build complete execution summary
    pub fn build_summary(&self, execution_arn: &str) -> ExecutionMetrics {
        let mut summary = ExecutionMetrics::new(execution_arn.to_string());

        let stage_metrics: Vec<_> = self.stage_metrics.read()
            .values()
            .filter(|m| m.started_at.is_some())
            .cloned()
            .collect();

        for stage in stage_metrics {
            summary.add_stage_metrics(stage);
        }

        summary
    }

    /// Reset metrics for an execution
    pub fn reset(&self, execution_arn: &str) {
        // Remove all stage metrics for this execution
        // In a real implementation, we'd track execution_arn per stage
        let mut metrics = self.stage_metrics.write();
        metrics.retain(|_, _| {
            // Keep stages that aren't part of this execution
            // This is simplified - in practice we'd track execution_arn per stage
            true
        });

        let mut exec_metrics = self.execution_metrics.write();
        exec_metrics.remove(execution_arn);
    }
}

impl Default for MetricsAggregator {
    fn default() -> Self {
        Self::new()
    }
}
