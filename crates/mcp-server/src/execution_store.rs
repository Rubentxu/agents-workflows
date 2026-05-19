//! Agent Execution persistence seam
//!
//! Owns persistence for execution records so MCP handlers do not need to issue
//! raw SQL directly for create/read/update/list/abort flows.

use crate::types::{ExecutionListParams, ExecutionSummary, StageOutput, TriggerInfo};
use registry::infrastructure::db::Database;
use rusqlite::{params_from_iter, ToSql};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct PersistedExecution {
    pub arn: String,
    pub workflow_arn: String,
    pub workspace_id: String,
    pub status: String,
    pub current_stage: Option<String>,
    pub completed_stages: Vec<String>,
    pub stage_outputs: HashMap<String, StageOutput>,
    pub execution_context: serde_json::Value,
    pub triggered_by: TriggerInfo,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ExecutionUpdate {
    pub execution_arn: String,
    pub status: String,
    pub current_stage: Option<String>,
    pub completed_stages: Vec<String>,
    pub stage_outputs: HashMap<String, StageOutput>,
    pub execution_context: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct ExecutionProgress {
    pub workflow_arn: String,
    pub completed_stages: Vec<String>,
}

pub struct ExecutionStore {
    db: Arc<Database>,
}

impl ExecutionStore {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn create(&self, execution: &PersistedExecution) -> Result<(), String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO executions (id, workflow_id, workspace_id, status, current_stage, completed_stages_json, stage_outputs_json, execution_context_json, triggered_by_json, started_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                execution.arn,
                execution.workflow_arn,
                execution.workspace_id,
                execution.status,
                execution.current_stage,
                serde_json::to_string(&execution.completed_stages).unwrap_or_default(),
                serde_json::to_string(&execution.stage_outputs).unwrap_or_default(),
                serde_json::to_string(&execution.execution_context).unwrap_or_default(),
                serde_json::to_string(&execution.triggered_by).unwrap_or_default(),
                execution.started_at,
                execution.completed_at,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get(&self, execution_arn: &str) -> Result<PersistedExecution, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, workflow_id, workspace_id, status, current_stage, completed_stages_json, stage_outputs_json, execution_context_json, triggered_by_json, started_at, completed_at FROM executions WHERE id = ?1",
            [execution_arn],
            |row| {
                let completed_stages_json: Option<String> = row.get(5)?;
                let stage_outputs_json: Option<String> = row.get(6)?;
                let execution_context_json: Option<String> = row.get(7)?;
                let triggered_by_json: Option<String> = row.get(8)?;

                Ok(PersistedExecution {
                    arn: row.get(0)?,
                    workflow_arn: row.get(1)?,
                    workspace_id: row.get(2)?,
                    status: row.get(3)?,
                    current_stage: row.get(4)?,
                    completed_stages: completed_stages_json
                        .and_then(|s| serde_json::from_str(&s).ok())
                        .unwrap_or_default(),
                    stage_outputs: stage_outputs_json
                        .and_then(|s| serde_json::from_str(&s).ok())
                        .unwrap_or_default(),
                    execution_context: execution_context_json
                        .and_then(|s| serde_json::from_str(&s).ok())
                        .unwrap_or(serde_json::Value::Null),
                    triggered_by: triggered_by_json
                        .and_then(|s| serde_json::from_str(&s).ok())
                        .unwrap_or_default(),
                    started_at: row.get(9)?,
                    completed_at: row.get(10)?,
                })
            },
        )
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                format!("Execution not found: {}", execution_arn)
            } else {
                format!("DB error: {}", e)
            }
        })
    }

    pub fn list(&self, params: &ExecutionListParams) -> Result<Vec<ExecutionSummary>, String> {
        let conn = self.db.connection().map_err(|e| format!("DB error: {}", e))?;

        let mut sql = String::from(
            "SELECT id, workflow_id, workspace_id, status, current_stage, started_at FROM executions WHERE 1=1",
        );
        let mut bind_params: Vec<&dyn ToSql> = Vec::new();

        if let Some(workspace_id) = params.workspace_id.as_ref() {
            sql.push_str(" AND workspace_id = ?");
            bind_params.push(workspace_id as &dyn ToSql);
        }
        if let Some(workflow_arn) = params.workflow_arn.as_ref() {
            sql.push_str(" AND workflow_id = ?");
            bind_params.push(workflow_arn as &dyn ToSql);
        }
        if let Some(status) = params.status.as_ref() {
            sql.push_str(" AND status = ?");
            bind_params.push(status as &dyn ToSql);
        }
        sql.push_str(" ORDER BY started_at DESC");
        sql.push_str(&format!(" LIMIT {}", params.limit.unwrap_or(100)));

        let mut stmt = conn.prepare(&sql).map_err(|e| format!("Prepare error: {}", e))?;
        let rows = stmt
            .query_map(params_from_iter(bind_params), |row| {
                    Ok(ExecutionSummary {
                        arn: row.get(0)?,
                        workflow_arn: row.get(1)?,
                        workspace_id: row.get(2)?,
                        status: row.get(3)?,
                        current_stage: row.get(4)?,
                        started_at: row.get(5)?,
                    })
                })
            .map_err(|e| format!("Query error: {}", e))?;

        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn update(&self, update: &ExecutionUpdate) -> Result<(), String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let updated = conn
            .execute(
                "UPDATE executions SET status = ?1, current_stage = ?2, completed_stages_json = ?3, stage_outputs_json = ?4, execution_context_json = ?5, updated_at = CURRENT_TIMESTAMP WHERE id = ?6",
                rusqlite::params![
                    update.status,
                    update.current_stage,
                    serde_json::to_string(&update.completed_stages).unwrap_or_default(),
                    serde_json::to_string(&update.stage_outputs).unwrap_or_default(),
                    serde_json::to_string(&update.execution_context).unwrap_or_default(),
                    update.execution_arn,
                ],
            )
            .map_err(|e| e.to_string())?;

        if updated == 0 {
            return Err(format!("Execution not found: {}", update.execution_arn));
        }
        Ok(())
    }

    pub fn get_progress(&self, execution_arn: &str) -> Result<ExecutionProgress, String> {
        let conn = self.db.connection().map_err(|e| format!("DB error: {}", e))?;
        conn.query_row(
            "SELECT workflow_id, completed_stages_json FROM executions WHERE id = ?1",
            [execution_arn],
            |row| {
                let completed_stages_json: Option<String> = row.get(1)?;
                Ok(ExecutionProgress {
                    workflow_arn: row.get(0)?,
                    completed_stages: completed_stages_json
                        .and_then(|s| serde_json::from_str(&s).ok())
                        .unwrap_or_default(),
                })
            },
        )
        .map_err(|e| format!("Execution not found: {}", e))
    }

    pub fn current_status(&self, execution_arn: &str) -> Result<Option<String>, String> {
        let conn = self.db.connection().map_err(|e| format!("DB error: {}", e))?;
        Ok(conn
            .query_row(
                "SELECT status FROM executions WHERE id = ?1",
                [execution_arn],
                |row| row.get(0),
            )
            .ok())
    }

    pub fn abort(&self, execution_arn: &str, completed_at: &str) -> Result<(), String> {
        let conn = self.db.connection().map_err(|e| format!("DB error: {}", e))?;
        let updated = conn
            .execute(
                "UPDATE executions SET status = 'aborted', completed_at = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
                rusqlite::params![completed_at, execution_arn],
            )
            .map_err(|e| format!("DB update error: {}", e))?;

        if updated == 0 {
            return Err(format!("Execution not found: {}", execution_arn));
        }
        Ok(())
    }

    pub fn pause(&self, execution_arn: &str) -> Result<(), String> {
        let conn = self.db.connection().map_err(|e| format!("DB error: {}", e))?;
        let updated = conn
            .execute(
                "UPDATE executions SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                rusqlite::params![execution_arn],
            )
            .map_err(|e| format!("DB update error: {}", e))?;

        if updated == 0 {
            return Err(format!("Execution not found: {}", execution_arn));
        }
        Ok(())
    }

    pub fn resume(&self, execution_arn: &str) -> Result<(), String> {
        let conn = self.db.connection().map_err(|e| format!("DB error: {}", e))?;
        let updated = conn
            .execute(
                "UPDATE executions SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                rusqlite::params![execution_arn],
            )
            .map_err(|e| format!("DB update error: {}", e))?;

        if updated == 0 {
            return Err(format!("Execution not found: {}", execution_arn));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_store() -> ExecutionStore {
        let db = Arc::new(Database::open_in_memory().expect("in-memory db"));
        {
            let conn = db.connection().expect("db connection");
            conn.execute(
                "INSERT INTO nodes (id, type, name, scope, registry, namespace) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    "arn:local:global:workflow/test",
                    "workflow",
                    "test",
                    "global",
                    "local",
                    "global",
                ],
            )
            .expect("insert workflow node");
        }
        ExecutionStore::new(db)
    }

    fn sample_execution() -> PersistedExecution {
        PersistedExecution {
            arn: "arn:local:workspace/test:execution/1".to_string(),
            workflow_arn: "arn:local:global:workflow/test".to_string(),
            workspace_id: "test".to_string(),
            status: "pending".to_string(),
            current_stage: None,
            completed_stages: vec![],
            stage_outputs: HashMap::new(),
            execution_context: serde_json::json!({"goal": "test"}),
            triggered_by: TriggerInfo {
                trigger_type: "manual".to_string(),
                input: serde_json::json!({"goal": "test"}),
            },
            started_at: Some("2026-05-18T10:00:00Z".to_string()),
            completed_at: None,
        }
    }

    #[test]
    fn create_and_get_execution() {
        let store = make_store();
        let execution = sample_execution();

        store.create(&execution).expect("create execution");
        let loaded = store.get(&execution.arn).expect("load execution");

        assert_eq!(loaded.arn, execution.arn);
        assert_eq!(loaded.workflow_arn, execution.workflow_arn);
        assert_eq!(loaded.execution_context, serde_json::json!({"goal": "test"}));
    }

    #[test]
    fn update_execution_record() {
        let store = make_store();
        let execution = sample_execution();
        store.create(&execution).expect("create execution");

        let mut outputs = HashMap::new();
        outputs.insert("explore".to_string(), StageOutput { artifacts: vec![] });

        store
            .update(&ExecutionUpdate {
                execution_arn: execution.arn.clone(),
                status: "running".to_string(),
                current_stage: Some("explore".to_string()),
                completed_stages: vec!["init".to_string()],
                stage_outputs: outputs,
                execution_context: serde_json::json!({"goal": "test", "phase": "explore"}),
            })
            .expect("update execution");

        let loaded = store.get(&execution.arn).expect("load execution");
        assert_eq!(loaded.status, "running");
        assert_eq!(loaded.current_stage.as_deref(), Some("explore"));
        assert_eq!(loaded.completed_stages, vec!["init"]);
        assert_eq!(
            loaded.execution_context,
            serde_json::json!({"goal": "test", "phase": "explore"})
        );
        assert!(loaded.stage_outputs.contains_key("explore"));
    }
}
