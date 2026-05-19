//! REST API Tests using axum ServiceExt
//!
//! Tests all REST endpoints for correct routing and error handling.
//! Uses axum::ServiceExt::oneshot for fast, reliable testing without network.

use axum::{
    body::Body,
    Router,
    extract::Request,
    response::Response,
};
use http::StatusCode;
use serde_json::{json, Value};
use tower::ServiceExt;
use axum::body::to_bytes;
use std::sync::Arc;
use std::path::PathBuf;
use tempfile::TempDir;

// Import from crate
use mcp_server::execution_store::ExecutionStore;
use mcp_server::rest::{create_rest_router, RestState};
use mcp_server::state::AppState;
use registry::application::node_service::NodeService;
use registry::infrastructure::db::Database;
use registry::infrastructure::node_repository::SqliteNodeRepository;
use insights::AnalyticsService;
use metrics::application::{SseEmitter, MetricsAggregator};

// =============================================================================
// Test State Setup
// =============================================================================

fn create_test_rest_state() -> (RestState, TempDir) {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");
    let db = Arc::new(Database::open(db_path.to_str().unwrap()).expect("Failed to open test DB"));
    let repository = Arc::new(SqliteNodeRepository::new(db.clone()));
    let node_service = Arc::new(NodeService::new(repository));
    let execution_store = Arc::new(ExecutionStore::new(db.clone()));
    let artifact_store = Arc::new(mcp_server::artifact_store::ArtifactStore::new(db.clone()));
    let artifact_service = Arc::new(artifact::application::artifact_service::ArtifactService::new(
        PathBuf::from(temp_dir.path().join("artifacts"))
    ));
    let analytics_service = Arc::new(AnalyticsService::new());
    let sse_emitter = Arc::new(SseEmitter::new());
    let metrics_aggregator = Arc::new(MetricsAggregator::new());
    let app_state = Arc::new(AppState { node_service, db, execution_store, artifact_store, artifact_service, analytics_service, sse_emitter, metrics_aggregator });
    let state = RestState::new(app_state);
    (state, temp_dir)
}

fn create_test_router() -> (Router, TempDir) {
    let (state, temp_dir) = create_test_rest_state();
    (create_rest_router(state), temp_dir)
}

// =============================================================================
// Helper Functions
// =============================================================================

/// Make a request to the REST API - all routes are under /api prefix (GAP-001)
async fn make_request(
    app: &Router,
    method: http::Method,
    uri: &str,
) -> Response {
    // All REST routes are now under /api prefix (GAP-001)
    let api_uri = format!("/api{}", uri);
    let req = Request::builder()
        .method(method)
        .uri(&api_uri)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(Body::empty())
        .unwrap();

    app.clone().oneshot(req).await.unwrap()
}

/// Make a request with a JSON body to the REST API (GAP-001)
async fn make_request_with_body(
    app: &Router,
    method: http::Method,
    uri: &str,
    body: &serde_json::Value,
) -> Response {
    let api_uri = format!("/api{}", uri);
    let req = Request::builder()
        .method(method)
        .uri(&api_uri)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(Body::from(serde_json::to_vec(body).unwrap()))
        .unwrap();

    app.clone().oneshot(req).await.unwrap()
}

async fn parse_json_response(response: Response) -> Value {
    let body = to_bytes(response.into_body(), 10_000_000).await.unwrap();
    serde_json::from_slice(&body).unwrap_or(json!({}))
}

// =============================================================================
// REST API Tests
// =============================================================================

#[tokio::test]
async fn test_health_endpoint() {
    let (app, _temp) = create_test_router();
    let response = make_request(&app, http::Method::GET, "/health").await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = parse_json_response(response).await;
    assert_eq!(body["status"], "healthy");
    assert!(body["uptime_seconds"].is_number());
    println!("  ✓ GET /health -> 200 OK");
}

#[tokio::test]
async fn test_workspace_list() {
    let (app, _temp) = create_test_router();
    let resp = make_request(&app, http::Method::GET, "/workspaces").await;
    assert_eq!(resp.status(), StatusCode::OK);
    println!("  ✓ GET /workspaces -> 200");
}

#[tokio::test]
async fn test_workspace_create_and_get() {
    let (app, _temp) = create_test_router();

    // Create a workspace with explicit ID
    let body = json!({ "id": "test-workspace", "name": "test-workspace", "description": "Test workspace" });
    let resp = make_request_with_body(&app, http::Method::POST, "/workspaces", &body).await;
    assert_eq!(resp.status(), StatusCode::CREATED);

    // Get the workspace
    let resp = make_request(&app, http::Method::GET, "/workspaces/test-workspace").await;
    assert_eq!(resp.status(), StatusCode::OK);
    println!("  ✓ POST/GET /workspaces -> create and retrieve");
}

#[tokio::test]
async fn test_workspace_delete() {
    let (app, _temp) = create_test_router();

    // Create with explicit ID
    let body = json!({ "id": "delete-me", "name": "delete-me" });
    let _resp = make_request_with_body(&app, http::Method::POST, "/workspaces", &body).await;

    // Delete
    let resp = make_request(&app, http::Method::DELETE, "/workspaces/delete-me").await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // Verify gone
    let resp = make_request(&app, http::Method::GET, "/workspaces/delete-me").await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    println!("  ✓ DELETE /workspaces/:id -> 204 and gone");
}

#[tokio::test]
async fn test_workflow_crud() {
    let (app, _temp) = create_test_router();

    // Create workflow
    let body = json!({
        "name": "test-workflow",
        "scope": "global",
        "stages": [],
        "execution": { "mode": "sequential", "stop_on_error": true }
    });
    let resp = make_request_with_body(&app, http::Method::POST, "/workflows", &body).await;
    assert_eq!(resp.status(), StatusCode::CREATED);

    // List workflows
    let resp = make_request(&app, http::Method::GET, "/workflows").await;
    assert_eq!(resp.status(), StatusCode::OK);

    // Get workflow - URL encode ARN to handle colons
    let arn = "arn:local:global:workflow/test-workflow";
    let encoded = format!("/workflows/{}", urlencoding::encode(arn));
    let resp = make_request(&app, http::Method::GET, &encoded).await;
    assert_eq!(resp.status(), StatusCode::OK);

    // Delete workflow - URL encode ARN
    let delete_uri = format!("/workflows/{}", urlencoding::encode(arn));
    let resp = make_request(&app, http::Method::DELETE, &delete_uri).await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    println!("  ✓ Workflow CRUD -> create/list/get/delete");
}

#[tokio::test]
async fn test_agent_crud() {
    let (app, _temp) = create_test_router();

    let body = json!({
        "name": "test-agent",
        "scope": "global",
        "model": "gpt-4",
        "skills": [],
        "tools": []
    });
    let resp = make_request_with_body(&app, http::Method::POST, "/agents", &body).await;
    assert_eq!(resp.status(), StatusCode::CREATED);

    let resp = make_request(&app, http::Method::GET, "/agents").await;
    assert_eq!(resp.status(), StatusCode::OK);

    // URL-encode the ARN to handle colons
    let arn = "arn:local:global:agent/test-agent";
    let delete_uri = format!("/agents/{}", urlencoding::encode(arn));
    let resp = make_request(&app, http::Method::DELETE, &delete_uri).await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    println!("  ✓ Agent CRUD -> create/list/delete");
}

#[tokio::test]
async fn test_skill_crud() {
    let (app, _temp) = create_test_router();

    let body = json!({
        "name": "test-skill",
        "description": "A test skill",
        "content": "Skill instructions",
        "triggers": ["test"]
    });
    let resp = make_request_with_body(&app, http::Method::POST, "/skills", &body).await;
    assert_eq!(resp.status(), StatusCode::CREATED);

    let resp = make_request(&app, http::Method::GET, "/skills").await;
    assert_eq!(resp.status(), StatusCode::OK);
    println!("  ✓ Skill CRUD -> create/list");
}

#[tokio::test]
async fn test_prompt_crud() {
    let (app, _temp) = create_test_router();

    let body = json!({
        "name": "test-prompt",
        "description": "A test prompt",
        "content": "Prompt text"
    });
    let resp = make_request_with_body(&app, http::Method::POST, "/prompts", &body).await;
    assert_eq!(resp.status(), StatusCode::CREATED);
    println!("  ✓ Prompt CRUD -> create");
}

#[tokio::test]
async fn test_execution_list() {
    let (app, _temp) = create_test_router();
    let resp = make_request(&app, http::Method::GET, "/executions").await;
    assert_eq!(resp.status(), StatusCode::OK);
    println!("  ✓ GET /executions -> 200");
}

#[tokio::test]
async fn test_artifact_list() {
    let (app, _temp) = create_test_router();
    let resp = make_request(&app, http::Method::GET, "/artifacts").await;
    assert_eq!(resp.status(), StatusCode::OK);
    println!("  ✓ GET /artifacts -> 200");
}

#[tokio::test]
async fn test_insights_query() {
    let (app, _temp) = create_test_router();
    let resp = make_request(&app, http::Method::GET, "/insights").await;
    assert_eq!(resp.status(), StatusCode::OK);
    println!("  ✓ GET /insights -> 200");
}

#[tokio::test]
async fn test_alerts_crud() {
    let (app, _temp) = create_test_router();

    // Create alert
    let body = json!({
        "message": "Test alert",
        "severity": "warning",
        "source": "test"
    });
    let resp = make_request_with_body(&app, http::Method::POST, "/alerts", &body).await;
    assert_eq!(resp.status(), StatusCode::CREATED);

    // List alerts
    let resp = make_request(&app, http::Method::GET, "/alerts").await;
    assert_eq!(resp.status(), StatusCode::OK);

    // Update alert
    let update_body = json!({ "state": "resolved" });
    let resp = make_request_with_body(&app, http::Method::PUT, "/alerts/1", &update_body).await;
    assert_eq!(resp.status(), StatusCode::OK);
    println!("  ✓ Alerts CRUD -> create/list/update");
}

#[tokio::test]
async fn test_metrics_get() {
    let (app, _temp) = create_test_router();
    let resp = make_request(&app, http::Method::GET, "/metrics").await;
    assert_eq!(resp.status(), StatusCode::OK);
    println!("  ✓ GET /metrics -> 200");
}

#[tokio::test]
async fn test_config_get() {
    let (app, _temp) = create_test_router();
    let resp = make_request(&app, http::Method::GET, "/config").await;
    assert_eq!(resp.status(), StatusCode::OK);
    println!("  ✓ GET /config -> 200");
}

#[tokio::test]
async fn test_not_found_routes() {
    let (app, _temp) = create_test_router();

    let resp = make_request(&app, http::Method::GET, "/unknown-route").await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    println!("  ✓ Unknown routes -> 404");
}

#[tokio::test]
async fn test_method_not_allowed() {
    let (app, _temp) = create_test_router();

    let resp = make_request(&app, http::Method::DELETE, "/health").await;
    assert_eq!(resp.status(), StatusCode::METHOD_NOT_ALLOWED);
    println!("  ✓ Wrong method -> 405");
}
