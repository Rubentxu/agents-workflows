//! Insights MCP Handler
//!
//! Handles insights-related tool calls.

use crate::state::AppState;
use crate::types::*;
use crate::metrics_sse::MetricsBroadcaster;
use insights::AnalyticsService;
use rusqlite::{params_from_iter, ToSql};
use std::sync::Arc;

pub struct InsightsMcpHandler {
    state: Arc<AppState>,
}

impl InsightsMcpHandler {
    pub fn new(state: Arc<AppState>, _broadcaster: Arc<MetricsBroadcaster>) -> Self {
        Self { state }
    }

    pub async fn insights_log(&self, params: InsightsLogParams) -> Result<Insight, String> {
        let conn = self.state.db.connection()
            .map_err(|e| format!("DB error: {}", e))?;

        let data_json = serde_json::to_string(&params.data)
            .map_err(|e| format!("JSON error: {}", e))?;
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO insights (execution_id, stage_id, insight_type, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![params.execution_arn, params.stage_id, params.insight_type, data_json, now],
        ).map_err(|e| format!("DB insert error: {}", e))?;

        let id = conn.last_insert_rowid();

        Ok(Insight {
            id,
            execution_arn: params.execution_arn,
            stage_id: params.stage_id,
            insight_type: params.insight_type,
            data: params.data,
            created_at: now,
        })
    }

    pub async fn insights_query(&self, params: InsightsQueryParams) -> Result<Vec<Insight>, String> {
        let conn = self.state.db.connection()
            .map_err(|e| format!("DB error: {}", e))?;

        let mut sql = String::from("SELECT id, execution_id, stage_id, insight_type, data_json, created_at FROM insights WHERE 1=1");
        let mut bind_params: Vec<&dyn ToSql> = Vec::new();

        if let Some(execution_arn) = params.execution_arn.as_ref() {
            sql.push_str(" AND execution_id = ?");
            bind_params.push(execution_arn as &dyn ToSql);
        }
        if let Some(stage_id) = params.stage_id.as_ref() {
            sql.push_str(" AND stage_id = ?");
            bind_params.push(stage_id as &dyn ToSql);
        }
        if let Some(insight_type) = params.insight_type.as_ref() {
            sql.push_str(" AND insight_type = ?");
            bind_params.push(insight_type as &dyn ToSql);
        }
        sql.push_str(" ORDER BY created_at DESC");

        let limit = params.limit.unwrap_or(100);
        sql.push_str(&format!(" LIMIT {}", limit));

        let mut stmt = conn.prepare(&sql).map_err(|e| format!("Prepare error: {}", e))?;

        let insights = stmt.query_map(params_from_iter(bind_params), |row| {
                let data_json_str: String = row.get(4)?;
                let data: serde_json::Value = serde_json::from_str(&data_json_str).unwrap_or(serde_json::Value::Null);
                Ok(Insight {
                    id: row.get(0)?,
                    execution_arn: row.get(1)?,
                    stage_id: row.get(2)?,
                    insight_type: row.get(3)?,
                    data,
                    created_at: row.get(5)?,
                })
            }).map_err(|e| format!("Query error: {}", e))?;

        Ok(insights.filter_map(|r| r.ok()).collect())
    }

    pub async fn insights_aggregate(&self, params: InsightsAggregateParams) -> Result<InsightsAggregateResult, String> {
        let conn = self.state.db.connection()
            .map_err(|e| format!("DB error: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, execution_id, stage_id, insight_type, data_json, created_at FROM insights WHERE execution_id = ?1 ORDER BY created_at ASC"
        ).map_err(|e| format!("Prepare error: {}", e))?;

        let insights: Vec<insights::domain::Insight> = stmt.query_map(
            rusqlite::params![params.execution_arn],
            |row| {
                let data_json_str: String = row.get(4)?;
                let data: serde_json::Value = serde_json::from_str(&data_json_str).unwrap_or(serde_json::Value::Null);
                let created_at_str: String = row.get(5)?;
                let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now());
                Ok(insights::domain::Insight {
                    id: row.get(0)?,
                    execution_id: row.get(1)?,
                    stage_id: row.get(2)?,
                    insight_type: insights::domain::InsightType::from_str(&row.get::<_, String>(3)?).unwrap_or(insights::domain::InsightType::AgentOutput),
                    data,
                    created_at,
                })
            },
        ).map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

        let analytics = AnalyticsService::new();

        if let Some(stage_id) = params.stage_id {
            let stage_analytics = analytics.aggregate_stage(&insights, &stage_id);
            Ok(InsightsAggregateResult::Stage {
                analytics: StageAnalytics {
                    execution_id: stage_analytics.execution_id,
                    stage_id: stage_analytics.stage_id,
                    total_insights: stage_analytics.total_insights,
                    insights_by_type: stage_analytics.insights_by_type,
                    total_tokens: stage_analytics.total_tokens,
                    total_duration_ms: stage_analytics.total_duration_ms,
                    avg_quality_score: stage_analytics.avg_quality_score,
                },
            })
        } else {
            let exec_analytics = analytics.aggregate_execution(&insights);
            let summary = analytics.execution_summary(&insights);
            Ok(InsightsAggregateResult::Execution {
                analytics: ExecutionAnalytics {
                    execution_id: exec_analytics.execution_id,
                    total_insights: exec_analytics.total_insights,
                    insights_by_type: exec_analytics.insights_by_type,
                    insights_by_stage: exec_analytics.insights_by_stage,
                    total_tokens: exec_analytics.total_tokens,
                    total_duration_ms: exec_analytics.total_duration_ms,
                    avg_quality_score: exec_analytics.avg_quality_score,
                },
                summary: ExecutionInsightSummary {
                    execution_id: summary.execution_id,
                    workflow_started: summary.workflow_started,
                    workflow_completed: summary.workflow_completed,
                    workflow_failed: summary.workflow_failed,
                    stage_count: summary.stage_count,
                    completed_stages: summary.completed_stages,
                    failed_stages: summary.failed_stages,
                    skipped_stages: summary.skipped_stages,
                    total_token_usage: summary.total_token_usage,
                    total_duration_ms: summary.total_duration_ms,
                    last_insight_at: summary.last_insight_at,
                },
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution_store::ExecutionStore;
    use registry::infrastructure::db::Database;
    use std::sync::Arc;

    fn create_test_db() -> Arc<Database> {
        Arc::new(Database::open_in_memory().expect("in-memory db"))
    }

    fn seed_insights(db: &Arc<Database>, execution_arn: &str) {
        let conn = db.connection().expect("db connection");
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO nodes (id, type, name, scope, registry, namespace) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params!["workflow/test", "workflow", "test", "global", "local", "global"],
        ).expect("insert workflow node");

        conn.execute(
            "INSERT INTO executions (id, workflow_id, workspace_id, status, current_stage, started_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![execution_arn, "workflow/test", "test", "running", None::<String>, &now],
        ).expect("insert execution");

        conn.execute(
            "INSERT INTO insights (execution_id, stage_id, insight_type, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![execution_arn, None::<String>, "workflow_started", r#"{}"#, &now],
        ).expect("insert workflow_started");

        conn.execute(
            "INSERT INTO insights (execution_id, stage_id, insight_type, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![execution_arn, "stage-1", "stage_started", r#"{}"#, &now],
        ).expect("insert stage_started");

        conn.execute(
            "INSERT INTO insights (execution_id, stage_id, insight_type, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![execution_arn, "stage-1", "stage_completed", r#"{"tokens_used": 1000, "duration_ms": 5000}"#, &now],
        ).expect("insert stage_completed");

        conn.execute(
            "INSERT INTO insights (execution_id, stage_id, insight_type, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![execution_arn, "stage-2", "stage_started", r#"{}"#, &now],
        ).expect("insert stage-2 started");

        conn.execute(
            "INSERT INTO insights (execution_id, stage_id, insight_type, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![execution_arn, None::<String>, "workflow_completed", r#"{}"#, &now],
        ).expect("insert workflow_completed");
    }

    fn create_test_state(db: Arc<Database>) -> Arc<AppState> {
        Arc::new(AppState {
            node_service: Arc::new(registry::application::node_service::NodeService::new(
                Arc::new(registry::infrastructure::node_repository::SqliteNodeRepository::new(db.clone()))
            )),
            db: db.clone(),
            execution_store: Arc::new(ExecutionStore::new(db.clone())),
            artifact_store: Arc::new(crate::artifact_store::ArtifactStore::new(db.clone())),
            artifact_service: Arc::new(artifact::application::artifact_service::ArtifactService::new(
                std::path::PathBuf::from("/tmp/test-artifacts")
            )),
            analytics_service: Arc::new(insights::AnalyticsService::new()),
            sse_emitter: Arc::new(metrics::application::SseEmitter::new()),
            metrics_aggregator: Arc::new(metrics::application::MetricsAggregator::new()),
            workspace_root: std::path::PathBuf::from("/tmp/test-workspace"),
        })
    }

    #[tokio::test]
    async fn test_insights_aggregate_execution_level_counts() {
        let db = create_test_db();
        let execution_arn = "arn:local:workspace/test:execution/1";

        seed_insights(&db, execution_arn);

        let state = create_test_state(db);
        let handler = InsightsMcpHandler::new(state, Arc::new(crate::metrics_sse::MetricsBroadcaster::new()));

        let result = handler.insights_aggregate(InsightsAggregateParams {
            execution_arn: execution_arn.to_string(),
            stage_id: None,
        }).await.expect("insights_aggregate should succeed");

        match result {
            InsightsAggregateResult::Execution { analytics, summary } => {
                assert_eq!(analytics.total_insights, 5, "Should have 5 insights");
                assert!(analytics.insights_by_stage.contains_key("stage-1"));
                assert!(analytics.insights_by_stage.contains_key("stage-2"));
                assert_eq!(analytics.total_tokens, Some(1000), "Should sum tokens");
                assert_eq!(analytics.total_duration_ms, Some(5000), "Should sum durations");

                assert!(summary.workflow_started, "Workflow should be marked started");
                assert!(summary.workflow_completed, "Workflow should be marked completed");
                assert!(!summary.workflow_failed, "Workflow should not be marked failed");
                assert!(summary.completed_stages.contains(&"stage-1".to_string()));
            },
            _ => panic!("Expected Execution result"),
        }
    }

    #[tokio::test]
    async fn test_insights_aggregate_stage_level_counts() {
        let db = create_test_db();
        let execution_arn = "arn:local:workspace/test:execution/2";

        seed_insights(&db, execution_arn);

        let state = create_test_state(db);
        let handler = InsightsMcpHandler::new(state, Arc::new(crate::metrics_sse::MetricsBroadcaster::new()));

        let result = handler.insights_aggregate(InsightsAggregateParams {
            execution_arn: execution_arn.to_string(),
            stage_id: Some("stage-1".to_string()),
        }).await.expect("insights_aggregate should succeed");

        match result {
            InsightsAggregateResult::Stage { analytics } => {
                assert_eq!(analytics.stage_id, "stage-1");
                assert_eq!(analytics.total_insights, 2, "stage-1 should have 2 insights");
                assert_eq!(analytics.total_tokens, Some(1000), "Should have tokens from stage-1");
                assert_eq!(analytics.total_duration_ms, Some(5000), "Should have duration from stage-1");
            },
            _ => panic!("Expected Stage result"),
        }
    }
}
