//! SQLite implementation of NodeRepository

use crate::domain::{Node, NodeType, RegistryResult};
use crate::infrastructure::db::Database;
use rusqlite::{params, OptionalExtension};

pub use crate::infrastructure::db::NodeRepository;

pub struct SqliteNodeRepository {
    db: std::sync::Arc<Database>,
}

impl SqliteNodeRepository {
    pub fn new(db: std::sync::Arc<Database>) -> Self {
        Self { db }
    }
}

impl NodeRepository for SqliteNodeRepository {
    fn save(&self, node: Node) -> RegistryResult<Node> {
        let conn = self.db.connection()?;
        conn.execute(
            r#"
            INSERT INTO nodes (id, type, name, scope, registry, namespace, path, checksum, config_json, metadata_json, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(id) DO UPDATE SET
                type = excluded.type,
                name = excluded.name,
                scope = excluded.scope,
                registry = excluded.registry,
                namespace = excluded.namespace,
                path = excluded.path,
                checksum = excluded.checksum,
                config_json = excluded.config_json,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at
            "#,
            params![
                node.id,
                node.node_type.as_str(),
                node.name,
                node.scope,
                node.registry,
                node.namespace,
                node.path,
                node.checksum,
                node.config_json,
                node.metadata_json,
                node.created_at.to_rfc3339(),
                node.updated_at.to_rfc3339(),
            ],
        )?;
        Ok(node)
    }

    fn find_by_id(&self, id: &str) -> RegistryResult<Option<Node>> {
        let conn = self.db.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, type, name, scope, registry, namespace, path, checksum, config_json, metadata_json, created_at, updated_at FROM nodes WHERE id = ?1"
        )?;

        let node = stmt.query_row(params![id], |row| {
            Ok(Node {
                id: row.get(0)?,
                node_type: NodeType::from_str(&row.get::<_, String>(1)?).unwrap_or(NodeType::Workflow),
                name: row.get(2)?,
                scope: row.get(3)?,
                registry: row.get(4)?,
                namespace: row.get(5)?,
                path: row.get(6)?,
                checksum: row.get(7)?,
                config_json: row.get(8)?,
                metadata_json: row.get(9)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?).unwrap_or_default().with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?).unwrap_or_default().with_timezone(&chrono::Utc),
            })
        }).optional()?;

        Ok(node)
    }

    fn find_all(&self) -> RegistryResult<Vec<Node>> {
        let conn = self.db.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, type, name, scope, registry, namespace, path, checksum, config_json, metadata_json, created_at, updated_at FROM nodes"
        )?;

        let nodes = stmt.query_map([], |row| {
            Ok(Node {
                id: row.get(0)?,
                node_type: NodeType::from_str(&row.get::<_, String>(1)?).unwrap_or(NodeType::Workflow),
                name: row.get(2)?,
                scope: row.get(3)?,
                registry: row.get(4)?,
                namespace: row.get(5)?,
                path: row.get(6)?,
                checksum: row.get(7)?,
                config_json: row.get(8)?,
                metadata_json: row.get(9)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?).unwrap_or_default().with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?).unwrap_or_default().with_timezone(&chrono::Utc),
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(nodes)
    }

    fn find_by_type(&self, node_type: NodeType) -> RegistryResult<Vec<Node>> {
        let conn = self.db.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, type, name, scope, registry, namespace, path, checksum, config_json, metadata_json, created_at, updated_at FROM nodes WHERE type = ?1"
        )?;

        let nodes = stmt.query_map(params![node_type.as_str()], |row| {
            Ok(Node {
                id: row.get(0)?,
                node_type: NodeType::from_str(&row.get::<_, String>(1)?).unwrap_or(NodeType::Workflow),
                name: row.get(2)?,
                scope: row.get(3)?,
                registry: row.get(4)?,
                namespace: row.get(5)?,
                path: row.get(6)?,
                checksum: row.get(7)?,
                config_json: row.get(8)?,
                metadata_json: row.get(9)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?).unwrap_or_default().with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?).unwrap_or_default().with_timezone(&chrono::Utc),
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(nodes)
    }

    fn find_by_scope(&self, scope: &str) -> RegistryResult<Vec<Node>> {
        let conn = self.db.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, type, name, scope, registry, namespace, path, checksum, config_json, metadata_json, created_at, updated_at FROM nodes WHERE scope = ?1"
        )?;

        let nodes = stmt.query_map(params![scope], |row| {
            Ok(Node {
                id: row.get(0)?,
                node_type: NodeType::from_str(&row.get::<_, String>(1)?).unwrap_or(NodeType::Workflow),
                name: row.get(2)?,
                scope: row.get(3)?,
                registry: row.get(4)?,
                namespace: row.get(5)?,
                path: row.get(6)?,
                checksum: row.get(7)?,
                config_json: row.get(8)?,
                metadata_json: row.get(9)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?).unwrap_or_default().with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?).unwrap_or_default().with_timezone(&chrono::Utc),
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(nodes)
    }

    fn find_by_registry(&self, registry: &str) -> RegistryResult<Vec<Node>> {
        let conn = self.db.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, type, name, scope, registry, namespace, path, checksum, config_json, metadata_json, created_at, updated_at FROM nodes WHERE registry = ?1"
        )?;

        let nodes = stmt.query_map(params![registry], |row| {
            Ok(Node {
                id: row.get(0)?,
                node_type: NodeType::from_str(&row.get::<_, String>(1)?).unwrap_or(NodeType::Workflow),
                name: row.get(2)?,
                scope: row.get(3)?,
                registry: row.get(4)?,
                namespace: row.get(5)?,
                path: row.get(6)?,
                checksum: row.get(7)?,
                config_json: row.get(8)?,
                metadata_json: row.get(9)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?).unwrap_or_default().with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?).unwrap_or_default().with_timezone(&chrono::Utc),
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(nodes)
    }

    fn find_by_namespace(&self, namespace: &str) -> RegistryResult<Vec<Node>> {
        let conn = self.db.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, type, name, scope, registry, namespace, path, checksum, config_json, metadata_json, created_at, updated_at FROM nodes WHERE namespace = ?1"
        )?;

        let nodes = stmt.query_map(params![namespace], |row| {
            Ok(Node {
                id: row.get(0)?,
                node_type: NodeType::from_str(&row.get::<_, String>(1)?).unwrap_or(NodeType::Workflow),
                name: row.get(2)?,
                scope: row.get(3)?,
                registry: row.get(4)?,
                namespace: row.get(5)?,
                path: row.get(6)?,
                checksum: row.get(7)?,
                config_json: row.get(8)?,
                metadata_json: row.get(9)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?).unwrap_or_default().with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?).unwrap_or_default().with_timezone(&chrono::Utc),
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(nodes)
    }

    fn search(&self, pattern: &str) -> RegistryResult<Vec<Node>> {
        let conn = self.db.connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, type, name, scope, registry, namespace, path, checksum, config_json, metadata_json, created_at, updated_at FROM nodes WHERE name LIKE ?1"
        )?;

        let pattern = format!("%{}%", pattern);
        let nodes = stmt.query_map(params![pattern], |row| {
            Ok(Node {
                id: row.get(0)?,
                node_type: NodeType::from_str(&row.get::<_, String>(1)?).unwrap_or(NodeType::Workflow),
                name: row.get(2)?,
                scope: row.get(3)?,
                registry: row.get(4)?,
                namespace: row.get(5)?,
                path: row.get(6)?,
                checksum: row.get(7)?,
                config_json: row.get(8)?,
                metadata_json: row.get(9)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(10)?).unwrap_or_default().with_timezone(&chrono::Utc),
                updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?).unwrap_or_default().with_timezone(&chrono::Utc),
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(nodes)
    }

    fn update(&self, node: Node) -> RegistryResult<Node> {
        self.save(node)
    }

    fn delete(&self, id: &str) -> RegistryResult<()> {
        let conn = self.db.connection()?;
        conn.execute("DELETE FROM nodes WHERE id = ?1", params![id])?;
        Ok(())
    }
}