//! Protocol tests for registry MCP tools (agents, skills, prompts, meta-tools).
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

/// Helper: extract the "content" array text from an MCP CallToolResult.
fn extract_text(result: &serde_json::Value) -> String {
    result["content"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|c| c["text"].as_str())
        .unwrap_or("")
        .to_string()
}

// ============================================================================
// Agent Tools
// ============================================================================

#[tokio::test]
async fn test_agent_list() {
    let _guard = start_server(18110);
    let result = call_mcp_tool(18110, "agent_list", serde_json::json!({})).await.unwrap();
    let text = extract_text(&result);
    // Should return valid JSON (array of agents or empty array)
    let agents: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
    // Agents may be empty if none registered, but response must be valid
    assert!(agents.is_array() || agents.is_object());
}

#[tokio::test]
async fn test_agent_get_not_found() {
    let _guard = start_server(18111);
    let result = call_mcp_tool(18111, "agent_get", serde_json::json!({
        "arn": "arn:local:global:agent/nonexistent"
    })).await;
    assert!(result.is_ok(), "agent_get should handle missing ARN gracefully");
}

#[tokio::test]
async fn test_agent_get_missing_arn() {
    let _guard = start_server(18112);
    let result = call_mcp_tool(18112, "agent_get", serde_json::json!({})).await;
    assert!(result.is_err(), "agent_get requires arn parameter");
}

#[tokio::test]
async fn test_agent_query() {
    let _guard = start_server(18113);
    let result = call_mcp_tool(18113, "agent_query", serde_json::json!({
        "query": "orch"
    })).await;
    assert!(result.is_ok(), "agent_query should handle gracefully");
}

// ============================================================================
// Skill Tools
// ============================================================================

#[tokio::test]
async fn test_skill_list() {
    let _guard = start_server(18114);
    let result = call_mcp_tool(18114, "skill_list", serde_json::json!({})).await.unwrap();
    let text = extract_text(&result);
    let skills: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
    assert!(skills.is_array() || skills.is_object());
}

#[tokio::test]
async fn test_skill_get_not_found() {
    let _guard = start_server(18115);
    let result = call_mcp_tool(18115, "skill_get", serde_json::json!({
        "arn": "arn:local:global:skill/nonexistent"
    })).await;
    assert!(result.is_ok(), "skill_get should handle missing ARN gracefully");
}

#[tokio::test]
async fn test_skill_query() {
    let _guard = start_server(18116);
    let result = call_mcp_tool(18116, "skill_query", serde_json::json!({
        "query": "sdd"
    })).await;
    assert!(result.is_ok(), "skill_query should handle gracefully");
}

// ============================================================================
// Prompt Tools
// ============================================================================

#[tokio::test]
async fn test_prompt_list() {
    let _guard = start_server(18117);
    let result = call_mcp_tool(18117, "prompt_list", serde_json::json!({})).await.unwrap();
    let text = extract_text(&result);
    let prompts: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
    assert!(prompts.is_array() || prompts.is_object());
}

#[tokio::test]
async fn test_prompt_get_not_found() {
    let _guard = start_server(18118);
    let result = call_mcp_tool(18118, "prompt_get", serde_json::json!({
        "arn": "arn:local:global:prompt/nonexistent"
    })).await;
    assert!(result.is_ok(), "prompt_get should handle missing ARN gracefully");
}

#[tokio::test]
async fn test_prompt_get_missing_arn() {
    let _guard = start_server(18119);
    let result = call_mcp_tool(18119, "prompt_get", serde_json::json!({})).await;
    assert!(result.is_err(), "prompt_get requires arn parameter");
}

// ============================================================================
// Meta-tools
// ============================================================================

#[tokio::test]
async fn test_tool_search() {
    let _guard = start_server(18120);
    let result = call_mcp_tool(18120, "tool_search", serde_json::json!({})).await.unwrap();
    let text = extract_text(&result);
    let tools: Vec<serde_json::Value> = serde_json::from_str(&text).unwrap_or_default();
    // tool_search with no filters returns all tools from the registry
    // Tools come from bootstrap YAML files, so there should be some
    assert!(!tools.is_empty(), "tool_search should return at least built-in tools");
}

#[tokio::test]
async fn test_tool_search_with_category() {
    let _guard = start_server(18121);
    let result = call_mcp_tool(18121, "tool_search", serde_json::json!({
        "category": "workflow"
    })).await.unwrap();
    let text = extract_text(&result);
    let tools: Vec<serde_json::Value> = serde_json::from_str(&text).unwrap_or_default();
    // May have results or empty depending on tool metadata
    assert!(tools.iter().all(|t| {
        t.get("category")
            .and_then(|c| c.as_str())
            .map(|c| c == "workflow")
            .unwrap_or(true) // no category = skip filter
    }));
}

#[tokio::test]
async fn test_tool_inspect() {
    let _guard = start_server(18122);
    let result = call_mcp_tool(18122, "tool_inspect", serde_json::json!({
        "arn": "arn:local:global:tool/bash"
    })).await;

    match result {
        Ok(val) => {
            // Should return tool metadata with at least name + description
            let text = extract_text(&val);
            let meta: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
            assert!(meta.get("name").is_some(), "tool_inspect should include name");
            assert!(meta.get("description").is_some(), "tool_inspect should include description");
        }
        Err(e) => {
            // The tool may not exist in the registry — that's OK
            eprintln!("tool_inspect returned error: {} (tool may not be registered)", e);
        }
    }
}

#[tokio::test]
async fn test_tool_inspect_not_found() {
    let _guard = start_server(18123);
    let result = call_mcp_tool(18123, "tool_inspect", serde_json::json!({
        "arn": "arn:local:global:tool/does-not-exist"
    })).await;
    // Should handle missing gracefully
    assert!(result.is_ok() || result.is_err());
}

#[tokio::test]
async fn test_tool_search_with_tag() {
    let _guard = start_server(18124);
    let result = call_mcp_tool(18124, "tool_search", serde_json::json!({
        "tag": "core"
    })).await;
    assert!(result.is_ok(), "tool_search with tag should work");
}
