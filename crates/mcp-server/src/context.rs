//! Focused Context Structs for DDD-aligned decomposition
//!
//! These contexts group related services following DDD bounded context principles:
//! - RegistryContext: Node service, database, workspace repository
//! - ExecutionContext: Execution store, artifact service, artifact repository
//! - InsightsContext: Insights repository, analytics service
//! - MetricsContext: Alert repository
//!
//! Dead fields removed:
//! - `sse_emitter` — SSE broadcasting via MetricsBroadcaster externally
//! - `metrics_aggregator` — never used by any handler

use std::sync::Arc;
use registry::application::node_service::NodeService;
use registry::domain::WorkspaceRepository;
use registry::infrastructure::db::Database;
use artifact::application::artifact_service::ArtifactService;
use artifact::domain::ArtifactRepository;
use insights::domain::InsightsRepository;
use insights::analytics::AnalyticsService;
use metrics::domain::AlertRepository;

use crate::artifact_store::ArtifactStore;
use crate::execution_store::ExecutionStore;
use crate::workspace_store::WorkspaceStore;
use crate::insights_store::InsightsStore;
use crate::alert_store::AlertStore;

/// Registry Context - Node registry and workspace management
pub struct RegistryContext {
    pub node_service: Arc<NodeService>,
    pub db: Arc<Database>,
    pub workspace_repository: Arc<dyn WorkspaceRepository>,
}

impl RegistryContext {
    pub fn new(db: Arc<Database>) -> Self {
        let repository = registry::infrastructure::node_repository::SqliteNodeRepository::new(db.clone());
        let node_service = Arc::new(NodeService::new(Arc::new(repository)));
        let workspace_repository: Arc<dyn WorkspaceRepository> = Arc::new(WorkspaceStore::new(db.clone()));

        Self {
            node_service,
            db,
            workspace_repository,
        }
    }
}

/// Execution Context - Workflow execution and artifact management
pub struct ExecutionContext {
    pub execution_store: Arc<ExecutionStore>,
    pub artifact_service: Arc<ArtifactService>,
    pub artifact_store: Arc<ArtifactStore>,
    pub artifact_repository: Arc<dyn ArtifactRepository>,
}

impl ExecutionContext {
    pub fn new(db: Arc<Database>, artifacts_dir: std::path::PathBuf) -> Self {
        let execution_store = Arc::new(ExecutionStore::new(db.clone()));
        let artifact_service = Arc::new(ArtifactService::new(artifacts_dir));
        let artifact_store = Arc::new(ArtifactStore::new(db.clone()));
        let artifact_repository: Arc<dyn ArtifactRepository> = artifact_store.clone();

        Self {
            execution_store,
            artifact_service,
            artifact_store,
            artifact_repository,
        }
    }
}

/// Insights Context - Analytics and insights logging
pub struct InsightsContext {
    pub insights_repository: Arc<dyn InsightsRepository>,
    pub analytics_service: Arc<AnalyticsService>,
}

impl InsightsContext {
    pub fn new(db: Arc<Database>) -> Self {
        let insights_repository: Arc<dyn InsightsRepository> = Arc::new(InsightsStore::new(db.clone()));
        let analytics_service = Arc::new(AnalyticsService::new());

        Self {
            insights_repository,
            analytics_service,
        }
    }
}

/// Metrics Context - Alert management
pub struct MetricsContext {
    pub alert_repository: Arc<dyn AlertRepository>,
}

impl MetricsContext {
    pub fn new(db: Arc<Database>) -> Self {
        let alert_repository: Arc<dyn AlertRepository> = Arc::new(AlertStore::new(db.clone()));

        Self {
            alert_repository,
        }
    }
}
