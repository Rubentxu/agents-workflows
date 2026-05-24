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

pub fn create_rest_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let api_router = Router::new()
        .route("/health", get(health_check))

        .route("/workspaces", get(list_workspaces))
        .route("/workspaces", post(create_workspace))
        .route("/workspaces/:id", get(get_workspace))
        .route("/workspaces/:id", delete(delete_workspace))

        .route("/workflows", get(list_workflows))
        .route("/workflows", post(create_workflow))
        .route("/workflows/:arn", get(get_workflow))
        .route("/workflows/:arn", put(update_workflow))
        .route("/workflows/:arn", delete(delete_workflow))

        .route("/agents", get(list_agents))
        .route("/agents", post(create_agent))
        .route("/agents/:arn", get(get_agent))
        .route("/agents/:arn", put(update_agent))
        .route("/agents/:arn", delete(delete_agent))

        .route("/skills", get(list_skills))
        .route("/skills", post(create_skill))
        .route("/skills/:arn", get(get_skill))
        .route("/skills/:arn", put(update_skill))
        .route("/skills/:arn", delete(delete_skill))

        .route("/prompts", get(list_prompts))
        .route("/prompts", post(create_prompt))
        .route("/prompts/:arn", get(get_prompt))
        .route("/prompts/:arn", put(update_prompt))
        .route("/prompts/:arn", delete(delete_prompt))

        .route("/templates", get(list_templates))
        .route("/templates", post(create_template))
        .route("/templates/:arn", get(get_template))
        .route("/templates/:arn", put(update_template))
        .route("/templates/:arn", delete(delete_template))

        .route("/tools", get(list_tools))
        .route("/tools", post(create_tool))
        .route("/tools/:arn", get(get_tool))
        .route("/tools/:arn", put(update_tool))
        .route("/tools/:arn", delete(delete_tool))

        .route("/executions", get(list_executions))
        .route("/executions/:arn", get(get_execution))
        .route("/executions/:arn/pause", post(pause_execution))
        .route("/executions/:arn/resume", post(resume_execution))
        .route("/executions/:arn/abort", post(abort_execution))

        .route("/artifacts", get(list_artifacts))
        .route("/artifacts/:arn", get(get_artifact))
        .route("/artifacts/:arn", delete(delete_artifact))
        .route("/artifacts/:arn/download", get(download_artifact))

        .route("/insights", get(query_insights))

        .route("/alerts", get(list_alerts))
        .route("/alerts", post(create_alert))
        .route("/alerts/:id", put(update_alert))

        .route("/metrics", get(get_metrics))

        .route("/config", get(get_config))
        .route("/config", put(update_config))

        .route("/schemas/:type", get(get_schema))

        .route("/content/:arn", get(get_content))
        .route("/content/:arn", put(put_content))

        .route("/validate/:arn", post(validate_resource))

        .layer(cors)
        .layer(middleware::from_fn(auth_middleware))
        .with_state(state);

    Router::new().nest("/api", api_router)
}

async fn health_check(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let uptime_secs = state.started_at.elapsed().as_secs();
    Json(serde_json::json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_seconds": uptime_secs,
    }))
}
