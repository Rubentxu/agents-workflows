//! Workspace persistence store
//!
//! SQLite implementation of the WorkspaceRepository trait.

use registry::domain::{RegistryError, RegistryResult, Workspace, WorkspaceRepository, WorkspaceStats};
use registry::infrastructure::db::Database;
use std::sync::Arc;

/// SQLite implementation of WorkspaceRepository
pub struct WorkspaceStore {
    db: Arc<Database>,
}

impl WorkspaceStore {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }
}

impl WorkspaceRepository for WorkspaceStore {
    fn list(&self) -> RegistryResult<Vec<Workspace>> {
        let conn = self.db.connection().map_err(|e| RegistryError::DatabaseError(e))?;
        let mut stmt = conn
            .prepare("SELECT id, name, description, created_at, updated_at FROM workspaces ORDER BY created_at DESC")
            .map_err(|e| RegistryError::DatabaseError(e))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Workspace {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(|e| RegistryError::DatabaseError(e))?;

        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    fn get(&self, id: &str) -> RegistryResult<Option<Workspace>> {
        let conn = self.db.connection().map_err(|e| RegistryError::DatabaseError(e))?;
        let mut stmt = conn
            .prepare("SELECT id, name, description, created_at, updated_at FROM workspaces WHERE id = ?1")
            .map_err(|e| RegistryError::DatabaseError(e))?;

        let row = stmt.query_row([id], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        });

        match row {
            Ok(ws) => Ok(Some(ws)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(RegistryError::DatabaseError(e)),
        }
    }

    fn create(&self, workspace: &Workspace) -> RegistryResult<()> {
        let conn = self.db.connection().map_err(|e| RegistryError::DatabaseError(e))?;
        conn.execute(
            "INSERT INTO workspaces (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![workspace.id, workspace.name, workspace.description, workspace.created_at, workspace.updated_at],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE constraint failed") {
                RegistryError::WorkspaceError(format!("Workspace '{}' already exists", workspace.id))
            } else {
                RegistryError::DatabaseError(e)
            }
        })?;
        Ok(())
    }

    fn update(&self, workspace: &Workspace) -> RegistryResult<()> {
        let conn = self.db.connection().map_err(|e| RegistryError::DatabaseError(e))?;
        let updated = conn
            .execute(
                "UPDATE workspaces SET name = ?1, description = ?2, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![workspace.name, workspace.description, workspace.updated_at, workspace.id],
            )
            .map_err(|e| RegistryError::DatabaseError(e))?;

        if updated == 0 {
            return Err(RegistryError::WorkspaceNotFound(workspace.id.clone()));
        }
        Ok(())
    }

    fn delete(&self, id: &str) -> RegistryResult<()> {
        let conn = self.db.connection().map_err(|e| RegistryError::DatabaseError(e))?;
        let deleted = conn
            .execute("DELETE FROM workspaces WHERE id = ?1", [id])
            .map_err(|e| RegistryError::DatabaseError(e))?;

        if deleted == 0 {
            return Err(RegistryError::WorkspaceNotFound(id.to_string()));
        }
        Ok(())
    }

    fn stats(&self, id: &str) -> RegistryResult<WorkspaceStats> {
        let conn = self.db.connection().map_err(|e| RegistryError::DatabaseError(e))?;

        // Check workspace exists
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM workspaces WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .map_err(|e| RegistryError::DatabaseError(e))?;

        if !exists {
            return Err(RegistryError::WorkspaceNotFound(id.to_string()));
        }

        // Get execution count and last execution
        let (executions_count, last_execution): (i64, Option<String>) = conn
            .query_row(
                "SELECT COUNT(*), MAX(started_at) FROM executions WHERE workspace_id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| RegistryError::DatabaseError(e))?;

        // Get artifacts count
        let artifacts_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM artifacts WHERE execution_id IN (SELECT id FROM executions WHERE workspace_id = ?1)",
                [id],
                |row| row.get(0),
            )
            .map_err(|e| RegistryError::DatabaseError(e))?;

        Ok(WorkspaceStats {
            executions_count,
            artifacts_count,
            last_execution,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use registry::domain::WorkspaceRepository;

    fn create_test_store() -> (WorkspaceStore, Arc<Database>) {
        let db = Arc::new(Database::open_in_memory().expect("in-memory db"));
        // Disable foreign keys for testing since we don't have valid references
        {
            let conn = db.connection().expect("db connection");
            conn.execute_batch("PRAGMA foreign_keys=OFF;").expect("disable foreign keys");
        }
        let store = WorkspaceStore::new(db.clone());
        (store, db)
    }

    #[test]
    fn test_workspace_crud() {
        let (store, _db) = create_test_store();

        // Create
        let workspace = Workspace::new(
            "test-workspace".to_string(),
            "Test Workspace".to_string(),
            Some("A test workspace".to_string()),
        );
        store.create(&workspace).expect("create workspace");

        // Get
        let loaded = store.get("test-workspace").expect("get workspace");
        assert!(loaded.is_some());
        let loaded = loaded.unwrap();
        assert_eq!(loaded.name, "Test Workspace");
        assert_eq!(loaded.description.as_deref(), Some("A test workspace"));

        // List
        let list = store.list().expect("list workspaces");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "test-workspace");

        // Update
        let mut updated = workspace.clone();
        updated.name = "Updated Name".to_string();
        store.update(&updated).expect("update workspace");

        let loaded = store.get("test-workspace").expect("get updated");
        assert_eq!(loaded.unwrap().name, "Updated Name");

        // Delete
        store.delete("test-workspace").expect("delete workspace");
        let loaded = store.get("test-workspace").expect("get deleted");
        assert!(loaded.is_none());
    }

    #[test]
    fn test_workspace_not_found() {
        let (store, _db) = create_test_store();
        let result = store.get("nonexistent");
        assert!(result.expect("result").is_none());

        let result = store.delete("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_workspace_stats() {
        let (store, db) = create_test_store();

        // Create workspace
        let workspace = Workspace::new(
            "stats-workspace".to_string(),
            "Stats Workspace".to_string(),
            None,
        );
        store.create(&workspace).expect("create workspace");

        // Get stats (no executions/artifacts yet)
        let stats = store.stats("stats-workspace").expect("get stats");
        assert_eq!(stats.executions_count, 0);
        assert_eq!(stats.artifacts_count, 0);
        assert!(stats.last_execution.is_none());

        // Add a mock execution via raw SQL (for testing stats)
        {
            let conn = db.connection().expect("db connection");
            conn.execute(
                "INSERT INTO executions (id, workflow_id, workspace_id, status, started_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params!["exec-1", "workflow-1", "stats-workspace", "completed", "2026-05-24T10:00:00Z"],
            ).expect("insert execution");
        }

        let stats = store.stats("stats-workspace").expect("get stats after insert");
        assert_eq!(stats.executions_count, 1);
        assert!(stats.last_execution.is_some());
    }

    #[test]
    fn test_workspace_duplicate_id() {
        let (store, _db) = create_test_store();

        let workspace = Workspace::new(
            "dup-workspace".to_string(),
            "First".to_string(),
            None,
        );
        store.create(&workspace).expect("first create");

        let workspace2 = Workspace::new(
            "dup-workspace".to_string(),
            "Second".to_string(),
            None,
        );
        let result = store.create(&workspace2);
        assert!(result.is_err());
    }
}
