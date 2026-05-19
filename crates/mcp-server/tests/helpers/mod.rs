//! Test Utilities Module
//!
//! Shared utilities for MCP server tests including:
//! - SSE response parsing
//! - MCP client helpers
//! - State creation helpers
//! - ARN validation

use serde_json::{json, Value};
use http::StatusCode;

/// Parse SSE response body and extract JSON
///
/// The MCP server returns responses in SSE format:
/// ```text
/// data: 
/// id: 0
/// retry: 3000
///
/// data: {"jsonrpc":"2.0",...}
/// ```
pub fn parse_sse_response(body: &str) -> Value {
    let mut json_buffer = String::new();
    
    for line in body.lines() {
        let line = line.trim();
        
        // Skip empty lines and metadata lines
        if line.is_empty() || line.starts_with("id:") || line.starts_with("retry:") {
            continue;
        }
        
        // This is a data line
        if line.starts_with("data:") {
            let json_str = &line[5..].trim();
            if !json_str.is_empty() && (json_str.starts_with('{') || json_str.starts_with('[')) {
                json_buffer = json_str.to_string();
                break;
            }
        } else if line.starts_with('{') || line.starts_with('[') {
            // Direct JSON line (no data: prefix)
            json_buffer = line.to_string();
            break;
        }
    }
    
    if json_buffer.is_empty() {
        panic!("No parseable JSON in SSE response: {}", body);
    }
    
    serde_json::from_str(&json_buffer)
        .expect(&format!("Failed to parse JSON: {}", json_buffer))
}

/// Parse MCP tool result from content format
///
/// MCP returns tool results in this format:
/// ```json
/// {
///   "content": [
///     {
///       "type": "text",
///       "text": "{\"actual\": \"json\"}"
///     }
///   ]
/// }
/// ```
pub fn parse_tool_result(result: &Value) -> Value {
    if let Some(content) = result.get("content") {
        if let Some(arr) = content.as_array() {
            if let Some(first) = arr.first() {
                if let Some(text) = first.get("text") {
                    if let Ok(parsed) = serde_json::from_str::<Value>(text.as_str().unwrap_or("{}")) {
                        return parsed;
                    }
                }
            }
        }
    }
    result.clone()
}

/// Check if MCP response is an error
pub fn is_mcp_error(resp: &Value) -> bool {
    resp.get("error").is_some()
}

/// Validate ARN format
///
/// ARN format: arn:local:{scope}:{type}/{name}
pub fn validate_arn(arn: &str) -> bool {
    arn.starts_with("arn:local:")
}

/// Extract resource type from ARN
pub fn arn_type(arn: &str) -> Option<&str> {
    let parts: Vec<&str> = arn.split(':').collect();
    if parts.len() >= 5 {
        let type_path = parts.get(4)?;
        type_path.split('/').next()
    } else {
        None
    }
}

/// Create a mock workflow for testing
pub fn mock_workflow() -> Value {
    json!({
        "arn": "arn:local:global:workflow/test-workflow",
        "name": "Test Workflow",
        "description": "A workflow for testing",
        "scope": "global",
        "stages": [
            {
                "id": "stage-1",
                "agent": "orchestrator",
                "depends_on": [],
                "input": {},
                "output": {"artifacts": []},
                "execution": {
                    "mode": "sequential",
                    "retry": {"max_attempts": 3, "backoff_ms": 1000}
                },
                "conditions": []
            }
        ],
        "execution": {
            "mode": "sequential",
            "on_failure": "abort"
        }
    })
}

/// Create a mock execution for testing
pub fn mock_execution() -> Value {
    json!({
        "arn": "arn:local:workspace/test:execution/123456",
        "workflow_arn": "arn:local:global:workflow/test-workflow",
        "workspace_id": "test",
        "status": "running",
        "current_stage": "stage-1",
        "completed_stages": [],
        "pending_stages": ["stage-1", "stage-2"],
        "stage_outputs": {},
        "triggered_by": {
            "trigger_type": "manual",
            "input": {}
        },
        "started_at": "2026-05-17T10:00:00Z",
        "completed_at": null
    })
}

/// Create a mock agent for testing
pub fn mock_agent() -> Value {
    json!({
        "arn": "arn:local:global:agent/test-agent",
        "name": "Test Agent",
        "description": "An agent for testing",
        "scope": "global",
        "model": "gpt-4",
        "skills": ["skill-1", "skill-2"],
        "tools": ["tool-1"]
    })
}

/// Create a mock skill for testing
pub fn mock_skill() -> Value {
    json!({
        "arn": "arn:local:global:skill/test-skill",
        "name": "Test Skill",
        "description": "A skill for testing",
        "scope": "global",
        "content": "# Test Skill\n\nThis is a test skill.",
        "triggers": ["test", "mock"]
    })
}

/// Assert response status is OK (2xx)
pub fn assert_status_ok(response: &reqwest::Response) {
    let status = response.status();
    assert!(
        status.is_success(),
        "Expected 2xx status, got {}: {:?}",
        status,
        response.text().await
    );
}

/// Assert response status is error (4xx/5xx)
pub fn assert_status_error(response: &reqwest::Response) {
    let status = response.status();
    assert!(
        !status.is_success(),
        "Expected error status, got {}",
        status
    );
}

/// Format test output
pub fn print_test_header(name: &str) {
    println!("\n{}", "=".repeat(60));
    println!("TEST: {}", name);
    println!("{}", "=".repeat(60));
}

/// Format success message
pub fn print_success(message: &str) {
    println!("  ✓ {}", message);
}

/// Format info message  
pub fn print_info(message: &str) {
    println!("    {}", message);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_arn() {
        assert!(validate_arn("arn:local:global:workflow/test"));
        assert!(validate_arn("arn:local:workspace/123:execution/456"));
        assert!(!validate_arn("invalid-arn"));
        assert!(!validate_arn("arn:other:format"));
    }

    #[test]
    fn test_arn_type() {
        assert_eq!(arn_type("arn:local:global:workflow/test"), Some("workflow"));
        assert_eq!(arn_type("arn:local:workspace/123:agent/test"), Some("agent"));
        assert_eq!(arn_type("invalid"), None);
    }

    #[test]
    fn test_parse_tool_result() {
        let result = json!({
            "content": [
                {
                    "type": "text",
                    "text": "{\"key\": \"value\"}"
                }
            ]
        });
        let parsed = parse_tool_result(&result);
        assert_eq!(parsed["key"], "value");
    }

    #[test]
    fn test_mock_workflow() {
        let workflow = mock_workflow();
        assert_eq!(workflow["arn"], "arn:local:global:workflow/test-workflow");
        assert_eq!(workflow["stages"].as_array().unwrap().len(), 1);
    }
}
