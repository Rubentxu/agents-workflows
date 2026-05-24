//! Insights persistence store
//!
//! SQLite implementation of the InsightsRepository trait.

use insights::domain::{Insight, InsightType, InsightsError, InsightsQuery, InsightsRepository, InsightsResult};
use registry::infrastructure::db::Database;
use std::sync::Arc;

/// SQLite implementation of InsightsRepository
pub struct InsightsStore {
    db: Arc<Database>,
}

impl InsightsStore {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
}

impl InsightsRepository for InsightsStore {
    fn log(&self, insight: &Insight) -> InsightsResult<()> {
        let conn = self.db.connection().map_err(|e| InsightsError::DatabaseError(e.to_string()))?;
        conn.execute(
            "INSERT INTO insights (execution_id, stage_id, insight_type, data_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                insight.execution_id,
                insight.stage_id,
                insight.insight_type.as_str(),
                serde_json::to_string(&insight.data).map_err(|e| InsightsError::SerializationError(e))?,
                insight.created_at.to_rfc3339(),
            ],
        )
        .map_err(|e| InsightsError::DatabaseError(e.to_string()))?;
        Ok(())
    }

    fn query(&self, params: &InsightsQuery) -> InsightsResult<Vec<Insight>> {
        let conn = self.db.connection().map_err(|e| InsightsError::DatabaseError(e.to_string()))?;

        let mut sql = String::from(
            "SELECT id, execution_id, stage_id, insight_type, data_json, created_at FROM insights WHERE 1=1",
        );
        let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref exec_arn) = params.execution_arn {
            sql.push_str(" AND execution_id = ?");
            bind_params.push(Box::new(exec_arn.clone()));
        }
        if let Some(ref stage_id) = params.stage_id {
            sql.push_str(" AND stage_id = ?");
            bind_params.push(Box::new(stage_id.clone()));
        }
        if let Some(ref insight_type) = params.insight_type {
            sql.push_str(" AND insight_type = ?");
            bind_params.push(Box::new(insight_type.clone()));
        }

        sql.push_str(" ORDER BY created_at DESC LIMIT 100");

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| InsightsError::DatabaseError(e.to_string()))?;

        let param_refs: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt
            .query_map(param_refs.as_slice(), |row| {
                let insight_type_str: String = row.get(3)?;
                let data_json_str: String = row.get(4)?;
                let created_at_str: String = row.get(5)?;

                Ok(Insight {
                    id: Some(row.get(0)?),
                    execution_id: row.get(1)?,
                    stage_id: row.get(2)?,
                    insight_type: InsightType::from_str(&insight_type_str).unwrap_or(InsightType::AgentOutput),
                    data: serde_json::from_str(&data_json_str).unwrap_or(serde_json::Value::Null),
                    created_at: chrono::DateTime::parse_from_rfc3339(&created_at_str)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_else(|_| chrono::Utc::now()),
                })
            })
            .map_err(|e| InsightsError::QueryError(e.to_string()))?;

        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    fn aggregate(&self, params: &insights::domain::InsightsAggregateParams) -> InsightsResult<insights::domain::InsightsAggregateResult> {
        // For now, delegate to query without grouping - full implementation would do GROUP BY
        let query = InsightsQuery {
            execution_arn: params.execution_arn.clone(),
            stage_id: None,
            insight_type: None,
            from: None,
            to: None,
        };
        let insights = self.query(&query)?;

        // Convert to aggregate result - simplified implementation
        let groups = vec![insights::domain::InsightsGroup {
            key: "all".to_string(),
            count: insights.len() as i64,
            data: serde_json::json!({"count": insights.len()}),
        }];

        Ok(insights::domain::InsightsAggregateResult { groups })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use insights::domain::InsightsRepository;
    use chrono::Utc;

    fn create_test_store() -> (InsightsStore, Arc<Database>) {
        let db = Arc::new(Database::open_in_memory().expect("in-memory db"));
        // Disable foreign keys for testing since we don't have valid references
        {
            let conn = db.connection().expect("db connection");
            conn.execute_batch("PRAGMA foreign_keys=OFF;").expect("disable foreign keys");
        }
        let store = InsightsStore::new(db.clone());
        (store, db)
    }

    #[test]
    fn test_log_and_query_insight() {
        let (store, _db) = create_test_store();

        // Create an insight
        let insight = Insight::new(
            "exec-001".to_string(),
            InsightType::WorkflowStarted,
            serde_json::json!({"timestamp": "2026-05-24T10:00:00Z"}),
        );
        store.log(&insight).expect("log insight");

        // Query by execution
        let results = store.query(&InsightsQuery {
            execution_arn: Some("exec-001".to_string()),
            stage_id: None,
            insight_type: None,
            from: None,
            to: None,
        }).expect("query insights");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].execution_id, "exec-001");
        assert_eq!(results[0].insight_type, InsightType::WorkflowStarted);
    }

    #[test]
    fn test_query_by_type() {
        let (store, _db) = create_test_store();

        // Log multiple insights of different types
        let insight1 = Insight::new(
            "exec-002".to_string(),
            InsightType::WorkflowStarted,
            serde_json::json!({}),
        );
        let insight2 = Insight::new(
            "exec-002".to_string(),
            InsightType::StageCompleted,
            serde_json::json!({}),
        );
        store.log(&insight1).expect("log insight1");
        store.log(&insight2).expect("log insight2");

        // Query only stage_completed
        let results = store.query(&InsightsQuery {
            execution_arn: Some("exec-002".to_string()),
            stage_id: None,
            insight_type: Some("stage_completed".to_string()),
            from: None,
            to: None,
        }).expect("query");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].insight_type, InsightType::StageCompleted);
    }

    #[test]
    fn test_query_multiple_filters() {
        let (store, _db) = create_test_store();

        let insight = Insight::for_stage(
            "exec-003".to_string(),
            "explore".to_string(),
            InsightType::StageStarted,
            serde_json::json!({"agent": "test"}),
        );
        store.log(&insight).expect("log insight");

        // Query with execution AND stage filter
        let results = store.query(&InsightsQuery {
            execution_arn: Some("exec-003".to_string()),
            stage_id: Some("explore".to_string()),
            insight_type: None,
            from: None,
            to: None,
        }).expect("query");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].stage_id.as_deref(), Some("explore"));
    }

    #[test]
    fn test_log_stage_insight() {
        let (store, _db) = create_test_store();

        let insight = Insight::for_stage(
            "exec-004".to_string(),
            "explore".to_string(),
            InsightType::StageCompleted,
            serde_json::json!({"duration_ms": 1500}),
        );
        store.log(&insight).expect("log stage insight");

        let results = store.query(&InsightsQuery {
            execution_arn: Some("exec-004".to_string()),
            stage_id: None,
            insight_type: None,
            from: None,
            to: None,
        }).expect("query");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].stage_id.as_deref(), Some("explore"));
        assert_eq!(results[0].insight_type, InsightType::StageCompleted);
    }
}
