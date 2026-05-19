//! Artifact metadata persistence seam
//!
//! Owns persistence for artifact metadata records so REST handlers and
//! AppState do not need to issue raw SQL directly for artifact CRUD.

use registry::infrastructure::db::Database;
use std::sync::Arc;

pub struct ArtifactStore {
    db: Arc<Database>,
}

impl ArtifactStore {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// List recent artifacts
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

    /// Get a single artifact by ID (full metadata including location/checksum)
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

    /// Delete an artifact by ID
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
    pub fn get_download_info(&self, id: &str) -> Result<Option<(String, String, String, Option<String>)>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let row = conn.query_row(
            "SELECT storage_type, location, content_type, name FROM artifacts WHERE id = ?1",
            [id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "application/octet-stream".to_string()),
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
