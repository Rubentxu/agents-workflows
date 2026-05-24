//! Artifact metadata persistence store
//!
//! SQLite implementation of the ArtifactRepository trait.
//! Owns persistence for artifact metadata records so REST handlers and
//! AppState do not need to issue raw SQL directly for artifact CRUD.
//!
//! This store provides two interfaces:
//! - ArtifactRepository trait (domain types) - for new code using DDD patterns
//! - Direct methods returning JSON - for backward compatibility with existing handlers

use artifact::domain::{
    Artifact, ArtifactError, ArtifactRepository, ArtifactResult,
    ContentType, StorageType,
};
use registry::infrastructure::db::Database;
use std::sync::Arc;

/// SQLite implementation of ArtifactRepository
pub struct ArtifactStore {
    db: Arc<Database>,
}

impl ArtifactStore {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// List recent artifacts (backward compatible JSON interface)
    pub fn list(&self, limit: usize) -> Result<Vec<serde_json::Value>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let limit = if limit == 0 { 50 } else { limit };
        let mut stmt = conn
            .prepare(
                "SELECT id, execution_id, stage_id, name, size, storage_type, content_type, created_at FROM artifacts ORDER BY created_at DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([limit], |row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "execution_id": row.get::<_, Option<String>>(1)?,
                    "stage_id": row.get::<_, Option<String>>(2)?,
                    "name": row.get::<_, String>(3)?,
                    "size": row.get::<_, i64>(4)?,
                    "storage_type": row.get::<_, String>(5)?,
                    "content_type": row.get::<_, Option<String>>(6)?,
                    "created_at": row.get::<_, String>(7)?,
                }))
            })
            .map_err(|e| e.to_string())?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Get a single artifact by ID (backward compatible JSON interface)
    pub fn get(&self, id: &str) -> Result<Option<serde_json::Value>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, execution_id, stage_id, name, size, storage_type, location, content_type, checksum, created_at FROM artifacts WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let row = stmt.query_row([id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "execution_id": row.get::<_, Option<String>>(1)?,
                "stage_id": row.get::<_, Option<String>>(2)?,
                "name": row.get::<_, String>(3)?,
                "size": row.get::<_, i64>(4)?,
                "storage_type": row.get::<_, String>(5)?,
                "location": row.get::<_, String>(6)?,
                "content_type": row.get::<_, Option<String>>(7)?,
                "checksum": row.get::<_, Option<String>>(8)?,
                "created_at": row.get::<_, String>(9)?,
            }))
        });
        match row {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    /// Delete an artifact by ID (backward compatible interface)
    pub fn delete(&self, id: &str) -> Result<bool, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let deleted = conn
            .execute("DELETE FROM artifacts WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(deleted > 0)
    }

    /// Get artifact location (filesystem path) by ID
    pub fn get_location(&self, id: &str) -> Result<Option<String>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let row = conn.query_row(
            "SELECT location FROM artifacts WHERE id = ?1",
            [id],
            |row| row.get(0),
        );
        match row {
            Ok(loc) => Ok(Some(loc)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    /// Get storage metadata for download: (storage_type, location, content_type, name)
    pub fn get_download_info(
        &self,
        id: &str,
    ) -> Result<Option<(String, String, String, Option<String>)>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let row = conn.query_row(
            "SELECT storage_type, location, content_type, name FROM artifacts WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?
                        .unwrap_or_else(|| "application/octet-stream".to_string()),
                    row.get::<_, Option<String>>(3)?,
                ))
            },
        );
        match row {
            Ok(info) => Ok(Some(info)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    /// Get storage type and location for deletion purposes
    pub fn get_storage_info(&self, id: &str) -> Result<Option<(String, String)>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let row = conn.query_row(
            "SELECT storage_type, location FROM artifacts WHERE id = ?1",
            [id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        );
        match row {
            Ok(info) => Ok(Some(info)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
}

impl ArtifactRepository for ArtifactStore {
    fn list(&self, limit: usize) -> ArtifactResult<Vec<Artifact>> {
        let json_list = self.list(limit).map_err(|e| ArtifactError::RepositoryError(e))?;
        let mut artifacts = Vec::new();
        for json in json_list {
            if let Ok(artifact) = json_to_artifact(&json, false) {
                artifacts.push(artifact);
            }
        }
        Ok(artifacts)
    }

    fn get(&self, id: &str) -> ArtifactResult<Option<Artifact>> {
        match self.get(id).map_err(|e| ArtifactError::RepositoryError(e))? {
            Some(json) => {
                let artifact = json_to_artifact(&json, true)?;
                Ok(Some(artifact))
            }
            None => Ok(None),
        }
    }

    fn delete(&self, id: &str) -> ArtifactResult<bool> {
        self.delete(id)
            .map_err(|e| ArtifactError::RepositoryError(e))
    }

    fn get_location(&self, id: &str) -> ArtifactResult<Option<String>> {
        self.get_location(id)
            .map_err(|e| ArtifactError::RepositoryError(e))
    }

    fn get_download_info(
        &self,
        id: &str,
    ) -> ArtifactResult<Option<(String, String, String, Option<String>)>> {
        self.get_download_info(id)
            .map_err(|e| ArtifactError::RepositoryError(e))
    }

    fn get_storage_info(&self, id: &str) -> ArtifactResult<Option<(String, String)>> {
        self.get_storage_info(id)
            .map_err(|e| ArtifactError::RepositoryError(e))
    }
}

/// Helper to convert JSON value to domain Artifact
fn json_to_artifact(json: &serde_json::Value, include_location: bool) -> ArtifactResult<Artifact> {
    let storage_type_str = json
        .get("storage_type")
        .and_then(|v| v.as_str())
        .unwrap_or("sqlite");

    let content_type_str = json
        .get("content_type")
        .and_then(|v| v.as_str())
        .unwrap_or("text");

    let created_at_str = json
        .get("created_at")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    let created_at = chrono::DateTime::parse_from_rfc3339(created_at_str)
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .unwrap_or_else(|_| chrono::Utc::now());

    let storage_type = match storage_type_str {
        "filesystem" => StorageType::Filesystem,
        _ => StorageType::Sqlite,
    };

    let content_type = match content_type_str {
        "markdown" => ContentType::Markdown,
        "text" => ContentType::Text,
        "json" => ContentType::Json,
        "code" => ContentType::Code,
        _ => ContentType::Binary,
    };

    let location = if include_location {
        json.get("location").and_then(|v| v.as_str()).unwrap_or_default().to_string()
    } else {
        String::new()
    };

    Ok(Artifact {
        id: json.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        execution_id: json.get("execution_id").and_then(|v| v.as_str()).map(String::from),
        stage_id: json.get("stage_id").and_then(|v| v.as_str()).map(String::from),
        name: json.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        size: json.get("size").and_then(|v| v.as_i64()).unwrap_or(0) as u64,
        storage_type,
        location,
        content_type,
        checksum: json.get("checksum").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        created_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use artifact::domain::ArtifactRepository;
    use tempfile::TempDir;

    fn create_test_store() -> (ArtifactStore, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let db = Arc::new(Database::open(db_path.to_str().unwrap()).unwrap());
        let store = ArtifactStore::new(db);
        (store, temp_dir)
    }

    #[test]
    fn test_list_empty() {
        let (store, _temp) = create_test_store();
        let result = store.list(10);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_get_not_found() {
        let (store, _temp) = create_test_store();
        let result = store.get("nonexistent");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_delete_not_found() {
        let (store, _temp) = create_test_store();
        let result = store.delete("nonexistent");
        assert!(result.is_ok());
        assert!(!result.unwrap());
    }

    #[test]
    fn test_get_location_not_found() {
        let (store, _temp) = create_test_store();
        let result = store.get_location("nonexistent");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_get_download_info_not_found() {
        let (store, _temp) = create_test_store();
        let result = store.get_download_info("nonexistent");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_get_storage_info_not_found() {
        let (store, _temp) = create_test_store();
        let result = store.get_storage_info("nonexistent");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_insert_and_retrieve_artifact() {
        let (store, _temp) = create_test_store();
        let conn = store.db.connection().unwrap();

        // Insert a test artifact directly
        conn.execute(
            "INSERT INTO artifacts (id, execution_id, stage_id, name, size, storage_type, location, content_type, checksum, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                "arn:local:workspace/test:artifact/test1",
                "exec-123",
                "stage-1",
                "test_artifact.txt",
                1024i64,
                "sqlite",
                r#""test content""#,
                "text",
                "abc123",
                chrono::Utc::now().to_rfc3339(),
            ],
        )
        .unwrap();

        // Test get (JSON interface)
        let result = store.get("arn:local:workspace/test:artifact/test1");
        assert!(result.is_ok());
        let json_val = result.unwrap().unwrap();
        assert_eq!(json_val.get("name").and_then(|v| v.as_str()), Some("test_artifact.txt"));

        // Test list (JSON interface)
        let result = store.list(10);
        assert!(result.is_ok());
        let artifacts = result.unwrap();
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0].get("name").and_then(|v| v.as_str()), Some("test_artifact.txt"));

        // Test get via trait (domain interface)
        let result = store.get("arn:local:workspace/test:artifact/test1");
        assert!(result.is_ok());
        let json_val = result.unwrap().unwrap();
        assert_eq!(json_val.get("name").and_then(|v| v.as_str()), Some("test_artifact.txt"));

        // Test list via trait (domain interface)
        let result = ArtifactRepository::list(&store, 10);
        assert!(result.is_ok());
        let artifacts = result.unwrap();
        assert_eq!(artifacts.len(), 1);
        assert_eq!(artifacts[0].name, "test_artifact.txt");
        assert_eq!(artifacts[0].size, 1024);

        // Test get_location
        let result = store.get_location("arn:local:workspace/test:artifact/test1");
        assert!(result.is_ok());
        assert!(result.unwrap().is_some());

        // Test get_download_info
        let result = store.get_download_info("arn:local:workspace/test:artifact/test1");
        assert!(result.is_ok());
        let info = result.unwrap().unwrap();
        assert_eq!(info.0, "sqlite");
        assert_eq!(info.3, Some("test_artifact.txt".to_string()));

        // Test get_storage_info
        let result = store.get_storage_info("arn:local:workspace:test:artifact/test1");
        assert!(result.is_ok());
        let info = result.unwrap().unwrap();
        assert_eq!(info.0, "sqlite");

        // Test delete
        let result = store.delete("arn:local:workspace:test:artifact/test1");
        assert!(result.is_ok());
        assert!(result.unwrap()); // deleted

        // Verify deleted
        let result = store.get("arn:local:workspace:test:artifact/test1");
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_list_respects_limit() {
        let (store, _temp) = create_test_store();
        let conn = store.db.connection().unwrap();

        // Insert 5 artifacts
        for i in 0..5 {
            conn.execute(
                "INSERT INTO artifacts (id, name, size, storage_type, location, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    format!("arn:local:workspace:test:artifact/{}", i),
                    format!("artifact_{}.txt", i),
                    100i64,
                    "sqlite",
                    "\"content\"",
                    chrono::Utc::now().to_rfc3339(),
                ],
            )
            .unwrap();
        }

        // Test limit
        let result = store.list(3);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 3);

        // Test zero limit uses default
        let result = store.list(0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 5); // default 50, but only 5 exist
    }
}