# Design: MCP Tool Quality Improvements

## Technical Approach

Seven independent improvements to the MCP tool layer — no architecture changes required. Additive changes on top of existing `rmcp` Tool model, with `schemars` (already in the workspace) generating output schemas and a new `tool_schema` module centralizing input schema factories.

---

## Architecture Decisions

### 1. Output Schemas: schemars `schema_for!()`

| Option | Tradeoff |
|--------|----------|
| **schemars derive + schema_for!()** | Requires `#[derive(JsonSchema)]` on DTOs but reuses existing pipeline from `crate::schema` |
| Manual `serde_json::json!()` blobs | No extra derive, but schemas desync from Rust types — rejected |

**Decision**: Add `JsonSchema` to key DTOs in `crates/mcp-server/src/types/` and call `schemars::schema_for!(Type)` per tool. The `schema` crate already uses this pattern for ToolSpec→API schema.

### 2. Input Schema Factory

| Option | Tradeoff |
|--------|----------|
| **New `tool_schema::input()` builder with description map** | Clean factory pattern, single truth |
| Extend existing `get_schema()` inline | Fragile; string field names leak |

**Decision**: New `crates/mcp-server/src/tool_schema.rs` with `fn input_schema(fields: &[InputField], required: &[&str]) -> JsonObject` where `InputField { name, description, json_type, example }`.

### 3. `just tool` CLI

| Option | Tradeoff |
|--------|----------|
| **Bash while-read loop in justfile recipe** | Zero deps, immediate, debug-friendly |
| Rust binary (`cargo run --bin tool-cli`) | More features, but adds binary overhead |

**Decision**: Bash REPL in `justfile`. The justfile already has 738 lines; a 40-line bash recipe is lighter.

### 4. MCP Protocol Tests

| Option | Tradeoff |
|--------|----------|
| **Rust integration test crate (`tests/mcp-protocol/`)** | Native `cargo test`, deterministic, uses `rmcp` types |
| Stay with TypeScript/Playwright only | Playwright already exists, but no Rust-side protocol tests |

**Decision**: New `tests/mcp-protocol/` crate with `mcp_helper::call_tool()` using direct JSON-RPC over HTTP. Complements existing TS tests — Rust tests are deterministic and CI-friendly without Node.

### 5. Progressive Discovery Meta-Tools

| Option | Tradeoff |
|--------|----------|
| **MCP tools `tool_search` and `tool_inspect`** | Reuses existing MCP dispatch, discoverable by any MCP client |
| REST endpoint `/api/tools/search` | Only REST clients benefit; MCP clients get nothing |

**Decision**: Two new MCP tools. `tool_search` queries `registry.node_service.list_by_type(NodeType::Tool)` with `category`/`tag`/`source_type` filters. `tool_inspect` returns full details + schemas for a single tool ARN.

### 6. Seed Data

| Option | Tradeoff |
|--------|----------|
| **YAML files in `resources/seed/` + `just seed`** | Reuses existing `bootstrap.register_resources_to_db()`, deterministic |
| SQLite dump | Opaque, hard to diff |

**Decision**: `just seed` runs `cargo run --bin workflow-mcp -- seed --dir crates/mcp-server/src/resources/seed/`. Fixed ARNs: `arn:local:global:workflow/seed-echo`, `arn:local:global:agent/seed-debugger`, etc.

### 7. Tool Telemetry

| Option | Tradeoff |
|--------|----------|
| **`broadcaster.broadcast()` before `to_result()` in call_tool** | Broadcasts already owned by WorkflowServer, zero overhead added |
| New tracing subscriber | Adds complexity; broadcaster exists |

**Decision**: Emit `MetricEvent` in `call_tool()` with `event_type: ToolCall`, `tool_name`, `duration_ms`, `success: bool`. No new infrastructure required.

---

## Data Flow

```
MCP Client → POST /mcp (tools/call)
         │
         v
ServerHandler::call_tool() ──→ tool_schema::input_schema()  (registration)
         │                        tool_schema::output_schema()
         v
WorkflowServer::call_tool_internal()
         │
         ├── MetricsBroadcaster::broadcast(MetricEvent::ToolCall { ... })
         │
         └── match name { ... } → handler → to_result()
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `crates/mcp-server/src/tool_schema.rs` | **Create** | Central `input_schema()` builder + per-tool output schema fns |
| `crates/mcp-server/src/main.rs` | Modify | Wire schemas into 26 `Tool::new()` calls; add `tool_search`/`tool_inspect` to list_tools and dispatch; emit telemetry in `call_tool()` |
| `crates/mcp-server/src/types/metrics_dto.rs` | Modify | Add `ToolCall` variant to MetricEventType (or new telemetry type) |
| `crates/mcp-server/src/resources/seed/` | **Create** | Seed YAML: workflows, agents, skills, prompts |
| `tests/mcp-protocol/Cargo.toml` | **Create** | Integration test crate |
| `tests/mcp-protocol/src/lib.rs` | **Create** | `call_mcp_tool()` helper |
| `tests/mcp-protocol/tests/` | **Create** | Per-domain test files |
| `justfile` | Modify | Add `seed`, `tool` REPL recipes |
| `crates/mcp-server/Cargo.toml` | Modify | Add `schemars` derive for DTO types (already in deps) |

---

## Interfaces / Contracts

### `tool_schema::InputField`

```rust
pub struct InputField {
    pub name: &'static str,
    pub description: &'static str,
    pub json_type: &'static str,   // "string", "number", "array", "object"
    pub example: serde_json::Value,
}
```

### Output Schema (per tool)

```rust
fn output_schema_for_workflow_list() -> JsonObject {
    schemars::schema_for!(Vec<WorkflowSummary>)
}

fn output_schema_for_agent_get() -> JsonObject {
    schemars::schema_for!(AgentDto)
}
// ... one fn per response DTO
```

### MetricEvent Extension

```rust
MetricEvent::ToolCall {
    execution_arn: String,  // "*" for non-execution tools
    stage_id: String,       // "tool:<tool_name>"
    tool_name: String,
    duration_ms: u64,
    success: bool,
}
```

### Seed Data ARNs (deterministic)

```
arn:local:global:workflow/seed-echo
arn:local:global:agent/seed-debugger
arn:local:global:skill/seed-code-review
arn:local:global:prompt/seed-system
arn:local:global:tool/seed-validate
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| **Unit** | `tool_schema::input_schema()` produces valid JSON Schema | `#[test]` in tool_schema.rs |
| **Unit** | `output_schema_for_*()` matches DTO serialization | `#[test]` asserting schema validates serialized output |
| **Integration** | JSON-RPC protocol: every tool responds to `tools/call` | New `tests/mcp-protocol/` crate, starts server on random port, calls via `reqwest` |
| **Integration** | `tool_search` returns filtered results | Seed DB, assert category filter works |
| **Integration** | `tool_inspect` returns full metadata + schemas | Assert output_schema present and valid |
| **E2E** | Existing `tests/e2e/mcp.spec.ts` still passes | Run `just test_mcp` |
| **CLI** | `just tool workflow_list` returns JSON | Bash assert in justfile |

### MCP Protocol Test Helper

```rust
// tests/mcp-protocol/src/lib.rs
pub async fn call_mcp_tool(
    port: u16,
    tool_name: &str,
    args: serde_json::Value,
) -> Result<serde_json::Value, String>
```

Uses `reqwest` to POST JSON-RPC to `localhost:{port}/mcp`, parses SSE+JSON response.

---

## Migration / Rollout

No migration required. All seven improvements are additive:
- Output schemas: new field on existing `Tool::new()`, ignored by clients that don't read schemas
- Input schemas: replaces current minimal schemas, backward compatible
- `just tool`: new recipe only
- Protocol tests: new test crate, no production code changes
- `tool_search`/`tool_inspect`: new tools, no existing tool changes
- Seed data: new resources created, non-destructive
- Telemetry: new events on existing broadcaster channel

---

## Open Questions

- [ ] Should `tool_search` support full-text search or just tag/category filters? (Start with exact-match filters, add full-text later.)
- [ ] Tool telemetry: should we track per-client or aggregate? (Aggregate first — per-client requires session tracking.)
- [ ] Seed data: 5 resources or more? (Start with 5, expand as needed.)

---

## Entropy Analysis: Information Bottleneck (Protocol C)

**Method**: Heuristic (code reading)

### New/Modified Interfaces

| Interface | I(X;T) Leakage | I(T;Y) Coverage | Bottleneck Quality | SOLID Check |
|-----------|---------------|-----------------|-------------------|-------------|
| `tool_schema::input_schema()` | 0.0 bits (pure factory, stateless) | 1.5 bits (covers 26 tools) | ✅ Optimal | SRP ✅ |
| `tool_schema::output_schema()` per tool | 0.0 bits (fn maps type→schema) | 1.0 bit (exact DTO match) | ✅ Optimal | SRP ✅ |
| `MetricEvent::ToolCall` variant | 0.5 bits (new enum variant) | 1.0 bit (needed by subscribers) | ✅ Optimal | OCP ✅ (extension) |
| `tool_search` handler | 1.0 bit (queries NodeService) | 1.0 bit (returns filtered list) | ✅ Optimal | ISP ✅ |
| `tool_inspect` handler | 1.0 bit (queries NodeService) | 1.2 bits (returns full tool info + schemas) | ✅ Optimal | ISP ✅ |
| MCP protocol test helper | 0.5 bits (new crate deps) | 2.0 bits (covers all tools) | ✅ Optimal | SRP ✅ |

### Connascence Assessment

| Pair | Type | I(bits) | Severity | Notes |
|------|------|---------|----------|-------|
| `tool_schema.rs` ↔ `main.rs` | Name | 1.0 | ⚠️ Low | Schema function names referenced in Tool::new() |
| `tool_schema.rs` ↔ `types/` DTOs | Type | 0.5 | ✅ OK | Imports DTOs for schemars macro — same crate |
| `main.rs` → `MetricsBroadcaster` | Name | 0.5 | ✅ OK | Already imported, used by handlers |

### Design Quality Score (estimated)

| Component | Estimate |
|-----------|----------|
| H_coupling | 0.33 bits (3 connascence pairs, all low) |
| H_cohesion | 0.80 (tool_schema has single clear purpose) |
| Σ KL(LSP) | 0.0 (no subtype changes) |
| Σ I(connascence) | 2.0 bits |

**DQS ≈ 0.30×(1-0.33) + 0.30×0.80 − 0.25×0 − 0.15×2.0 ≈ 0.20 + 0.24 − 0.30 = 0.14**

Rating: **🟡 ACCEPTABLE** (0.0–0.3 range). The low score is driven by the connascence term — adding new interfaces naturally introduces coupling. The design is additive and doesn't degrade existing structure; the coupling is name-level only and can be refactored later by moving schema association into a registry pattern if it grows.

### SOLID-Entropy Compliance

| Principle | Value | Threshold | Status |
|-----------|-------|-----------|--------|
| SRP | `tool_schema` F=0.0 (single purpose) | F < 1.0 | ✅ |
| OCP | H(Δ_existing) = 2.0 bits (main.rs modified) | < 1.0 | ⚠️ Borderline — tool list expansion touches main.rs |
| LSP | No subtype changes | < 0.05 | ✅ |
| ISP | Each interface exposes minimal surface | waste < 1.0 | ✅ |
| DIP | DTOs used via schemars macro, not direct imports | ΔH > 0 | ✅ |

**OCP Warning**: Adding `tool_search`/`tool_inspect` to the `match name {}` dispatch modifies existing code (H ≈ 2.0 bits). This is acceptable because it extends the tool catalog — the alternative (plugin system) is over-engineered for 2 new tools. If the tool count grows beyond 50, extract a `ToolRegistry` trait.
