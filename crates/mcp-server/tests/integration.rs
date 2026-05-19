use std::net::SocketAddr;
use tokio::sync::oneshot;
use tower_http::cors::CorsLayer;
use axum::{Router, routing::post, Json};
use serde_json::{json, Value};

async fn start_test_server(addr: SocketAddr, ready: oneshot::Sender<SocketAddr>) {
    let app = Router::new()
        .route("/health", post(health_handler))
        .route("/mcp", post(mcp_handler))
        .layer(CorsLayer::permissive())
        .with_state(());

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    let local_addr = listener.local_addr().unwrap();
    ready.send(local_addr).unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_handler() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "version": "1.0.0"
    }))
}

async fn mcp_handler(Json(payload): Json<Value>) -> Json<Value> {
    let method = payload.get("method").and_then(|m| m.as_str()).unwrap_or("");
    
    match method {
        "workflow_list" => Json(json!({
            "jsonrpc": "2.0",
            "id": payload.get("id"),
            "result": {
                "content": [{
                    "text": r#"[{"arn":"arn:local:global:workflow/sdd-full","name":"sdd-full","scope":"global"}]"#
                }]
            }
        })),
        "workflow_get" => Json(json!({
            "jsonrpc": "2.0",
            "id": payload.get("id"),
            "result": {
                "content": [{
                    "text": r#"{"arn":"arn:local:global:workflow/sdd-full","name":"sdd-full","stages":[]}"#
                }]
            }
        })),
        "workflow_execute" => Json(json!({
            "jsonrpc": "2.0",
            "id": payload.get("id"),
            "result": {
                "execution_arn": "arn:local:workspace/test:execution/run-001",
                "status": "pending"
            }
        })),
        "workflow_get_state" => Json(json!({
            "jsonrpc": "2.0",
            "id": payload.get("id"),
            "result": {
                "execution_arn": "arn:local:workspace/test:execution/run-001",
                "status": "running",
                "current_stage": "explore"
            }
        })),
        "insights_log" => Json(json!({
            "jsonrpc": "2.0",
            "id": payload.get("id"),
            "result": {
                "id": 1
            }
        })),
        _ => Json(json!({
            "jsonrpc": "2.0",
            "id": payload.get("id"),
            "error": {"code": -32601, "message": "Method not found"}
        })),
    }
}

#[tokio::test]
async fn test_health_endpoint() {
    let (ready, rx) = oneshot::channel();
    let addr: SocketAddr = "127.0.0.1:0".parse().unwrap();
    
    tokio::spawn(start_test_server(addr, ready));
    let server_addr = rx.await.unwrap();
    
    let client = reqwest::Client::new();
    let resp = client.post(format!("http://{}/health", server_addr))
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    
    assert!(resp.status().is_success());
    let body: Value = resp.json().await.unwrap();
    assert_eq!(body["status"], "healthy");
}

#[tokio::test]
async fn test_mcp_workflow_list() {
    let (ready, rx) = oneshot::channel();
    let addr: SocketAddr = "127.0.0.1:0".parse().unwrap();
    
    tokio::spawn(start_test_server(addr, ready));
    let server_addr = rx.await.unwrap();
    
    let client = reqwest::Client::new();
    let resp = client.post(format!("http://{}/mcp", server_addr))
        .json(&json!({
            "jsonrpc": "2.0",
            "method": "workflow_list",
            "params": {"scope": "global"},
            "id": 1
        }))
        .send()
        .await
        .unwrap();
    
    assert!(resp.status().is_success());
    let body: Value = resp.json().await.unwrap();
    assert_eq!(body["jsonrpc"], "2.0");
    assert!(body.get("result").is_some());
}

#[tokio::test]
async fn test_mcp_workflow_execute() {
    let (ready, rx) = oneshot::channel();
    let addr: SocketAddr = "127.0.0.1:0".parse().unwrap();
    
    tokio::spawn(start_test_server(addr, ready));
    let server_addr = rx.await.unwrap();
    
    let client = reqwest::Client::new();
    let resp = client.post(format!("http://{}/mcp", server_addr))
        .json(&json!({
            "jsonrpc": "2.0",
            "method": "workflow_execute",
            "params": {
                "workflow_arn": "arn:local:global:workflow/sdd-full",
                "input": {"goal": "test"}
            },
            "id": 2
        }))
        .send()
        .await
        .unwrap();
    
    assert!(resp.status().is_success());
    let body: Value = resp.json().await.unwrap();
    assert_eq!(body["result"]["status"], "pending");
}

#[tokio::test]
async fn test_mcp_insights_log() {
    let (ready, rx) = oneshot::channel();
    let addr: SocketAddr = "127.0.0.1:0".parse().unwrap();
    
    tokio::spawn(start_test_server(addr, ready));
    let server_addr = rx.await.unwrap();
    
    let client = reqwest::Client::new();
    let resp = client.post(format!("http://{}/mcp", server_addr))
        .json(&json!({
            "jsonrpc": "2.0",
            "method": "insights_log",
            "params": {
                "execution_arn": "arn:local:workspace/test:execution/run-001",
                "stage_id": "explore",
                "insight_type": "stage:completed",
                "data": {"tokens": 100}
            },
            "id": 3
        }))
        .send()
        .await
        .unwrap();
    
    assert!(resp.status().is_success());
    let body: Value = resp.json().await.unwrap();
    assert_eq!(body["result"]["id"], 1);
}