//! Metrics MCP Handler
//!
//! Handles metrics-related tool calls.

use crate::state::AppState;
use crate::types::*;
use crate::metrics_sse::MetricsBroadcaster;
use std::sync::Arc;

pub struct MetricsMcpHandler {
    state: Arc<AppState>,
}

impl MetricsMcpHandler {
    pub fn new(state: Arc<AppState>, _broadcaster: Arc<MetricsBroadcaster>) -> Self {
        Self { state }
    }

    pub async fn metrics_query(&self, params: MetricsQueryParams) -> Result<MetricsResponse, String> {
        let execution = match self.state.execution_store().get(&params.execution_arn) {
            Ok(e) => e,
            Err(_) => {
                // Return empty metrics for non-existent executions
                return Ok(MetricsResponse {
                    execution_arn: params.execution_arn,
                    metrics: vec![],
                    total_tokens: 0,
                    total_duration_ms: 0,
                });
            }
        };

        let mut metrics = Vec::new();

        for stage_id in &execution.completed_stages {
            metrics.push(StageMetrics {
                stage_id: stage_id.clone(),
                status: "completed".to_string(),
                tokens_used: None,
                duration_ms: None,
                started_at: None,
                completed_at: None,
            });
        }

        if let Some(current) = &execution.current_stage {
            metrics.push(StageMetrics {
                stage_id: current.clone(),
                status: "running".to_string(),
                tokens_used: None,
                duration_ms: None,
                started_at: None,
                completed_at: None,
            });
        }

        if let Ok(all_stages) = self.state.get_workflow_stage_ids(&execution.workflow_arn).await {
            let completed_set: std::collections::HashSet<_> = execution.completed_stages.iter().collect();
            let current_stage = execution.current_stage.as_ref();
            for stage_id in all_stages {
                if !completed_set.contains(&stage_id) && Some(&stage_id) != current_stage {
                    metrics.push(StageMetrics {
                        stage_id,
                        status: "pending".to_string(),
                        tokens_used: None,
                        duration_ms: None,
                        started_at: None,
                        completed_at: None,
                    });
                }
            }
        }

        let total_duration_ms = if let (Some(start), Some(end)) = (&execution.started_at, &execution.completed_at) {
            let start_dt = chrono::DateTime::parse_from_rfc3339(start);
            let end_dt = chrono::DateTime::parse_from_rfc3339(end);
            if let (Ok(start_dt), Ok(end_dt)) = (start_dt, end_dt) {
                Some((end_dt - start_dt).num_milliseconds())
            } else {
                None
            }
        } else {
            None
        };

        Ok(MetricsResponse {
            execution_arn: params.execution_arn,
            metrics,
            total_tokens: 0,
            total_duration_ms: total_duration_ms.unwrap_or(0),
        })
    }

    pub async fn metrics_subscribe(&self, params: MetricsSubscribeParams) -> Result<SseUrl, String> {
        let execution = params.execution_arn.unwrap_or_else(|| "*".to_string());
        let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());

        Ok(SseUrl {
            url: format!("http://localhost:{}/metrics/sse?execution={}", port, execution),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use registry::infrastructure::db::Database;
    use std::collections::HashMap;
    use std::sync::Arc;

    fn create_test_state() -> (Arc<AppState>, Arc<Database>) {
        let (state, _temp) = AppState::test().expect("test state");
        let state = Arc::new(state);
        let db = state.db().clone();
        (state, db)
    }

    #[tokio::test]
    async fn test_metrics_query_returns_execution_state() {
        let (state, db) = create_test_state();

        let execution_arn = "arn:local:workspace/test:execution/1";
        let workflow_arn = "arn:local:global:workflow/test";
        let now = chrono::Utc::now().to_rfc3339();

        let node = registry::domain::Node {
            id: workflow_arn.to_string(),
            name: "test".to_string(),
            node_type: registry::domain::NodeType::Workflow,
            scope: "global".to_string(),
            registry: "local".to_string(),
            namespace: "global".to_string(),
            path: None,
            checksum: None,
            config_json: Some(r#"
name: test
spec:
  stages:
    stage-1:
      id: stage-1
      agent: test-agent
    stage-2:
      id: stage-2
      agent: test-agent
    stage-3:
      id: stage-3
      agent: test-agent
"#.to_string()),
            metadata_json: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        state.node_service().create(node).expect("save workflow node");

        let execution = crate::execution_store::PersistedExecution {
            arn: execution_arn.to_string(),
            workflow_arn: workflow_arn.to_string(),
            workspace_id: "test".to_string(),
            status: "running".to_string(),
            current_stage: Some("stage-2".to_string()),
            completed_stages: vec!["stage-1".to_string()],
            stage_outputs: HashMap::new(),
            execution_context: serde_json::json!({}),
            triggered_by: crate::types::TriggerInfoDto {
                trigger_type: "manual".to_string(),
                source: None,
                input: serde_json::json!({}),
            },
            started_at: Some(now.clone()),
            completed_at: None,
        };

        state.execution_store().create(&execution).expect("create execution");

        let handler = MetricsMcpHandler::new(state, Arc::new(crate::metrics_sse::MetricsBroadcaster::new()));

        let result = handler.metrics_query(MetricsQueryParams {
            execution_arn: execution_arn.to_string(),
            start_time: None,
            end_time: None,
        }).await.expect("metrics_query should succeed");

        assert_eq!(result.execution_arn, execution_arn);
        assert!(result.total_duration_ms >= 0, "Should have duration");

        let stage_ids: Vec<_> = result.metrics.iter().map(|m| m.stage_id.as_str()).collect();
        assert!(stage_ids.contains(&"stage-1"), "Completed stage should appear");
        assert!(stage_ids.contains(&"stage-2"), "Current stage should appear");
        assert!(stage_ids.contains(&"stage-3"), "Pending stage should appear");

        let stage1 = result.metrics.iter().find(|m| m.stage_id == "stage-1").expect("stage-1");
        assert_eq!(stage1.status, "completed", "stage-1 should be completed");

        let stage2 = result.metrics.iter().find(|m| m.stage_id == "stage-2").expect("stage-2");
        assert_eq!(stage2.status, "running", "stage-2 should be running");

        let stage3 = result.metrics.iter().find(|m| m.stage_id == "stage-3").expect("stage-3");
        assert_eq!(stage3.status, "pending", "stage-3 should be pending");
    }
}