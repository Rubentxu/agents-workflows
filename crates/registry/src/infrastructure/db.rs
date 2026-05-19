//! Database infrastructure - SQLite connection and schema management

use rusqlite::{Connection, Result};
use std::sync::Mutex;

pub struct Database {
    _path: String,
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self {
            _path: path.to_string(),
            connection: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            _path: ":memory:".to_string(),
            connection: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>> {
        Ok(self.connection.lock().unwrap())
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.connection.lock().unwrap();

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                scope TEXT NOT NULL DEFAULT 'global',
                registry TEXT NOT NULL DEFAULT 'local',
                namespace TEXT NOT NULL,
                path TEXT,
                checksum TEXT,
                config_json TEXT,
                metadata_json TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
            CREATE INDEX IF NOT EXISTS idx_nodes_registry ON nodes(registry);
            CREATE INDEX IF NOT EXISTS idx_nodes_namespace ON nodes(namespace);
            CREATE INDEX IF NOT EXISTS idx_nodes_scope ON nodes(scope);

            CREATE TABLE IF NOT EXISTS edges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_id TEXT NOT NULL,
                to_id TEXT NOT NULL,
                relationship_type TEXT NOT NULL,
                metadata_json TEXT,
                UNIQUE(from_id, to_id, relationship_type),
                FOREIGN KEY (from_id) REFERENCES nodes(id),
                FOREIGN KEY (to_id) REFERENCES nodes(id)
            );

            CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
            CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
            CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(relationship_type);

            CREATE TABLE IF NOT EXISTS executions (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                workspace_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                current_stage TEXT,
                completed_stages_json TEXT,
                stage_outputs_json TEXT,
                execution_context_json TEXT,
                triggered_by_json TEXT,
                started_at TEXT,
                completed_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workflow_id) REFERENCES nodes(id)
            );

            CREATE INDEX IF NOT EXISTS idx_exec_workflow ON executions(workflow_id);
            CREATE INDEX IF NOT EXISTS idx_exec_status ON executions(status);
            CREATE INDEX IF NOT EXISTS idx_exec_workspace ON executions(workspace_id);

            CREATE TABLE IF NOT EXISTS artifacts (
                id TEXT PRIMARY KEY,
                execution_id TEXT,
                stage_id TEXT,
                name TEXT NOT NULL,
                size INTEGER NOT NULL,
                storage_type TEXT NOT NULL,
                location TEXT NOT NULL,
                content_type TEXT,
                checksum TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (execution_id) REFERENCES executions(id)
            );

            CREATE INDEX IF NOT EXISTS idx_artifacts_exec ON artifacts(execution_id);
            CREATE INDEX IF NOT EXISTS idx_artifacts_size ON artifacts(size);

            CREATE TABLE IF NOT EXISTS insights (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id TEXT NOT NULL,
                stage_id TEXT,
                insight_type TEXT NOT NULL,
                data_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (execution_id) REFERENCES executions(id)
            );

            CREATE INDEX IF NOT EXISTS idx_insights_exec ON insights(execution_id);
            CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(insight_type);

            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message TEXT NOT NULL,
                severity TEXT NOT NULL DEFAULT 'info',
                state TEXT NOT NULL DEFAULT 'open',
                source TEXT,
                workspace_id TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_alerts_state ON alerts(state);
            CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
            CREATE INDEX IF NOT EXISTS idx_alerts_workspace ON alerts(workspace_id);
            "#,
        )?;

        Ok(())
    }
}

// Repository traits
pub trait NodeRepository: Send + Sync {
    fn save(&self, node: Node) -> RegistryResult<Node>
    where
        Node: Clone,
    {
        let _ = node;
        unimplemented!()
    }

    fn find_by_id(&self, id: &str) -> RegistryResult<Option<Node>>;
    fn find_all(&self) -> RegistryResult<Vec<Node>>;
    fn find_by_type(&self, node_type: NodeType) -> RegistryResult<Vec<Node>>;
    fn find_by_scope(&self, scope: &str) -> RegistryResult<Vec<Node>>;
    fn find_by_registry(&self, registry: &str) -> RegistryResult<Vec<Node>>;
    fn find_by_namespace(&self, namespace: &str) -> RegistryResult<Vec<Node>>;
    fn search(&self, pattern: &str) -> RegistryResult<Vec<Node>>;
    fn update(&self, node: Node) -> RegistryResult<Node>;
    fn delete(&self, id: &str) -> RegistryResult<()>;
}

pub trait EdgeRepository: Send + Sync {
    fn save(&self, edge: Edge) -> RegistryResult<Edge>
    where
        Edge: Clone,
    {
        let _ = edge;
        unimplemented!()
    }

    fn find_by_from(&self, from_id: &str) -> RegistryResult<Vec<Edge>>;
    fn find_by_to(&self, to_id: &str) -> RegistryResult<Vec<Edge>>;
    fn find_by_type(&self, rel_type: RelationshipType) -> RegistryResult<Vec<Edge>>;
    fn delete(&self, from_id: &str, to_id: &str, rel_type: RelationshipType) -> RegistryResult<()>;
}

use crate::domain::{Node, Edge, NodeType, RelationshipType, RegistryResult};