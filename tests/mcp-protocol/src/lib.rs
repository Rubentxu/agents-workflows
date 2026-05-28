use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    method: &'static str,
    params: serde_json::Value,
    id: u64,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    #[serde(rename = "result")]
    result: Option<serde_json::Value>,
    #[serde(rename = "error")]
    error: Option<serde_json::Value>,
    id: u64,
}

/// Call an MCP tool by name with arguments, returns the JSON result or error string.
pub async fn call_mcp_tool(
    port: u16,
    tool_name: &str,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let request = JsonRpcRequest {
        jsonrpc: "2.0",
        method: "tools/call",
        params: serde_json::json!({
            "name": tool_name,
            "arguments": args
        }),
        id: 1,
    };

    let response = client
        .post(&format!("http://localhost:{}/mcp", port))
        .json(&request)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let rpc: JsonRpcResponse = response.json().await.map_err(|e| e.to_string())?;

    rpc.result.ok_or_else(|| {
        rpc.error
            .map(|e| serde_json::to_string(&e).unwrap_or_default())
            .unwrap_or_else(|| "Unknown error".to_string())
    })
}

/// List all available tools.
pub async fn list_tools(port: u16) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let request = JsonRpcRequest {
        jsonrpc: "2.0",
        method: "tools/list",
        params: serde_json::Value::Null,
        id: 1,
    };

    let response = client
        .post(&format!("http://localhost:{}/mcp", port))
        .json(&request)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let rpc: JsonRpcResponse = response.json().await.map_err(|e| e.to_string())?;

    rpc.result.ok_or_else(|| "Unknown error".to_string())
}
