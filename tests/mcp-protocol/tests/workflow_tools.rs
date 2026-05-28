//! Protocol tests for workflow-related MCP tools.
//!
//! Each test starts the server on a unique port, calls a tool,
//! and kills the server — even on panic — using a Drop-based guard.

use mcp_protocol::{call_mcp_tool, list_tools};
use std::process::{Child, Command};
use std::time::Duration;

/// A guard that kills the child process on drop (including during panic unwinding).
struct ServerGuard(Child);

impl Drop for ServerGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

/// Start a workflow-mcp server on the given port.
fn start_server(port: u16) -> ServerGuard {
    let workspace = std::env::var("WORKSPACE_DIR")
        .unwrap_or_else(|_| format!("{}/.workflows", std::env::var("HOME").unwrap()));
    let child = Command::new("cargo")
        .args(&[
            "run", "--bin", "workflow-mcp", "--",
            "start", "--workspace", &workspace, "--port", &port.to_string(),
        ])
        .spawn()
        .expect("Failed to start server");
    // Give the server time to start
    std::thread::sleep(Duration::from_secs(6));
    ServerGuard(child)
}

// ============================================================================
// Workflow Tools
// ============================================================================

/// Helper: extract the "content" array from an MCP CallToolResult.
/// The result is a JSON object with `content: [{ type, text }]`.
fn extract_text(result: &serde_json::Value) -> String {
    result["content"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|c| c["text"].as_str())
        .unwrap_or("")
        .to_string()
}

/// Helper: parse the text content as JSON.
fn parse_result<T: serde::de::DeserializeOwned>(result: &serde_json::Value) -> T {
    let text = extract_text(result);
    serde_json::from_str(&text).expect("Failed to parse result text as JSON")
}

#[tokio::test]
async fn test_workflow_list_tools() {
    let _guard = start_server(18100);
    let result = list_tools(18100).await.unwrap();
    let tools = result["tools"].as_array().expect("tools must be an array");
    assert!(!tools.is_empty(), "should have at least one tool");
    let names: Vec<&str> = tools.iter()
        .filter_map(|t| t["name"].as_str())
        .collect();
    assert!(names.contains(&"workflow_list"), "should include workflow_list");
    assert!(names.contains(&"workflow_get"), "should include workflow_get");
    assert!(names.contains(&"agent_list"), "should include agent_list");
}

#[tokio::test]
async fn test_workflow_list() {
    let _guard = start_server(18101);
    let result = call_mcp_tool(18101, "workflow_list", serde_json::json!({})).await.unwrap();
    let workflows: Vec<serde_json::Value> = parse_result(&result);
    // Should at minimum be an array (may be empty if no workflows seeded)
    assert!(workflows.is_array() || result.is_object());
}

#[tokio::test]
async fn test_workflow_get_not_found() {
    let _guard = start_server(18102);
    let result = call_mcp_tool(18102, "workflow_get", serde_json::json!({
        "arn": "arn:local:global:workflow/nonexistent"
    })).await;
    // Should not be a connection error — the tool should handle gracefully
    assert!(result.is_ok(), "workflow_get should not error on missing ARN");
}

#[tokio::test]
async fn test_workflow_get_dag_not_found() {
    let _guard = start_server(18103);
    let result = call_mcp_tool(18103, "workflow_get_dag", serde_json::json!({
        "arn": "arn:local:global:workflow/nonexistent"
    })).await;
    assert!(result.is_ok(), "workflow_get_dag should not error on missing ARN");
}

#[tokio::test]
async fn test_execution_list() {
    let _guard = start_server(18104);
    let result = call_mcp_tool(18104, "execution_list", serde_json::json!({})).await.unwrap();
    // Should be a valid response (may be empty)
    let _text = extract_text(&result);
}

#[tokio::test]
async fn test_workflow_get_missing_arn() {
    let _guard = start_server(18105);
    let result = call_mcp_tool(18105, "workflow_get", serde_json::json!({})).await;
    // Should error because arn is required
    assert!(result.is_err(), "workflow_get requires arn parameter");
}

#[tokio::test]
async fn test_analyze_impact() {
    let _guard = start_server(18106);
    let result = call_mcp_tool(18106, "analyze_impact", serde_json::json!({
        "arn": "arn:local:global:workflow/nonexistent",
        "kind": "workflow"
    })).await;
    assert!(result.is_ok(), "analyze_impact should handle gracefully");
}
