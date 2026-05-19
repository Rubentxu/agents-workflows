//! SQLite implementation of EdgeRepository

use crate::domain::{Edge, RelationshipType, RegistryResult};
use crate::infrastructure::db::Database;
use rusqlite::params;

pub use crate::infrastructure::db::EdgeRepository;

pub struct SqliteEdgeRepository {
    db: std::sync::Arc<Database>,
}

impl SqliteEdgeRepository {
    pub fn new(db: std::sync::Arc<Database>) -> Self {
        Self { db }
    }
}

impl EdgeRepository for SqliteEdgeRepository {
    fn save(&self, edge: Edge) -> RegistryResult<Edge> {
        let conn = self.db.connection()?;
        conn.execute(
            r#"
            INSERT INTO edges (from_id, to_id, relationship_type, metadata_json)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(from_id, to_id, relationship_type) DO UPDATE SET
                metadata_json = excluded.metadata_json
            "#,
            params![
                edge.from_id,
                edge.to_id,
                edge.relationship_type.as_str(),
                edge.metadata_json,
            ],
        )?;
        Ok(edge)
    }

    fn find_by_from(&self, from_id: &str) -> RegistryResult<Vec<Edge>> {
        let conn = self.db.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, from_id, to_id, relationship_type, metadata_json FROM edges WHERE from_id = ?1"
        )?;

        let edges = stmt.query_map(params![from_id], |row| {
            Ok(Edge {
                id: Some(row.get(0)?),
                from_id: row.get(1)?,
                to_id: row.get(2)?,
                relationship_type: RelationshipType::from_str(&row.get::<_, String>(3)?).unwrap_or(RelationshipType::References),
                metadata_json: row.get(4)?,
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(edges)
    }

    fn find_by_to(&self, to_id: &str) -> RegistryResult<Vec<Edge>> {
        let conn = self.db.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, from_id, to_id, relationship_type, metadata_json FROM edges WHERE to_id = ?1"
        )?;

        let edges = stmt.query_map(params![to_id], |row| {
            Ok(Edge {
                id: Some(row.get(0)?),
                from_id: row.get(1)?,
                to_id: row.get(2)?,
                relationship_type: RelationshipType::from_str(&row.get::<_, String>(3)?).unwrap_or(RelationshipType::References),
                metadata_json: row.get(4)?,
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(edges)
    }

    fn find_by_type(&self, rel_type: RelationshipType) -> RegistryResult<Vec<Edge>> {
        let conn = self.db.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, from_id, to_id, relationship_type, metadata_json FROM edges WHERE relationship_type = ?1"
        )?;

        let edges = stmt.query_map(params![rel_type.as_str()], |row| {
            Ok(Edge {
                id: Some(row.get(0)?),
                from_id: row.get(1)?,
                to_id: row.get(2)?,
                relationship_type: RelationshipType::from_str(&row.get::<_, String>(3)?).unwrap_or(RelationshipType::References),
                metadata_json: row.get(4)?,
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(edges)
    }

    fn delete(&self, from_id: &str, to_id: &str, rel_type: RelationshipType) -> RegistryResult<()> {
        let conn = self.db.connection()?;
        conn.execute(
            "DELETE FROM edges WHERE from_id = ?1 AND to_id = ?2 AND relationship_type = ?3",
            params![from_id, to_id, rel_type.as_str()],
        )?;
        Ok(())
    }
}
