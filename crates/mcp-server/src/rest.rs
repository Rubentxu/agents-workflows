//! REST API Router
//!
//! Provides CRUD operations for all resources via HTTP/JSON.

use axum::{
    extract::State,
    middleware,
    routing::{get, post, put, delete},
    Router,
    Json,
};
use std::sync::Arc;
use tower_http::cors::CorsLayer;

use crate::auth::auth_middleware;

use crate::rest_handlers::*;
use crate::state::AppState;
use registry::domain::NodeType;
use registry::infrastructure::db::Database;

/// App state for REST API — holds references to all backend services
#[derive(Clone)]
pub struct RestState {
    pub(crate) app_state: Arc<AppState>,
    pub started_at: std::time::Instant,
}

impl RestState {
    pub fn new(app_state: Arc<AppState>) -> Self {
        Self {
            app_state,
            started_at: std::time::Instant::now(),
        }
    }

    /// Access the database connection pool
    pub fn db(&self) -> &Arc<Database> {
        &self.app_state.db
    }

    /// List nodes by type
    pub fn list_by_type(&self, node_type: &str) -> Vec<registry::domain::Node> {
        let nt = match node_type.to_lowercase().as_str() {
            "workflow" => NodeType::Workflow,
            "agent" => NodeType::Agent,
            "skill" => NodeType::Skill,
            "tool" => NodeType::Tool,
            "prompt" => NodeType::Prompt,
            _ => return vec![],
        };
        self.app_state.node_service.list_by_type(nt).unwrap_or_default()
    }

    /// Get a node by ARN
    pub fn get_node(&self, arn: &str) -> Option<registry::domain::Node> {
        self.app_state.node_service.get(arn).ok().flatten()
    }

    /// Save (create or update) a node — tries create, falls back to update
    pub fn save_node(&self, node: registry::domain::Node) -> Result<registry::domain::Node, String> {
        // Try create first; if it already exists (conflict), update instead
        match self.app_state.node_service.create(node.clone()) {
            Ok(n) => Ok(n),
            Err(_) => self.app_state.node_service.update(node).map_err(|e| e.to_string()),
        }
    }

    /// Delete a node by ARN. Returns true if a node was deleted, false if it didn't exist.
    pub fn delete_node(&self, arn: &str) -> Result<bool, String> {
        self.app_state.node_service.delete(arn).map_err(|e| e.to_string())?;
        // Check if we actually deleted something by verifying the node is gone
        Ok(self.app_state.node_service.get(arn).ok().flatten().is_none())
    }
}

pub fn create_rest_router(state: RestState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    // Inner router: all routes at root of this sub-router
    let api_router = Router::new()
        // Health
        .route("/health", get(health_check))

        // Workspaces
        .route("/workspaces", get(list_workspaces))
        .route("/workspaces", post(create_workspace))
        .route("/workspaces/:id", get(get_workspace))
        .route("/workspaces/:id", delete(delete_workspace))

        // Workflows
        .route("/workflows", get(list_workflows))
        .route("/workflows", post(create_workflow))
        .route("/workflows/:arn", get(get_workflow))
        .route("/workflows/:arn", put(update_workflow))
        .route("/workflows/:arn", delete(delete_workflow))

        // Agents
        .route("/agents", get(list_agents))
        .route("/agents", post(create_agent))
        .route("/agents/:arn", get(get_agent))
        .route("/agents/:arn", put(update_agent))
        .route("/agents/:arn", delete(delete_agent))

        // Skills
        .route("/skills", get(list_skills))
        .route("/skills", post(create_skill))
        .route("/skills/:arn", get(get_skill))
        .route("/skills/:arn", put(update_skill))
        .route("/skills/:arn", delete(delete_skill))

        // Prompts
        .route("/prompts", get(list_prompts))
        .route("/prompts", post(create_prompt))
        .route("/prompts/:arn", get(get_prompt))
        .route("/prompts/:arn", put(update_prompt))
        .route("/prompts/:arn", delete(delete_prompt))

        // Executions
        .route("/executions", get(list_executions))
        .route("/executions/:arn", get(get_execution))
        .route("/executions/:arn/pause", post(pause_execution))
        .route("/executions/:arn/resume", post(resume_execution))
        .route("/executions/:arn/abort", post(abort_execution))

        // Artifacts
        .route("/artifacts", get(list_artifacts))
        .route("/artifacts/:arn", get(get_artifact))
        .route("/artifacts/:arn", delete(delete_artifact))
        .route("/artifacts/:arn/download", get(download_artifact))

        // Insights
        .route("/insights", get(query_insights))

        // Alerts
        .route("/alerts", get(list_alerts))
        .route("/alerts", post(create_alert))
        .route("/alerts/:id", put(update_alert))

        // Metrics
        .route("/metrics", get(get_metrics))

        // Config
        .route("/config", get(get_config))
        .route("/config", put(update_config))

        .layer(cors)
        .layer(middleware::from_fn(auth_middleware))
        .with_state(state);

    // Outer router: mount inner router under /api to match spec
    Router::new().nest("/api", api_router)
}

// Health check
async fn health_check(State(state): State<RestState>) -> Json<serde_json::Value> {
    let uptime_secs = state.started_at.elapsed().as_secs();
    Json(serde_json::json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_seconds": uptime_secs,
    }))
}
