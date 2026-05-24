//! Alert persistence store
//!
//! SQLite implementation of the AlertRepository trait.

use metrics::domain::{
    Alert, AlertQuery, AlertRepository, AlertSeverity, AlertState, MetricsError, MetricsResult,
};
use registry::infrastructure::db::Database;
use std::sync::Arc;

/// SQLite implementation of AlertRepository
pub struct AlertStore {
    db: Arc<Database>,
}

impl AlertStore {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
}

impl AlertRepository for AlertStore {
    fn list(&self, query: &AlertQuery) -> MetricsResult<Vec<Alert>> {
        let conn = self
            .db
            .connection()
            .map_err(|e| MetricsError::DatabaseError(e.to_string()))?;

        let mut sql = String::from(
            "SELECT id, message, severity, state, source, workspace_id, created_at, updated_at FROM alerts WHERE 1=1",
        );
        let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref state) = query.state {
            sql.push_str(" AND state = ?");
            bind_params.push(Box::new(state.as_str().to_string()));
        }
        if let Some(ref severity) = query.severity {
            sql.push_str(" AND severity = ?");
            bind_params.push(Box::new(severity.as_str().to_string()));
        }
        if let Some(ref workspace_id) = query.workspace_id {
            sql.push_str(" AND workspace_id = ?");
            bind_params.push(Box::new(workspace_id.clone()));
        }

        sql.push_str(" ORDER BY created_at DESC");
        if let Some(limit) = query.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        } else {
            sql.push_str(" LIMIT 100");
        }

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| MetricsError::DatabaseError(e.to_string()))?;

        let param_refs: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt
            .query_map(param_refs.as_slice(), |row| {
                let severity_str: String = row.get(2)?;
                let state_str: String = row.get(3)?;
                let created_at_str: String = row.get(6)?;
                let updated_at_str: Option<String> = row.get(7)?;

                Ok(Alert {
                    id: Some(row.get(0)?),
                    message: row.get(1)?,
                    severity: AlertSeverity::from_str(&severity_str).unwrap_or(AlertSeverity::Info),
                    state: AlertState::from_str(&state_str).unwrap_or(AlertState::Open),
                    source: row.get(4)?,
                    workspace_id: row.get(5)?,
                    created_at: chrono::DateTime::parse_from_rfc3339(&created_at_str)
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_else(|_| chrono::Utc::now()),
                    updated_at: updated_at_str
                        .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                        .map(|dt| dt.with_timezone(&chrono::Utc))
                        .unwrap_or_else(|| chrono::Utc::now()),
                })
            })
            .map_err(|e| MetricsError::DatabaseError(e.to_string()))?;

        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    fn get(&self, id: i64) -> MetricsResult<Option<Alert>> {
        let conn = self
            .db
            .connection()
            .map_err(|e| MetricsError::DatabaseError(e.to_string()))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, message, severity, state, source, workspace_id, created_at, updated_at FROM alerts WHERE id = ?1",
            )
            .map_err(|e| MetricsError::DatabaseError(e.to_string()))?;

        let row = stmt.query_row([id], |row| {
            let severity_str: String = row.get(2)?;
            let state_str: String = row.get(3)?;
            let created_at_str: String = row.get(6)?;
            let updated_at_str: Option<String> = row.get(7)?;

            Ok(Alert {
                id: Some(row.get(0)?),
                message: row.get(1)?,
                severity: AlertSeverity::from_str(&severity_str).unwrap_or(AlertSeverity::Info),
                state: AlertState::from_str(&state_str).unwrap_or(AlertState::Open),
                source: row.get(4)?,
                workspace_id: row.get(5)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|_| chrono::Utc::now()),
                updated_at: updated_at_str
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(|| chrono::Utc::now()),
            })
        });

        match row {
            Ok(alert) => Ok(Some(alert)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(MetricsError::DatabaseError(e.to_string())),
        }
    }

    fn create(&self, alert: &Alert) -> MetricsResult<i64> {
        let conn = self
            .db
            .connection()
            .map_err(|e| MetricsError::DatabaseError(e.to_string()))?;

        conn.execute(
            "INSERT INTO alerts (message, severity, state, source, workspace_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                alert.message,
                alert.severity.as_str(),
                alert.state.as_str(),
                alert.source,
                alert.workspace_id,
                alert.created_at.to_rfc3339(),
                alert.updated_at.to_rfc3339(),
            ],
        )
        .map_err(|e| MetricsError::DatabaseError(e.to_string()))?;

        let id = conn
            .last_insert_rowid();
        Ok(id)
    }

    fn update(&self, alert: &Alert) -> MetricsResult<()> {
        let conn = self
            .db
            .connection()
            .map_err(|e| MetricsError::DatabaseError(e.to_string()))?;

        let id = alert.id.ok_or_else(|| MetricsError::AlertNotFound(0))?;

        let updated = conn
            .execute(
                "UPDATE alerts SET message = ?1, severity = ?2, state = ?3, source = ?4, workspace_id = ?5, updated_at = ?6 WHERE id = ?7",
                rusqlite::params![
                    alert.message,
                    alert.severity.as_str(),
                    alert.state.as_str(),
                    alert.source,
                    alert.workspace_id,
                    alert.updated_at.to_rfc3339(),
                    id,
                ],
            )
            .map_err(|e| MetricsError::DatabaseError(e.to_string()))?;

        if updated == 0 {
            return Err(MetricsError::AlertNotFound(id));
        }
        Ok(())
    }

    fn delete(&self, id: i64) -> MetricsResult<()> {
        let conn = self
            .db
            .connection()
            .map_err(|e| MetricsError::DatabaseError(e.to_string()))?;

        let deleted = conn
            .execute("DELETE FROM alerts WHERE id = ?1", [id])
            .map_err(|e| MetricsError::DatabaseError(e.to_string()))?;

        if deleted == 0 {
            return Err(MetricsError::AlertNotFound(id));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use metrics::domain::AlertRepository;

    fn create_test_store() -> AlertStore {
        let db = Arc::new(Database::open_in_memory().expect("in-memory db"));
        AlertStore::new(db)
    }

    #[test]
    fn test_alert_crud() {
        let store = create_test_store();

        // Create
        let alert = Alert::new(
            "Test alert".to_string(),
            AlertSeverity::Warning,
            Some("test".to_string()),
            None,
        );
        let id = store.create(&alert).expect("create alert");
        assert!(id > 0);

        // Get
        let loaded = store.get(id).expect("get alert");
        assert!(loaded.is_some());
        let loaded = loaded.unwrap();
        assert_eq!(loaded.message, "Test alert");
        assert_eq!(loaded.severity, AlertSeverity::Warning);
        assert_eq!(loaded.state, AlertState::Open);

        // List
        let list = store.list(&AlertQuery::default()).expect("list alerts");
        assert_eq!(list.len(), 1);

        // Update
        let mut updated = loaded.clone();
        updated.acknowledge();
        store.update(&updated).expect("update alert");

        let loaded = store.get(id).expect("get updated");
        assert_eq!(loaded.unwrap().state, AlertState::Acknowledged);

        // Delete
        store.delete(id).expect("delete alert");
        let loaded = store.get(id).expect("get deleted");
        assert!(loaded.is_none());
    }

    #[test]
    fn test_list_with_filters() {
        let store = create_test_store();

        // Create alerts with different severity
        let alert1 = Alert::new(
            "Info alert".to_string(),
            AlertSeverity::Info,
            Some("test".to_string()),
            None,
        );
        let alert2 = Alert::new(
            "Error alert".to_string(),
            AlertSeverity::Error,
            Some("test".to_string()),
            None,
        );

        store.create(&alert1).expect("create info");
        store.create(&alert2).expect("create error");

        // Filter by severity
        let query = AlertQuery {
            state: None,
            severity: Some(AlertSeverity::Error),
            workspace_id: None,
            limit: None,
        };
        let list = store.list(&query).expect("list errors");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].severity, AlertSeverity::Error);
    }

    #[test]
    fn test_delete_nonexistent() {
        let store = create_test_store();
        let result = store.delete(9999);
        assert!(result.is_err());
    }

    #[test]
    fn test_update_nonexistent() {
        let store = create_test_store();
        let alert = Alert::new(
            "Test".to_string(),
            AlertSeverity::Info,
            None,
            None,
        );
        let result = store.update(&alert);
        assert!(result.is_err());
    }
}
