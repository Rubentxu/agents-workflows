//! End-to-End Workflow Lifecycle Tests via REST API
//!
//! Tests the workflow lifecycle through the REST API using axum ServiceExt.
//! Note: Only workflows are auto-registered to DB by bootstrap.
//! Agents/Skills/Prompts must be created via REST API or MCP.
//!
//! Run with: cargo test -p mcp-server --test e2e_workflow_test

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
use tempfile::TempDir;

use mcp_server::execution_store::ExecutionStore;
use mcp_server::rest::{create_rest_router, RestState};
use mcp_server::state::AppState;
use registry::application::node_service::NodeService;
use registry::infrastructure::db::Database;
use registry::infrastructure::node_repository::SqliteNodeRepository;
use insights::AnalyticsService;
use metrics::application::{SseEmitter, MetricsAggregator};
use mcp_server::bootstrap::BootstrapService;

fn create_test_rest_state_with_bootstrap(temp_dir: &TempDir) -> (RestState, TempDir) {
    let workspace = temp_dir.path().to_path_buf();
    let bootstrap = BootstrapService::new(workspace.clone());

    bootstrap.init().expect("Failed to bootstrap test workspace");

    let db_path = workspace.join("global/registry.db");
    let db = Arc::new(Database::open(db_path.to_str().unwrap()).expect("Failed to open test DB"));
    let repository = Arc::new(SqliteNodeRepository::new(db.clone()));
    let node_service = Arc::new(NodeService::new(repository));

    // Register workflows to DB (only workflows are auto-registered)
    bootstrap.register_workflows_to_db(node_service.clone()).expect("Failed to register workflows");

    let execution_store = Arc::new(ExecutionStore::new(db.clone()));
    let artifact_store = Arc::new(mcp_server::artifact_store::ArtifactStore::new(db.clone()));
    let artifact_service = Arc::new(artifact::application::artifact_service::ArtifactService::new(
        workspace.join("global/artifacts")
    ));
    let analytics_service = Arc::new(AnalyticsService::new());
    let sse_emitter = Arc::new(SseEmitter::new());
    let metrics_aggregator = Arc::new(MetricsAggregator::new());
    let app_state = Arc::new(AppState { node_service, db, execution_store, artifact_store, artifact_service, analytics_service, sse_emitter, metrics_aggregator });
    let state = RestState::new(app_state);
    (state, TempDir::new().expect("Failed to create temp dir for artifacts"))
}

fn create_test_router_with_bootstrap() -> (Router, TempDir) {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let (state, _artifacts_temp) = create_test_rest_state_with_bootstrap(&temp_dir);
    (create_rest_router(state), temp_dir)
}

async fn make_request(
    app: &Router,
    method: http::Method,
    uri: &str,
) -> Response {
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

fn assert_status(response: &Response, expected: StatusCode, context: &str) {
    assert_eq!(
        response.status(),
        expected,
        "{}: Expected {:?}, got {:?}",
        context,
        expected,
        response.status()
    );
}

#[tokio::test]
async fn test_01_health_check() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 01: Health Check");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();
    let response = make_request(&app, http::Method::GET, "/health").await;
    assert_status(&response, StatusCode::OK, "health check");

    let body = parse_json_response(response).await;
    assert_eq!(body["status"], "healthy", "status should be healthy");
    assert!(body["uptime_seconds"].is_number(), "uptime should be number");
    println!("  ✓ GET /health -> 200 OK");
}

#[tokio::test]
async fn test_02_list_workflows() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 02: List Workflows");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    let response = make_request(&app, http::Method::GET, "/workflows").await;
    assert_status(&response, StatusCode::OK, "list workflows");

    let body = parse_json_response(response).await;
    let workflows = body["workflows"].as_array().expect("workflows should be array");

    assert!(!workflows.is_empty(), "should have at least one workflow (sdd-full)");
    let sdd_full = workflows.iter().find(|w| {
        w["id"].as_str().map(|id| id.contains("sdd-full")).unwrap_or(false)
    });
    assert!(sdd_full.is_some(), "sdd-full workflow should exist in list");
    println!("  ✓ GET /workflows -> 200 with {} workflows", workflows.len());
}

#[tokio::test]
async fn test_03_get_workflow() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 03: Get Workflow (sdd-full)");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();
    let arn = "arn:local:global:workflow/sdd-full";
    let encoded_arn = urlencoding::encode(arn);
    let uri = format!("/workflows/{}", encoded_arn);

    let response = make_request(&app, http::Method::GET, &uri).await;
    assert_status(&response, StatusCode::OK, "get workflow");

    let body = parse_json_response(response).await;
    // The workflow name in YAML is "SDD Full Pipeline", ARN is sdd-full
    assert!(body["name"].as_str().unwrap().contains("SDD") || body["id"].as_str().unwrap().contains("sdd-full"),
        "workflow name or id should reference SDD");
    assert_eq!(body["scope"], "global", "workflow scope should be global");
    assert!(body["config"].is_string(), "workflow config should exist as YAML string");
    println!("  ✓ GET /workflows/sdd-full -> 200 OK");
}

#[tokio::test]
async fn test_04_create_and_list_agent() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 04: Create and List Agent via REST");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    // Create agent via REST
    let agent_body = json!({
        "scope": "global",
        "name": "test-agent",
        "description": "Test agent for e2e",
        "model": "test-model",
        "skills": [],
        "tools": []
    });

    let create_response = make_request_with_body(&app, http::Method::POST, "/agents", &agent_body).await;
    assert_status(&create_response, StatusCode::CREATED, "create agent");

    let created = parse_json_response(create_response).await;
    let agent_arn = created["arn"].as_str().unwrap();
    println!("    Created agent: {}", agent_arn);

    // List agents
    let list_response = make_request(&app, http::Method::GET, "/agents").await;
    assert_status(&list_response, StatusCode::OK, "list agents");

    let body = parse_json_response(list_response).await;
    let agents = body["agents"].as_array().expect("agents should be array");
    assert!(!agents.is_empty(), "should have at least one agent");
    let test_agent = agents.iter().find(|a| a["name"] == "test-agent");
    assert!(test_agent.is_some(), "test-agent should exist");
    println!("  ✓ POST/GET /agents -> create and list agent");
}

#[tokio::test]
async fn test_05_create_and_list_skill() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 05: Create and List Skill via REST");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    // Create skill via REST
    let skill_body = json!({
        "scope": "global",
        "name": "test-skill",
        "description": "Test skill for e2e",
        "content": "# Test Skill\n\nTest content",
        "triggers": ["test", "e2e"]
    });

    let create_response = make_request_with_body(&app, http::Method::POST, "/skills", &skill_body).await;
    assert_status(&create_response, StatusCode::CREATED, "create skill");

    let created = parse_json_response(create_response).await;
    let skill_arn = created["arn"].as_str().unwrap();
    println!("    Created skill: {}", skill_arn);

    // List skills
    let list_response = make_request(&app, http::Method::GET, "/skills").await;
    assert_status(&list_response, StatusCode::OK, "list skills");

    let body = parse_json_response(list_response).await;
    let skills = body["skills"].as_array().expect("skills should be array");
    assert!(!skills.is_empty(), "should have at least one skill");
    let test_skill = skills.iter().find(|s| s["name"] == "test-skill");
    assert!(test_skill.is_some(), "test-skill should exist");
    println!("  ✓ POST/GET /skills -> create and list skill");
}

#[tokio::test]
async fn test_06_create_and_list_prompt() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 06: Create and List Prompt via REST");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    // Create prompt via REST
    let prompt_body = json!({
        "scope": "global",
        "name": "test-prompt",
        "description": "Test prompt for e2e",
        "content": "# Test Prompt\n\nTest content"
    });

    let create_response = make_request_with_body(&app, http::Method::POST, "/prompts", &prompt_body).await;
    assert_status(&create_response, StatusCode::CREATED, "create prompt");

    let created = parse_json_response(create_response).await;
    let prompt_arn = created["arn"].as_str().unwrap();
    println!("    Created prompt: {}", prompt_arn);

    // List prompts
    let list_response = make_request(&app, http::Method::GET, "/prompts").await;
    assert_status(&list_response, StatusCode::OK, "list prompts");

    let body = parse_json_response(list_response).await;
    let prompts = body["prompts"].as_array().expect("prompts should be array");
    assert!(!prompts.is_empty(), "should have at least one prompt");
    let test_prompt = prompts.iter().find(|p| p["name"] == "test-prompt");
    assert!(test_prompt.is_some(), "test-prompt should exist");
    println!("  ✓ POST/GET /prompts -> create and list prompt");
}

#[tokio::test]
async fn test_07_get_workflow_with_stages() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 07: Get Workflow with Stages");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();
    let arn = "arn:local:global:workflow/sdd-full";
    let encoded_arn = urlencoding::encode(arn);
    let uri = format!("/workflows/{}", encoded_arn);

    let response = make_request(&app, http::Method::GET, &uri).await;
    assert_status(&response, StatusCode::OK, "get workflow with stages");

    let body = parse_json_response(response).await;
    let config_str = body["config"].as_str().unwrap();

    // The config is YAML, parse it to get stages
    let config: serde_yaml::Value = serde_yaml::from_str(config_str).expect("config should be valid YAML");
    assert!(config.get("stages").is_some() || config.get("spec").is_some(), "config should have stages");
    println!("  ✓ GET /workflows/sdd-full -> has stages in config");
}

#[tokio::test]
async fn test_08_list_executions() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 08: List Executions");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    let response = make_request(&app, http::Method::GET, "/executions").await;
    assert_status(&response, StatusCode::OK, "list executions");

    let body = parse_json_response(response).await;
    let executions = body["executions"].as_array().expect("executions should be array");
    println!("    Found {} executions (empty initially)", executions.len());
    println!("  ✓ GET /executions -> 200");
}

#[tokio::test]
async fn test_09_list_insights() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 09: List Insights");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    let response = make_request(&app, http::Method::GET, "/insights").await;
    assert_status(&response, StatusCode::OK, "list insights");

    let body = parse_json_response(response).await;
    let insights = body["insights"].as_array().expect("insights should be array");
    println!("    Found {} insights", insights.len());
    println!("  ✓ GET /insights -> 200");
}

#[tokio::test]
async fn test_10_list_artifacts() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 10: List Artifacts");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    let response = make_request(&app, http::Method::GET, "/artifacts").await;
    assert_status(&response, StatusCode::OK, "list artifacts");

    let body = parse_json_response(response).await;
    let artifacts = body["artifacts"].as_array().expect("artifacts should be array");
    println!("    Found {} artifacts", artifacts.len());
    println!("  ✓ GET /artifacts -> 200");
}

#[tokio::test]
async fn test_11_get_metrics() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 11: Get Metrics (empty)");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    let response = make_request(&app, http::Method::GET, "/metrics").await;
    assert_status(&response, StatusCode::OK, "get metrics");

    let body = parse_json_response(response).await;
    assert!(body["metrics"].is_array(), "metrics should be array");
    assert_eq!(body["total_tokens"], 0, "total tokens should be 0");
    println!("  ✓ GET /metrics -> 200");
}

#[tokio::test]
async fn test_12_get_config() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 12: Get Server Configuration");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    let response = make_request(&app, http::Method::GET, "/config").await;
    assert_status(&response, StatusCode::OK, "get config");

    let body = parse_json_response(response).await;
    assert_eq!(body["default_workflow"], "arn:local:global:workflow/sdd-full", "default workflow should match");
    assert!(body["max_concurrent_executions"].is_number(), "max_concurrent_executions should exist");
    println!("  ✓ GET /config -> 200");
}

#[tokio::test]
async fn test_13_error_handling_nonexistent_workflow() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 13: Error Handling - Non-existent Resources");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    let invalid_arn = "arn:local:global:workflow/nonexistent-workflow";
    let encoded_arn = urlencoding::encode(invalid_arn);
    let get_uri = format!("/workflows/{}", encoded_arn);

    let response = make_request(&app, http::Method::GET, &get_uri).await;
    assert_status(&response, StatusCode::NOT_FOUND, "get nonexistent workflow");
    println!("    GET nonexistent workflow -> 404 NOT FOUND");

    let invalid_agent = "arn:local:global:agent/nonexistent";
    let encoded_agent = urlencoding::encode(invalid_agent);
    let get_agent_uri = format!("/agents/{}", encoded_agent);

    let agent_response = make_request(&app, http::Method::GET, &get_agent_uri).await;
    assert_status(&agent_response, StatusCode::NOT_FOUND, "get nonexistent agent");
    println!("    GET nonexistent agent -> 404 NOT FOUND");

    let invalid_exec = "arn:local:workspace/test:execution/nonexistent";
    let encoded_exec = urlencoding::encode(invalid_exec);
    let exec_uri = format!("/executions/{}", encoded_exec);

    let get_exec_response = make_request(&app, http::Method::GET, &exec_uri).await;
    assert_status(&get_exec_response, StatusCode::NOT_FOUND, "get nonexistent execution");
    println!("    GET nonexistent execution -> 404 NOT FOUND");

    println!("  ✓ Error handling: 404 for non-existent resources");
}

#[tokio::test]
async fn test_14_error_handling_invalid_arns() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 14: Error Handling - Invalid ARN Format");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    let invalid_arn = "not-a-valid-arn";
    let encoded_arn = urlencoding::encode(invalid_arn);
    let get_uri = format!("/workflows/{}", encoded_arn);

    let response = make_request(&app, http::Method::GET, &get_uri).await;
    assert_status(&response, StatusCode::BAD_REQUEST, "get invalid ARN");
    println!("    GET invalid ARN format -> 400 BAD REQUEST");

    println!("  ✓ Error handling: 400 for invalid ARN format");
}

#[tokio::test]
async fn test_15_method_not_allowed() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 15: Method Not Allowed");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    let delete_response = make_request(&app, http::Method::DELETE, "/health").await;
    assert_status(&delete_response, StatusCode::METHOD_NOT_ALLOWED, "delete health");
    println!("    DELETE /health -> 405 METHOD NOT ALLOWED");

    let post_response = make_request(&app, http::Method::POST, "/health").await;
    assert_status(&post_response, StatusCode::METHOD_NOT_ALLOWED, "post to health");
    println!("    POST /health -> 405 METHOD NOT ALLOWED");

    println!("  ✓ Method not allowed: 405 for wrong HTTP methods");
}

#[tokio::test]
async fn test_16_create_and_list_alert() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 16: Create and List Alert");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    let alert_body = json!({
        "message": "Test alert for e2e",
        "severity": "info",
        "source": "e2e-test"
    });

    let create_response = make_request_with_body(&app, http::Method::POST, "/alerts", &alert_body).await;
    assert_status(&create_response, StatusCode::CREATED, "create alert");

    let created = parse_json_response(create_response).await;
    assert!(created["id"].is_number(), "alert id should be assigned");
    println!("    Created alert id: {}", created["id"]);

    let list_response = make_request(&app, http::Method::GET, "/alerts").await;
    assert_status(&list_response, StatusCode::OK, "list alerts");

    let body = parse_json_response(list_response).await;
    let alerts = body["alerts"].as_array().expect("alerts should be array");
    assert!(!alerts.is_empty(), "should have at least one alert");
    println!("  ✓ POST/GET /alerts -> create and list");
}

#[tokio::test]
async fn test_17_delete_agent() {
    println!("\n{}", "=".repeat(60));
    println!("TEST 17: Delete Agent");
    println!("{}", "=".repeat(60));

    let (app, _temp) = create_test_router_with_bootstrap();

    // Create agent
    let agent_body = json!({
        "scope": "global",
        "name": "delete-me-agent",
        "description": "Agent to delete",
        "model": "test-model",
        "skills": [],
        "tools": []
    });

    let create_response = make_request_with_body(&app, http::Method::POST, "/agents", &agent_body).await;
    assert_status(&create_response, StatusCode::CREATED, "create agent");

    let created = parse_json_response(create_response).await;
    let agent_arn = created["arn"].as_str().unwrap();
    println!("    Created agent: {}", agent_arn);

    // Delete agent
    let encoded_arn = urlencoding::encode(agent_arn);
    let delete_uri = format!("/agents/{}", encoded_arn);
    let delete_response = make_request(&app, http::Method::DELETE, &delete_uri).await;
    assert_status(&delete_response, StatusCode::NO_CONTENT, "delete agent");
    println!("    Deleted agent");

    // Verify deleted
    let get_response = make_request(&app, http::Method::GET, &delete_uri).await;
    assert_status(&get_response, StatusCode::NOT_FOUND, "get deleted agent");
    println!("  ✓ DELETE /agents/{{arn}} -> 204 and gone");
}
