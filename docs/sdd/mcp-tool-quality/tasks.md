# SDD Tasks: mcp-tool-quality

## Overview

Seven improvements to the MCP tool layer: (1) output schemas via schemars, (2) input schema factory `tool_schema.rs`, (3) `just tool` CLI, (4) MCP protocol tests crate, (5) `tool_search` + `tool_inspect` meta-tools, (6) seed data YAML, (7) tool telemetry via `MetricsBroadcaster`.

---

## Batch 1 - Schema Foundation

Prerequisite for everything else. Creates `tool_schema.rs` module and output schema functions for each DTO type.

### T1: Create `tool_schema.rs` with `input_schema()` factory

**Task ID:** T1

**Description:** Create `crates/mcp-server/src/tool_schema.rs` with:
- `InputField` struct: `{ name: &'static str, description: &'static str, json_type: &'static str, example: serde_json::Value }`
- `input_schema(fields: &[InputField], required: &[&str]) -> JsonObject` builder function
- Re-export in `main.rs` `mod tool_schema;`

**Files:**
- `crates/mcp-server/src/tool_schema.rs` (create)
- `crates/mcp-server/src/main.rs` (add `mod tool_schema;`)

**Dependencies:** None

**Verification:**
- `cargo check -p mcp-server` passes
- Unit test in `tool_schema.rs` asserting `input_schema(...)` produces valid JSON Schema object with `properties` and `required` keys

---

### T2: Add `JsonSchema` derive to relevant DTO types

**Task ID:** T2

**Description:** Add `#[derive(JsonSchema)]` to all DTO types used as tool output. Types are spread across:
- `types/workflow_dto.rs`: `WorkflowSummary`, `WorkflowDto`, `Dag`, `DagNode`, `DagEdge`, `StageDto`, `ExecutionConfig`, `Condition`, `RetryConfig`, `StageExecution`, `StageOutputDto`, `ArtifactRef`
- `types/execution.rs`: `ExecutionSummary`, `ExecutionDto`, `ExecutionStateDto`, `NextStage`, `StageAlternative`, `TriggerInfoDto`
- `types/agent.rs`: `AgentSummary`, `AgentDto`
- `types/skill.rs`: `SkillSummary`, `SkillDto`
- `types/prompt.rs`: `PromptSummary`, `PromptDto`
- `types/artifact_dto.rs`: `ArtifactSummary`, `ArtifactDto`
- `types/insight.rs`: `InsightDto`, `ExecutionAnalytics`, `StageAnalytics`, `ExecutionInsightSummary`, `InsightsAggregateResult`
- `types/metrics_dto.rs`: `MetricsResponse`, `StageMetrics`, `SseUrl`
- `types/impact.rs`: `ImpactItem`, `RecentExecution`, `ImpactData`

**Files:**
- `crates/mcp-server/src/types/workflow_dto.rs`
- `crates/mcp-server/src/types/execution.rs`
- `crates/mcp-server/src/types/agent.rs`
- `crates/mcp-server/src/types/skill.rs`
- `crates/mcp-server/src/types/prompt.rs`
- `crates/mcp-server/src/types/artifact_dto.rs`
- `crates/mcp-server/src/types/insight.rs`
- `crates/mcp-server/src/types/metrics_dto.rs`
- `crates/mcp-server/src/types/impact.rs`

**Dependencies:** None (T1 does not need T2, they are independent)

**Verification:**
- All types compile with `#[derive(JsonSchema)]`
- `cargo check -p mcp-server` passes

---

### T3: Create `output_schema_for_*()` functions for each tool category

**Task ID:** T3

**Description:** Add output schema functions to `tool_schema.rs` for each response DTO used by tools:

```rust
// Workflow output schemas
fn output_schema_for_workflow_list() -> JsonObject
fn output_schema_for_workflow_get() -> JsonObject
fn output_schema_for_workflow_get_dag() -> JsonObject
fn output_schema_for_execution_list() -> JsonObject
fn output_schema_for_execution_get() -> JsonObject
fn output_schema_for_execution_history() -> JsonObject
fn output_schema_for_execution_state() -> JsonObject
fn output_schema_for_next_stage() -> JsonObject

// Agent output schemas
fn output_schema_for_agent_list() -> JsonObject
fn output_schema_for_agent_get() -> JsonObject

// Skill output schemas
fn output_schema_for_skill_list() -> JsonObject
fn output_schema_for_skill_get() -> JsonObject

// Prompt output schemas
fn output_schema_for_prompt_list() -> JsonObject
fn output_schema_for_prompt_get() -> JsonObject

// Artifact output schemas
fn output_schema_for_artifact_create() -> JsonObject
fn output_schema_for_artifact_get() -> JsonObject
fn output_schema_for_artifact_list() -> JsonObject

// Insight output schemas
fn output_schema_for_insights_log() -> JsonObject
fn output_schema_for_insights_query() -> JsonObject
fn output_schema_for_insights_aggregate() -> JsonObject

// Metrics output schemas
fn output_schema_for_metrics_query() -> JsonObject
fn output_schema_for_metrics_subscribe() -> JsonObject

// Impact output schema
fn output_schema_for_analyze_impact() -> JsonObject
```

Each function calls `schemars::schema_for!(T)` and returns the schema as `JsonObject`.

**Files:**
- `crates/mcp-server/src/tool_schema.rs`

**Dependencies:** T2 (needs `JsonSchema` on DTOs)

**Verification:**
- Each function returns a valid `JsonObject`
- Unit tests in `tool_schema.rs` asserting each schema validates its corresponding DTO

---

## Batch 2 - Wire Schemas into Tool::new()

Depends on T1+T3. Updates all 26 `Tool::new()` calls in `main.rs` to include output schemas.

### T4: Update all `Tool::new()` calls in `main.rs` to include input_schema and output_schema

**Task ID:** T4

**Description:** In `list_tools_internal()` in `crates/mcp-server/src/main.rs`, update every `Tool::new()` call from:
```rust
Tool::new(TOOL_WORKFLOW_GET, "Get a workflow by ARN", get_schema(&["arn"]))
```
To:
```rust
Tool::new(
    TOOL_WORKFLOW_GET,
    "Get a workflow by ARN",
    tool_schema::input_schema(&[...], &["arn"]),
    Some(tool_schema::output_schema_for_workflow_get()),
)
```

Requires `use tool_schema::{input_schema, output_schema_for_workflow_get, ...};` at the top of `main.rs`.

**Files:**
- `crates/mcp-server/src/main.rs`

**Dependencies:** T1, T3

**Verification:**
- All 26 tool registrations include both input and output schemas
- `cargo check -p mcp-server` passes
- `curl localhost:8080/mcp` (after server start) returns schema objects in tool descriptions

---

## Batch 3 - Meta-tools + Telemetry

Independent of Batch 2. Implements `tool_search`, `tool_inspect`, and telemetry.

### T5: Implement `tool_search` meta-tool

**Task ID:** T5

**Description:** Add `tool_search` tool to `main.rs`:
- Tool constant: `const TOOL_TOOL_SEARCH: &str = "tool_search";`
- Input schema: `{ category: Option<String>, tag: Option<String>, source_type: Option<String> }`
- Handler: queries `state.node_service().list_by_type(NodeType::Tool)` with filters
- Returns `Vec<ToolSearchResult>`: `{ arn, name, description, category, tags, source_type }`

Also add to `list_tools_internal()` and `call_tool_internal()` match arm.

**Files:**
- `crates/mcp-server/src/main.rs`

**Dependencies:** None (uses existing `NodeService` API)

**Verification:**
- `just dev-refresh && just health` passes
- `curl -X POST localhost:8080/mcp -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"tool_search","arguments":{}},"id":1}'` returns tool list

---

### T6: Implement `tool_inspect` meta-tool

**Task ID:** T6

**Description:** Add `tool_inspect` tool to `main.rs`:
- Tool constant: `const TOOL_TOOL_INSPECT: &str = "tool_inspect";`
- Input schema: `{ arn: String }`
- Handler: looks up tool by ARN from `state.node_service().get()`, returns full metadata + input/output schemas
- Returns `ToolInspectResult`: `{ arn, name, description, category, tags, source_type, input_schema, output_schema }`

Also add to `list_tools_internal()` and `call_tool_internal()` match arm.

**Files:**
- `crates/mcp-server/src/main.rs`

**Dependencies:** T5 (uses same pattern)

**Verification:**
- `tool_inspect { arn: "arn:local:global:tool/bash" }` returns full tool metadata with schemas

---

### T7: Add ToolCall metric emission in `call_tool()`

**Task ID:** T7

**Description:** In `ServerHandler::call_tool()` in `crates/mcp-server/src/main.rs`, wrap `call_tool_internal()` with timing and broadcast a `MetricEvent` before returning.

In `crates/metrics/src/domain/metric.rs`, add `ToolCall` variant to `MetricEventType`:
```rust
pub enum MetricEventType {
    Started,
    Completed,
    Failed,
    Progress,
    ArtifactCreated,
    ToolCall,  // NEW
}
```

In `crates/mcp-server/src/main.rs`:
```rust
let start = std::time::Instant::now();
let result = self.call_tool_internal(&name, arguments).await;
let duration_ms = start.elapsed().as_millis() as u64;

self._broadcaster.broadcast(MetricEvent::new(
    "*".to_string(),  // execution_arn: "*" for non-execution tools
    format!("tool:{}", name),
    MetricEventType::ToolCall,  // NOTE: need to add this variant
).with_duration(duration_ms)
.with_custom(serde_json::json!({
    "tool_name": name,
    "success": !matches!(result, CallToolResult::Error(_)),
})));
```

**Files:**
- `crates/metrics/src/domain/metric.rs`
- `crates/mcp-server/src/main.rs`

**Dependencies:** None

**Verification:**
- `cargo check -p mcp-server -p metrics` passes
- SSE stream at `/metrics/sse?execution=*` shows `ToolCall` events after tool invocations

---

## Batch 4 - CLI + Seed

### T8: `just tool` REPL recipe in justfile

**Task ID:** T8

**Description:** Add `tool` recipe to `justfile` at line ~100:
```just
# Interactive MCP tool REPL
tool:
    #!/bin/bash
    set -euo pipefail
    PORT="${MCP_PORT:-8080}"
    echo "MCP Tool REPL — connecting to localhost:$PORT"
    echo "Available tools: workflow_list, workflow_get, workflow_get_dag, ..."
    echo "Type 'exit' to quit"
    while true; do
        read -r -p "> " cmd args
        [ "$cmd" = "exit" ] && break
        curl -s -X POST "http://localhost:$PORT/mcp" \
            -H "Content-Type: application/json" \
            -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"$cmd\",\"arguments\":$args},\"id\":1}" \
        | jq .
    done
```

Add `tool-*` convenience recipes:
```just
tool-workflow-list:
    curl -s -X POST "http://localhost:${MCP_PORT:-8080}/mcp" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"workflow_list","arguments":{}},"id":1}' \
        | jq .

tool-workflow-get:
    #!/bin/bash
    # Usage: just tool-workflow-get '{"arn":"arn:local:global:workflow/sdd-full"}'
    curl -s -X POST "http://localhost:${MCP_PORT:-8080}/mcp" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"workflow_get\",\"arguments\":$1},\"id\":1}" \
        | jq .
```

**Files:**
- `justfile`

**Dependencies:** None

**Verification:**
- `just tool-workflow-list` returns JSON workflow list
- `just tool-workflow-get '{"arn":"arn:local:global:workflow/sdd-full"}'` returns workflow

---

### T9: `just seed` recipe in justfile

**Task ID:** T9

**Description:** Add `seed` recipe to `justfile`:
```just
# Seed the registry with sample resources from resources/seed/
seed:
    #!/bin/bash
    set -euo pipefail
    WORKSPACE="${WORKSPACE_DIR:-$HOME/.workflows}"
    SEED_DIR="{{ ROOT }}/crates/mcp-server/src/resources/seed"
    echo "Seeding registry from $SEED_DIR..."
    cargo run --bin workflow-mcp -- start --workspace "$WORKSPACE" &
    SERVER_PID=$!
    sleep 3
    for f in "$SEED_DIR"/*.yaml; do
        [ -f "$f" ] || continue
        echo "Loading $(basename "$f")..."
        # Register via REST API or direct DB
    done
    kill $SERVER_PID 2>/dev/null || true
    echo "Seeding complete."
```

**Files:**
- `justfile`

**Dependencies:** T10

**Verification:**
- `just seed` runs without error
- `just tool-workflow-list` shows seed resources after running

---

### T10: Create seed YAML files in `resources/seed/`

**Task ID:** T10

**Description:** Create `crates/mcp-server/src/resources/seed/` directory with 5 YAML files matching deterministic ARNs:

1. `workflow-seed-echo.yaml` — ARN: `arn:local:global:workflow/seed-echo`
   - Simple echo workflow with one stage that logs input

2. `agent-seed-debugger.yaml` — ARN: `arn:local:global:agent/seed-debugger`
   - Debugger agent with `analyze_impact` and `workflow_*` tools enabled

3. `skill-seed-code-review.yaml` — ARN: `arn:local:global:skill/seed-code-review`
   - Code review skill with trigger "code review"

4. `prompt-seed-system.yaml` — ARN: `arn:local:global:prompt/seed-system`
   - System prompt template with `{{context}}` variable

5. `tool-seed-validate.yaml` — ARN: `arn:local:global:tool/seed-validate`
   - Custom tool with `input_schema` describing `{ code: string, language: string }`

Each YAML uses the same format as existing bootstrap YAML files (ARN in `arn:` field, `name:`, `description:`, type-specific config).

**Files:**
- `crates/mcp-server/src/resources/seed/` directory (create)
- `crates/mcp-server/src/resources/seed/workflow-seed-echo.yaml`
- `crates/mcp-server/src/resources/seed/agent-seed-debugger.yaml`
- `crates/mcp-server/src/resources/seed/skill-seed-code-review.yaml`
- `crates/mcp-server/src/resources/seed/prompt-seed-system.yaml`
- `crates/mcp-server/src/resources/seed/tool-seed-validate.yaml`

**Dependencies:** None

**Verification:**
- All 5 files parse as valid YAML with expected `arn:` fields
- ARNs match pattern `arn:local:global:{type}/seed-{name}`

---

## Batch 5 - Tests

### T11: Create `tests/mcp-protocol/` crate with `call_mcp_tool()` helper

**Task ID:** T11

**Description:** Create `tests/mcp-protocol/Cargo.toml`:
```toml
[package]
name = "mcp-protocol"
version = "0.1.0"
edition = "2021"

[dependencies]
reqwest = { version = "0.12", features = ["json"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
```

Create `tests/mcp-protocol/src/lib.rs`:
```rust
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
```

**Files:**
- `tests/mcp-protocol/Cargo.toml` (create)
- `tests/mcp-protocol/src/lib.rs` (create)

**Dependencies:** None

**Verification:**
- `cargo check -p mcp-protocol` passes
- `cargo test -p mcp-protocol --no-run` compiles

---

### T12: Write protocol tests for workflow tools

**Task ID:** T12

**Description:** Create `tests/mcp-protocol/tests/workflow_tools.rs`:
```rust
use mcp_protocol::{call_mcp_tool, list_tools};
use std::process::{Command, Child};
use std::time::Duration;

fn start_server(port: u16) -> Child {
    let mut child = Command::new("cargo")
        .args(&["run", "--bin", "workflow-mcp", "--", "start", "--port", &port.to_string()])
        .spawn()
        .expect("Failed to start server");
    std::thread::sleep(Duration::from_secs(3));
    child
}

#[tokio::test]
async fn test_workflow_list() {
    let mut child = start_server(18080);
    let result = list_tools(18080).await.unwrap();
    assert!(result.as_array().map_or(false, |tools| {
        tools.iter().any(|t| t.get("name").and_then(|n| n.as_str()) == Some("workflow_list"))
    }));
    child.kill().unwrap();
}

#[tokio::test]
async fn test_workflow_get() {
    let mut child = start_server(18081);
    let result = call_mcp_tool(18081, "workflow_get", serde_json::json!({
        "arn": "arn:local:global:workflow/sdd-full"
    })).await;
    assert!(result.is_ok());
    child.kill().unwrap();
}

// ... additional tests for workflow_get_dag, workflow_execute, workflow_get_state, etc.
```

**Files:**
- `tests/mcp-protocol/tests/workflow_tools.rs` (create)

**Dependencies:** T11

**Verification:**
- `cargo test -p mcp-protocol -- workflow_` runs and passes

---

### T13: Write protocol tests for agent/skills/prompts tools

**Task ID:** T13

**Description:** Create `tests/mcp-protocol/tests/registry_tools.rs`:
```rust
use mcp_protocol::{call_mcp_tool, list_tools};

#[tokio::test]
async fn test_agent_list() {
    // ... start server on unique port, call agent_list, verify result
}

#[tokio::test]
async fn test_agent_get() {
    // ... call agent_get with arn: "arn:local:global:agent/orchestrator"
}

#[tokio::test]
async fn test_agent_query() {
    // ... call agent_query with query: "orch"
}

#[tokio::test]
async fn test_skill_list() {
    // ... call skill_list, verify returns array
}

#[tokio::test]
async fn test_skill_query() {
    // ... call skill_query with query: "sdd"
}

#[tokio::test]
async fn test_prompt_list() {
    // ... call prompt_list
}

#[tokio::test]
async fn test_prompt_get() {
    // ... call prompt_get with arn
}

#[tokio::test]
async fn test_tool_search() {
    // ... call tool_search with category filter, verify filtered results
}

#[tokio::test]
async fn test_tool_inspect() {
    // ... call tool_inspect with arn, verify full metadata + schemas present
}
```

**Files:**
- `tests/mcp-protocol/tests/registry_tools.rs` (create)

**Dependencies:** T11

**Verification:**
- `cargo test -p mcp-protocol -- registry_` runs and passes

---

## Task Summary Table

| ID | Description | Files | Dependencies | Verification |
|----|-------------|-------|--------------|--------------|
| T1 | Create `tool_schema.rs` with `input_schema()` factory | `tool_schema.rs` (new), `main.rs` | None | `cargo check`, unit tests |
| T2 | Add `JsonSchema` derive to 9 DTO files | 9 DTO files | None | `cargo check` |
| T3 | Create `output_schema_for_*()` functions | `tool_schema.rs` | T2 | Unit tests per function |
| T4 | Wire schemas into all 26 `Tool::new()` calls | `main.rs` | T1, T3 | `cargo check`, schema in `/mcp` response |
| T5 | Implement `tool_search` meta-tool | `main.rs` | None | JSON-RPC call returns filtered tools |
| T6 | Implement `tool_inspect` meta-tool | `main.rs` | T5 | JSON-RPC call returns full metadata + schemas |
| T7 | Add `ToolCall` metric emission in `call_tool()` | `metrics/domain/metric.rs`, `main.rs` | None | SSE stream shows `ToolCall` events |
| T8 | `just tool` REPL recipe in justfile | `justfile` | None | `just tool-workflow-list` returns JSON |
| T9 | `just seed` recipe in justfile | `justfile` | T10 | `just seed` runs without error |
| T10 | Create 5 seed YAML files in `resources/seed/` | 5 YAML files | None | Valid YAML, correct ARNs |
| T11 | Create `tests/mcp-protocol/` crate | `Cargo.toml`, `src/lib.rs` | None | `cargo check -p mcp-protocol` |
| T12 | Write protocol tests for workflow tools | `tests/workflow_tools.rs` | T11 | `cargo test -p mcp-protocol -- workflow_` |
| T13 | Write protocol tests for agent/skills/prompts | `tests/registry_tools.rs` | T11 | `cargo test -p mcp-protocol -- registry_` |

---

## Execution Order

**Phase 1 (parallel):** T1, T2, T10, T11
**Phase 2 (after T1+T2):** T3, T8
**Phase 3 (after T3):** T4
**Phase 4 (parallel, independent):** T5, T6, T7, T9, T12, T13
**Phase 5 (after T11):** T12, T13
