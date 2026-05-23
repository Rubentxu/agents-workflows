//! Artifact MCP Handler
//!
//! Handles artifact-related tool calls.

use crate::state::AppState;
use crate::types::*;
use crate::metrics_sse::MetricsBroadcaster;
use artifact::domain::{Artifact as DomainArtifact, StorageType, ContentType as DomainContentType};
use registry::Arn;
use rusqlite::{params_from_iter, ToSql};
use std::sync::Arc;

pub struct ArtifactMcpHandler {
    state: Arc<AppState>,
}

impl ArtifactMcpHandler {
    pub fn new(state: Arc<AppState>, _broadcaster: Arc<MetricsBroadcaster>) -> Self {
        Self { state }
    }

    pub async fn artifact_create(&self, params: ArtifactCreateParams) -> Result<Artifact, String> {
        let timestamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
        let workspace_id = Arn::parse(&params.execution_arn)
            .and_then(|arn| arn.workspace_id())
            .unwrap_or_else(|| "ws1".to_string());
        let arn = format!(
            "arn:local:workspace/{}:artifact/{}",
            workspace_id,
            timestamp
        );

        let content_bytes = params.content.as_bytes();
        let size = content_bytes.len() as u64;

        let domain_artifact = DomainArtifact {
            id: arn.clone(),
            execution_id: Some(params.execution_arn.clone()),
            stage_id: params.stage_id.clone(),
            name: params.name.clone(),
            size,
            storage_type: StorageType::Sqlite,
            location: String::new(),
            content_type: DomainContentType::from_extension(&params.content_type),
            checksum: String::new(),
            created_at: chrono::Utc::now(),
        };

        let stored_artifact = self.state.artifact_service
            .store(domain_artifact, content_bytes)
            .map_err(|e| format!("Failed to store artifact: {}", e))?;

        let conn = self.state.db.connection()
            .map_err(|e| format!("DB error: {}", e))?;
        // Disable FK checks for this insert — execution may not exist yet
        conn.execute_batch("PRAGMA foreign_keys = OFF").ok();
        conn.execute(
            "INSERT INTO artifacts (id, execution_id, stage_id, name, size, storage_type, location, content_type, checksum, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                stored_artifact.id,
                stored_artifact.execution_id,
                stored_artifact.stage_id,
                stored_artifact.name,
                stored_artifact.size as i64,
                format!("{:?}", stored_artifact.storage_type).to_lowercase(),
                stored_artifact.location,
                format!("{:?}", stored_artifact.content_type).to_lowercase(),
                stored_artifact.checksum,
                stored_artifact.created_at.to_rfc3339(),
            ],
        ).map_err(|e| format!("Failed to persist artifact metadata: {}", e))?;

        let content = if stored_artifact.storage_type == StorageType::Sqlite {
            params.content.clone()
        } else {
            String::new()
        };

        Ok(Artifact {
            arn: stored_artifact.id,
            execution_arn: params.execution_arn,
            stage_id: params.stage_id,
            name: stored_artifact.name,
            content,
            content_type: params.content_type,
            size: stored_artifact.size as i64,
        })
    }

    pub async fn artifact_get(&self, params: GetByArnParams) -> Result<Artifact, String> {
        let (execution_id, stage_id, name, storage_type, location, content_type, size) = {
            let conn = self.state.db.connection()
                .map_err(|e| format!("DB error: {}", e))?;
            conn.query_row(
                "SELECT execution_id, stage_id, name, storage_type, location, content_type, size FROM artifacts WHERE id = ?1",
                [&params.arn],
                |row| Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, i64>(6)?,
                )),
            ).map_err(|e| {
                if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                    format!("Artifact not found: {}", params.arn)
                } else {
                    format!("DB error: {}", e)
                }
            })?
        };

        let domain_artifact = DomainArtifact {
            id: params.arn.clone(),
            execution_id: execution_id.clone(),
            stage_id: stage_id.clone(),
            name: name.clone(),
            size: size as u64,
            storage_type: if storage_type == "sqlite" { StorageType::Sqlite } else { StorageType::Filesystem },
            location: location.clone(),
            content_type: DomainContentType::from_extension(&content_type.clone().unwrap_or_default()),
            checksum: String::new(),
            created_at: chrono::Utc::now(),
        };

        let content_bytes = self.state.artifact_service
            .retrieve(&domain_artifact)
            .map_err(|e| format!("Failed to retrieve artifact: {}", e))?;
        let content = String::from_utf8_lossy(&content_bytes).to_string();

        Ok(Artifact {
            arn: params.arn,
            execution_arn: execution_id.unwrap_or_default(),
            stage_id,
            name,
            content,
            content_type: content_type.unwrap_or_else(|| "application/octet-stream".to_string()),
            size,
        })
    }

    pub async fn artifact_list(&self, params: ArtifactListParams) -> Result<Vec<ArtifactSummary>, String> {
        let conn = self.state.db.connection()
            .map_err(|e| format!("DB error: {}", e))?;

        let mut sql = String::from("SELECT id, execution_id, stage_id, name, size FROM artifacts WHERE 1=1");
        let mut bind_params: Vec<&dyn ToSql> = Vec::new();

        if let Some(execution_arn) = params.execution_arn.as_ref() {
            sql.push_str(" AND execution_id = ?");
            bind_params.push(execution_arn as &dyn ToSql);
        }
        if let Some(stage_id) = params.stage_id.as_ref() {
            sql.push_str(" AND stage_id = ?");
            bind_params.push(stage_id as &dyn ToSql);
        }
        sql.push_str(" ORDER BY created_at DESC");

        let limit = params.limit.unwrap_or(20);
        sql.push_str(&format!(" LIMIT {}", limit));

        let mut stmt = conn.prepare(&sql)
            .map_err(|e| format!("Prepare error: {}", e))?;

        let artifacts = stmt.query_map(params_from_iter(bind_params), |row| {
                Ok(ArtifactSummary {
                    arn: row.get(0)?,
                    execution_arn: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    stage_id: row.get(2)?,
                    name: row.get(3)?,
                    size: row.get(4)?,
                })
            }).map_err(|e| format!("Query error: {}", e))?;

        Ok(artifacts.filter_map(|r| r.ok()).collect())
    }
}
