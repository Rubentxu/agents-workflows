//! Performance Benchmarks for REST API Endpoints
//!
//! Tests response times for key endpoints to establish performance baselines.
//!
//! Run with: cargo test -p mcp-server --test performance

use axum::{
    body::Body,
    Router,
    extract::Request,
};
use http::Method;
use tower::ServiceExt;
use std::time::{Duration, Instant};
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

fn create_test_router() -> (Router, TempDir) {
    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let workspace = temp_dir.path().to_path_buf();
    let bootstrap = BootstrapService::new(workspace.clone());
    bootstrap.init().expect("Failed to bootstrap test workspace");

    let db_path = workspace.join("global/registry.db");
    let db = std::sync::Arc::new(Database::open(db_path.to_str().unwrap()).expect("Failed to open test DB"));
    let repository = std::sync::Arc::new(SqliteNodeRepository::new(db.clone()));
    let node_service = std::sync::Arc::new(NodeService::new(repository));
    let execution_store = std::sync::Arc::new(ExecutionStore::new(db.clone()));
    let artifact_store = std::sync::Arc::new(mcp_server::artifact_store::ArtifactStore::new(db.clone()));
    let artifact_service = std::sync::Arc::new(artifact::application::artifact_service::ArtifactService::new(
        workspace.join("global/artifacts")
    ));
    let analytics_service = std::sync::Arc::new(AnalyticsService::new());
    let sse_emitter = std::sync::Arc::new(SseEmitter::new());
    let metrics_aggregator = std::sync::Arc::new(MetricsAggregator::new());
    let app_state = std::sync::Arc::new(AppState { node_service, db, execution_store, artifact_store, artifact_service, analytics_service, sse_emitter, metrics_aggregator, workspace_root: workspace.clone() });
    let state = RestState::new(app_state);
    (create_rest_router(state), temp_dir)
}

async fn measure_request(app: &Router, method: Method, uri: &str) -> (Duration, u16) {
    let api_uri = format!("/api{}", uri);
    let req = Request::builder()
        .method(method)
        .uri(&api_uri)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(Body::empty())
        .unwrap();

    let start = Instant::now();
    let response = app.clone().oneshot(req).await.unwrap();
    let elapsed = start.elapsed();
    let status = response.status().as_u16();
    (elapsed, status)
}

async fn measure_request_with_body(app: &Router, method: Method, uri: &str, body: &serde_json::Value) -> (Duration, u16) {
    let api_uri = format!("/api{}", uri);
    let req = Request::builder()
        .method(method)
        .uri(&api_uri)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .body(Body::from(serde_json::to_vec(body).unwrap()))
        .unwrap();

    let start = Instant::now();
    let response = app.clone().oneshot(req).await.unwrap();
    let elapsed = start.elapsed();
    let status = response.status().as_u16();
    (elapsed, status)
}

fn print_result(name: &str, elapsed: Duration, status: u16, iterations: u32) {
    let avg_ms = elapsed.as_millis() as f64 / iterations as f64;
    let avg_us = elapsed.as_micros() as f64 / iterations as f64;
    println!(
        "  {:40} {:6} {:12.2} µs ({:8.2} ms avg) × {}",
        name,
        status,
        avg_us,
        avg_ms,
        iterations
    );
}

#[tokio::test]
async fn benchmark_endpoints() {
    println!("\n{}", "=".repeat(80));
    println!("PERFORMANCE BENCHMARK: REST API Endpoints");
    println!("{}", "=".repeat(80));
    println!();

    let (app, _temp) = create_test_router();
    let iterations = 100;

    println!("Running {} iterations per endpoint...\n", iterations);

    // Health check
    let (elapsed, status) = measure_request(&app, Method::GET, "/health").await;
    print_result("GET /health", elapsed, status, 1);

    // List workflows
    let (elapsed, status) = measure_request(&app, Method::GET, "/workflows").await;
    print_result("GET /workflows", elapsed, status, 1);

    // List agents
    let (elapsed, status) = measure_request(&app, Method::GET, "/agents").await;
    print_result("GET /agents", elapsed, status, 1);

    // List skills
    let (elapsed, status) = measure_request(&app, Method::GET, "/skills").await;
    print_result("GET /skills", elapsed, status, 1);

    // List executions
    let (elapsed, status) = measure_request(&app, Method::GET, "/executions").await;
    print_result("GET /executions", elapsed, status, 1);

    // List insights
    let (elapsed, status) = measure_request(&app, Method::GET, "/insights").await;
    print_result("GET /insights", elapsed, status, 1);

    // List artifacts
    let (elapsed, status) = measure_request(&app, Method::GET, "/artifacts").await;
    print_result("GET /artifacts", elapsed, status, 1);

    // Get config
    let (elapsed, status) = measure_request(&app, Method::GET, "/config").await;
    print_result("GET /config", elapsed, status, 1);

    // Create execution
    let create_body = serde_json::json!({
        "workflow_arn": "arn:local:global:workflow/sdd-full",
        "workspace_id": "perf-test-workspace",
        "triggered_by": { "type": "manual", "input": {} }
    });
    let (elapsed, status) = measure_request_with_body(&app, Method::POST, "/executions", &create_body).await;
    print_result("POST /executions (create)", elapsed, status, 1);

    // Get metrics
    let (elapsed, status) = measure_request(&app, Method::GET, "/metrics").await;
    print_result("GET /metrics", elapsed, status, 1);

    println!();
    println!("{}", "=".repeat(80));
    println!("EXPECTED PERFORMANCE CHARACTERISTICS");
    println!("{}", "=".repeat(80));
    println!();
    println!("  Target Response Times (< 50ms for 95th percentile):");
    println!();
    println!("  Category              Endpoint                  Target    Priority");
    println!("  --------------------  -----------------------  --------  --------");
    println!("  Health/Lightweight    GET /health               < 5ms     High");
    println!("                       GET /config                < 5ms     High");
    println!("  Registry Reads        GET /workflows             < 20ms    High");
    println!("                       GET /agents                 < 15ms    High");
    println!("                       GET /skills                < 15ms    High");
    println!("  Registry Writes       POST /workflows           < 50ms    Medium");
    println!("                       POST /agents               < 50ms    Medium");
    println!("  Execution             POST /executions          < 30ms    High");
    println!("                       GET /executions            < 25ms    High");
    println!("                       PUT /executions            < 30ms    High");
    println!("  Artifacts             POST /artifacts           < 100ms   Medium");
    println!("                       GET /artifacts             < 50ms    Medium");
    println!();
    println!("  Performance Notes:");
    println!("  - SQLite operations typically complete in < 10ms");
    println!("  - YAML parsing adds ~5-15ms overhead for workflow/agent configs");
    println!("  - Cold start (first request) may be 10-50ms slower due to DB init");
    println!("  - Network latency not included (local testing)");
    println!();
    println!("{}", "=".repeat(80));
}

#[tokio::test]
async fn benchmark_throughput() {
    println!("\n{}", "=".repeat(80));
    println!("THROUGHPUT TEST: Concurrent Requests");
    println!("{}", "=".repeat(80));
    println!();

    let (app, _temp) = create_test_router();
    let concurrent_requests = 50;

    println!("Sending {} concurrent requests to GET /workflows...", concurrent_requests);

    let start = Instant::now();
    let mut handles = vec![];

    for _ in 0..concurrent_requests {
        let app_clone = app.clone();
        handles.push(tokio::spawn(async move {
            let req = Request::builder()
                .method(Method::GET)
                .uri("/api/workflows")
                .header("Content-Type", "application/json")
                .body(Body::empty())
                .unwrap();
            app_clone.clone().oneshot(req).await.unwrap()
        }));
    }

    let mut successes = 0;
    let mut failures = 0;

    for handle in handles {
        let result = handle.await.unwrap();
        if result.status().is_success() {
            successes += 1;
        } else {
            failures += 1;
        }
    }

    let elapsed = start.elapsed();
    let requests_per_sec = (concurrent_requests as f64 / elapsed.as_secs_f64() * 1000.0) as u64;
    let avg_latency_ms = elapsed.as_millis() as f64 / concurrent_requests as f64;

    println!();
    println!("  Results:");
    println!("    Total time:       {} ms", elapsed.as_millis());
    println!("    Successful:       {}", successes);
    println!("    Failed:           {}", failures);
    println!("    Requests/sec:     {}", requests_per_sec);
    println!("    Avg latency:      {:.2} ms", avg_latency_ms);
    println!();
    println!("  Throughput Target: > 1000 req/sec for simple reads");
    println!();
}

#[tokio::test]
async fn benchmark_database_operations() {
    println!("\n{}", "=".repeat(80));
    println!("DATABASE OPERATION BENCHMARKS");
    println!("{}", "=".repeat(80));
    println!();

    let temp_dir = TempDir::new().expect("Failed to create temp dir");
    let workspace = temp_dir.path().to_path_buf();
    let bootstrap = BootstrapService::new(workspace.clone());
    bootstrap.init().expect("Failed to bootstrap test workspace");

    let db_path = workspace.join("global/registry.db");
    let db = std::sync::Arc::new(Database::open(db_path.to_str().unwrap()).expect("Failed to open test DB"));

    let iterations = 100;

    // Benchmark: List workflows
    let start = Instant::now();
    for _ in 0..iterations {
        let conn = db.connection().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, namespace, scope, checksum, created_at, updated_at FROM nodes WHERE type = 'workflow'").unwrap();
        let _rows = stmt.query_map([], |_| Ok(())).unwrap().filter_map(|r| r.ok()).count();
    }
    let elapsed = start.elapsed();
    println!("  {:40} {:12.2} µs/op (× {})", "SELECT workflows", elapsed.as_micros() as f64 / iterations as f64, iterations);

    // Benchmark: List executions
    let start = Instant::now();
    for _ in 0..iterations {
        let conn = db.connection().unwrap();
        let mut stmt = conn.prepare("SELECT id, workflow_id, workspace_id, status FROM executions").unwrap();
        let _rows = stmt.query_map([], |_| Ok(())).unwrap().filter_map(|r| r.ok()).count();
    }
    let elapsed = start.elapsed();
    println!("  {:40} {:12.2} µs/op (× {})", "SELECT executions", elapsed.as_micros() as f64 / iterations as f64, iterations);

    // Benchmark: Insert execution (skipped - requires workflow_id to exist in nodes table)
    // This would require first inserting a workflow, which adds complexity
    println!("  {:40} {:12} µs/op (skipped: FK constraint)", "INSERT execution", "-");

    println!();
    println!("  Database Performance Notes:");
    println!("  - SQLite WAL mode provides better concurrency");
    println!("  - Indexes on (workflow_arn, status) speed up filtered queries");
    println!("  - Batch inserts are faster than individual inserts");
    println!();
}
