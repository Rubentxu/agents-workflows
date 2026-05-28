# Phase 1: Quick Wins — Specification

**Change**: architecture-deepening
**Phase**: 1 (Quick Wins)
**Estimated entropy reduction**: ~25 bits
**Risk**: Zero — independent, no shared state, no sequencing constraints

---

## Entropy Targets

| Metric | Current | Target | Verification |
|--------|---------|--------|-------------|
| I(A;B) AppState | ~45 bits | ~30 bits | Connascence count in `state.rs` |
| CoP score | 0.2 | 0.6 | Test-to-production construction ratio |
| Test construction sites | 6 manual | 1 builder | Grep `AppState {` in `tests/` |
| `RestState` references | 103 | 0 | `grep -r "RestState" crates/mcp-server/` |
| `extract_stage_ids` in state.rs | 1 function + 2 tests | 0 | Function deleted from `state.rs` |
| `extract_description` name collisions | 2 impls | 1 canonical | Grep `fn extract_description` |

---

## C11: AppState Test Factory

### Functional Requirements

**FR-C11-1**: `AppState` must provide a `AppState::test()` associated function that returns `Result<AppState>` with all dependencies initialized for testing (in-memory SQLite DB, temporary workspace directory, default service instances).

**FR-C11-2**: The `test()` function must NOT require any parameters — it creates an ephemeral temp directory internally and cleans up on drop via `tempfile::TempDir` held inside the struct.

**FR-C11-3**: The SQLite database must be in-memory (`:memory:`) so tests are isolated and fast.

**FR-C11-4**: All `Arc<Service>` fields must be initialized with functional defaults:
- `node_service`: `Arc<NodeService>` backed by in-memory `SqliteNodeRepository`
- `db`: `Arc<Database>` pointing to in-memory SQLite
- `execution_store`: `Arc<ExecutionStore>` backed by the same in-memory DB
- `artifact_store`: `Arc<ArtifactStore>` backed by the same in-memory DB
- `artifact_service`: `Arc<ArtifactService>` with temp artifacts dir
- `analytics_service`: `Arc<AnalyticsService::new()>`
- `sse_emitter`: `Arc<SseEmitter::new()>`
- `metrics_aggregator`: `Arc<MetricsAggregator::new()>`
- `workspace_root`: path to the temp directory

**FR-C11-5**: A `AppState::test_with_workspace(path: &Path)` variant must accept a pre-existing workspace directory for tests that need to bootstrap files (e.g., `BootstrapService::init()`).

### Non-Functional Requirements

**NFR-C11-1**: No production code path uses `test()` — it is `#[cfg(test)]` or gated behind a `#[cfg(feature = "test-factory")]` feature flag. (Preferred: feature flag so integration tests in `tests/` can use it.)

**NFR-C11-2**: All 6 existing test construction sites (`e2e_workflow_test.rs:32-57`, `performance.rs:27-48`, and 4 others) must be replaced with calls to `AppState::test()` or `AppState::test_with_workspace()`.

### Scenarios

#### Scenario: Basic test factory creates valid AppState
**Given:** No preconditions — fresh test process
**When:** `AppState::test()` is called
**Then:** Returns `Ok(AppState)` where:
- `state.node_service` can `list_all()` returning `Ok(vec![])`
- `state.execution_store.list(10)` returns `Ok(vec![])`
- `state.workspace_root` exists and is a directory
- `state.db` is a valid `Arc<Database>` connection

#### Scenario: Test factory with pre-bootstrapped workspace
**Given:** A `TempDir` with a workspace structure created by `BootstrapService`
**When:** `AppState::test_with_workspace(temp_dir.path())` is called
**Then:** Returns `Ok(AppState)` where:
- `state.node_service.list_by_type(NodeType::Workflow)` returns the bootstrapped workflows
- `state.workspace_root` equals `temp_dir.path()`

#### Scenario: Test factory produces isolated instances
**Given:** Two calls to `AppState::test()` in the same test
**When:** Each is called
**Then:** The two `AppState` instances have different `db` connections, different `workspace_root` paths, and data written to one is not visible in the other.

#### Scenario: Test factory not available in production build
**Given:** The crate is compiled without `test-factory` feature
**When:** Code attempts to call `AppState::test()`
**Then:** Compilation fails with "method not found" error.

### Acceptance Criteria

- [ ] `AppState::test()` exists in `crates/mcp-server/src/state.rs` gated by `#[cfg(feature = "test-factory")]`
- [ ] `AppState::test_with_workspace(path)` exists alongside it
- [ ] `Cargo.toml` for `mcp-server` declares `[features] test-factory = []`
- [ ] All test files (`tests/e2e_workflow_test.rs`, `tests/performance.rs`, and others) use the factory instead of manual construction
- [ ] `grep -r "AppState {" crates/mcp-server/tests/` returns zero matches (no manual struct construction)
- [ ] `cargo test -p mcp-server` passes
- [ ] `cargo check -p mcp-server` passes without `test-factory` feature

---

## C7: RestState → AppState Absorption

### Functional Requirements

**FR-C7-1**: The `started_at: std::time::Instant` field currently in `RestState` must move into `AppState` as `pub started_at: std::time::Instant`.

**FR-C7-2**: The `RestState` struct in `crates/mcp-server/src/rest.rs` must be deleted entirely.

**FR-C7-3**: `AppState` must derive `Clone` (via `Arc` wrapping or field-level clone). Since all fields are already `Arc<_>` or `PathBuf`, `Clone` is trivially derivable.

**FR-C7-4**: All 52+ handler signatures currently accepting `State<RestState>` must accept `State<Arc<AppState>>` instead.

**FR-C7-5**: `create_rest_router` must accept `Arc<AppState>` instead of `RestState`, and call `.with_state(state)` with `Arc<AppState>`.

**FR-C7-6**: The `health_check` function must read `started_at` from `AppState` directly:
```rust
async fn health_check(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let uptime_secs = state.started_at.elapsed().as_secs();
    // ...
}
```

**FR-C7-7**: The 5 delegation methods on `RestState` (`db()`, `list_by_type()`, `get_node()`, `save_node()`, `delete_node()`) must either:
- (a) move to `AppState` if they provide unique value, OR
- (b) be inlined at call sites if they are thin wrappers

Given the codebase analysis:
- `db()`, `list_by_type()`, `get_node()` are thin wrappers → inline at call sites
- `save_node()` contains conflict logic (create-then-update fallback) → move to `AppState`
- `delete_node()` contains existence check → move to `AppState`

**FR-C7-8**: The `AppState::new()` constructor must initialize `started_at` to `std::time::Instant::now()`.

### Non-Functional Requirements

**NFR-C7-1**: No change to REST API behavior — all endpoints return identical responses.

**NFR-C7-2**: No change to MCP handler behavior — MCP handlers already use `AppState` directly.

**NFR-C7-3**: The `main.rs` wiring must simplify from:
```rust
let rest_state = RestState::new(state_for_rest);
let rest_app = create_rest_router(rest_state);
```
to:
```rust
let rest_app = create_rest_router(state_for_rest);
```

### Scenarios

#### Scenario: Health check returns uptime after RestState removal
**Given:** Server started 5 seconds ago
**When:** `GET /api/health` is called
**Then:** Response is `{"status": "healthy", "version": "...", "uptime_seconds": 5}`

#### Scenario: All REST handlers accept AppState directly
**Given:** The refactored codebase
**When:** `grep -r "RestState" crates/mcp-server/src/` is run
**Then:** Returns zero matches.

#### Scenario: Resource CRUD handlers still function
**Given:** A bootstrapped workspace with sdd-full workflow
**When:** `GET /api/workflows` is called
**Then:** Returns 200 with the same workflow list as before the refactor.

#### Scenario: Agent resource CRUD still uses save_node logic
**Given:** An agent ARN that already exists
**When:** `POST /api/agents` with the same ARN is called
**Then:** Returns 409 Conflict (same behavior as current `RestState::save_node()`).

#### Scenario: Workspace deletion still checks existence
**Given:** A workspace that does not exist
**When:** `DELETE /api/workspaces/:id` is called
**Then:** Returns 404 Not Found (same as current `RestState::delete_node()` pattern).

### Acceptance Criteria

- [ ] `RestState` struct deleted from `crates/mcp-server/src/rest.rs`
- [ ] `grep -r "RestState" crates/mcp-server/src/` returns zero matches
- [ ] `grep -r "RestState" crates/mcp-server/tests/` returns zero matches
- [ ] `AppState` has `started_at: std::time::Instant` field
- [ ] `AppState` derives `Clone`
- [ ] All 52+ `State<RestState>` → `State<Arc<AppState>>` replacements compile
- [ ] `create_rest_router` accepts `Arc<AppState>`
- [ ] `save_node()` and `delete_node()` logic preserved in `AppState`
- [ ] `cargo test -p mcp-server` passes
- [ ] `cargo clippy -p mcp-server` passes

---

## C9: state.rs Parser → Domain Parser

### Functional Requirements

**FR-C9-1**: The `extract_stage_ids` function at `state.rs:207-245` must be deleted entirely.

**FR-C9-2**: The `get_workflow_stage_ids` method at `state.rs:127-143` must be rewritten to use `workflow::application::parse_registry_workflow_yaml` (already imported at line 184) and extract stage IDs from the returned `Workflow` struct:
```rust
pub async fn get_workflow_stage_ids(&self, arn: &str) -> Result<Vec<String>> {
    let node = self.node_service.get(arn)
        .ok().flatten()
        .ok_or_else(|| anyhow::anyhow!("Workflow not found: {}", arn))?;
    let config = node.config_json
        .ok_or_else(|| anyhow::anyhow!("Workflow node has no config: {}", arn))?;
    let workflow = parse_registry_workflow_yaml(&node.id, &node.name, &config)
        .map_err(|e| anyhow::anyhow!("Failed to parse workflow: {}", e))?;
    Ok(workflow.stages.iter().map(|s| s.id.clone()).collect())
}
```

**FR-C9-3**: The two tests `extract_stage_ids_from_top_level_mapping` and `extract_stage_ids_from_spec_mapping` in `state.rs:248-293` must be deleted. The `parse_registry_workflow_yaml` function in `workflow::application::parser` already has equivalent coverage.

**FR-C9-4**: The `generate_execution_plan` method at `state.rs:183-204` already uses `parse_registry_workflow_yaml` — no change needed (it confirms the pattern).

### Non-Functional Requirements

**NFR-C9-1**: The domain parser (`parse_registry_workflow_yaml`) becomes the single source of YAML-to-domain parsing. No ad-hoc YAML traversal remains in `state.rs`.

**NFR-C9-2**: `state.rs` line count decreases by ~86 lines (function body 38L + tests 46L + whitespace).

**NFR-C9-3**: No behavioral change — `get_workflow_stage_ids` returns the same `Vec<String>` for the same inputs.

### Scenarios

#### Scenario: get_workflow_stage_ids uses domain parser for mapping stages
**Given:** A workflow node with YAML config containing `spec.stages` mapping:
```yaml
spec:
  stages:
    explore: { id: sdd-explore, agent: orchestrator }
    propose: { id: sdd-propose, agent: orchestrator }
```
**When:** `state.get_workflow_stage_ids("arn:local:global:workflow/test").await`
**Then:** Returns `Ok(vec!["sdd-explore", "sdd-propose"])`

#### Scenario: get_workflow_stage_ids uses domain parser for sequence stages
**Given:** A workflow node with YAML config containing `stages` as a sequence:
```yaml
stages:
  - { id: build, agent: builder }
  - { id: test, agent: tester }
```
**When:** `state.get_workflow_stage_ids("arn:local:global:workflow/test").await`
**Then:** Returns `Ok(vec!["build", "test"])`

#### Scenario: Workflow not found
**Given:** No workflow node with the given ARN
**When:** `state.get_workflow_stage_ids("arn:local:global:workflow/missing").await`
**Then:** Returns `Err` containing "Workflow not found"

#### Scenario: Workflow node has no config
**Given:** A workflow node with `config_json = None`
**When:** `state.get_workflow_stage_ids("arn:local:global:workflow/no-config").await`
**Then:** Returns `Err` containing "has no config"

#### Scenario: Invalid YAML in config
**Given:** A workflow node with `config_json = Some("not: valid: yaml: [[")` (truly malformed)
**When:** `state.get_workflow_stage_ids("arn:local:global:workflow/bad").await`
**Then:** Returns `Err` containing "Failed to parse workflow"

#### Scenario: extract_stage_ids function no longer exists in state.rs
**Given:** The refactored codebase
**When:** `grep "fn extract_stage_ids" crates/mcp-server/src/state.rs`
**Then:** Returns zero matches.

### Acceptance Criteria

- [ ] `extract_stage_ids` function deleted from `state.rs`
- [ ] `extract_stage_ids` tests deleted from `state.rs`
- [ ] `get_workflow_stage_ids` uses `parse_registry_workflow_yaml` + `workflow.stages.iter().map(|s| s.id.clone())`
- [ ] `state.rs` reduced by ~86 lines
- [ ] No ad-hoc YAML traversal (`serde_yaml::from_str` + manual `.get("spec")`) remains in `state.rs`
- [ ] `cargo test -p mcp-server` passes
- [ ] `cargo test -p workflow` passes (domain parser tests unchanged)

---

## C10: extract_description Rename

### Functional Requirements

**FR-C10-1**: `McpHandler::extract_description` at `handler.rs:70` must be renamed to `McpHandler::description_from_metadata`. The new name clarifies that the function extracts a description string from the node's `metadata_json` field, NOT from `config_json`.

**FR-C10-2**: All 11 call sites in `handler.rs` (lines 105, 123, 150, 153, 175, 193, 219, 222, 244, 262) and 2 call sites in `workflow_handler.rs` (lines 51, 126) must be updated to `Self::description_from_metadata(&node)` or `McpHandler::description_from_metadata(&node)`.

**FR-C10-3**: The local `extract_description` in `resources/agent.rs:137-148` is a DIFFERENT function — it parses `config_json` (YAML), not `metadata_json`. It must be renamed to `description_from_config` to distinguish it from `description_from_metadata`.

**FR-C10-4**: The `resources/agent.rs:131` call site must be updated to `description_from_config(node)`.

### Non-Functional Requirements

**NFR-C10-1**: No behavioral change — functions return identical results for identical inputs.

**NFR-C10-2**: The names `description_from_metadata` and `description_from_config` make the data source explicit, reducing confusion about which JSON field is being parsed.

**NFR-C10-3**: Consider a future refactor where both converge on a single `Node::description()` method, but that is Phase 3+ scope.

### Scenarios

#### Scenario: description_from_metadata with valid metadata
**Given:** A `Node` with `metadata_json = Some(r#"{"description": "My agent"}"#)`
**When:** `McpHandler::description_from_metadata(&node)` is called
**Then:** Returns `"My agent"` (identical to old `extract_description` behavior).

#### Scenario: description_from_metadata with missing metadata
**Given:** A `Node` with `metadata_json = None`
**When:** `McpHandler::description_from_metadata(&node)` is called
**Then:** Returns `String::new()` (empty string).

#### Scenario: description_from_metadata with metadata missing description key
**Given:** A `Node` with `metadata_json = Some(r#"{"name": "foo"}"#)`
**When:** `McpHandler::description_from_metadata(&node)` is called
**Then:** Returns `String::new()`.

#### Scenario: description_from_config with spec-wrapped YAML
**Given:** A `Node` with `config_json = Some("spec:\n  description: Build agent")`
**When:** `description_from_config(&node)` is called (in `resources/agent.rs`)
**Then:** Returns `"Build agent"`.

#### Scenario: description_from_config with missing config
**Given:** A `Node` with `config_json = None`
**When:** `description_from_config(&node)` is called
**Then:** Returns `String::new()`.

#### Scenario: Old name no longer exists
**Given:** The refactored codebase
**When:** `grep -r "fn extract_description" crates/mcp-server/src/`
**Then:** Returns zero matches.

### Acceptance Criteria

- [ ] `McpHandler::extract_description` renamed to `McpHandler::description_from_metadata` in `handler.rs`
- [ ] All 13 call sites updated (11 in `handler.rs`, 2 in `workflow_handler.rs`)
- [ ] `resources/agent.rs::extract_description` renamed to `description_from_config`
- [ ] Call site at `resources/agent.rs:131` updated
- [ ] `grep -r "fn extract_description" crates/mcp-server/src/` returns zero matches
- [ ] `cargo test -p mcp-server` passes
- [ ] `cargo clippy -p mcp-server` passes

---

## Phase 1 Execution Order

Candidates are independent but recommended order minimizes context switches:

| Step | Candidate | Files Modified | Lines Changed |
|------|-----------|----------------|---------------|
| 1 | C11 (Test Factory) | `state.rs`, `Cargo.toml`, `tests/*.rs` | +50 / -0 |
| 2 | C10 (Rename) | `handler.rs`, `workflow_handler.rs`, `resources/agent.rs` | +13 / -13 |
| 3 | C9 (Parser) | `state.rs` | +10 / -86 |
| 4 | C7 (RestState) | `rest.rs`, `rest_handlers.rs`, `main.rs`, `resources/*.rs`, `tests/*.rs` | +20 / -93 |

**Total estimated delta**: +93 / -192 = net -99 lines

Each step must produce a passing `cargo test -p mcp-server && cargo clippy -p mcp-server` before proceeding.

---

## Cross-Cutting Verification

After all 4 candidates are complete:

- [ ] `cargo test -p mcp-server` green
- [ ] `cargo clippy -p mcp-server` green
- [ ] `grep -r "RestState" crates/mcp-server/` returns zero matches
- [ ] `grep -r "fn extract_stage_ids" crates/mcp-server/` returns zero matches
- [ ] `grep -r "fn extract_description" crates/mcp-server/` returns zero matches
- [ ] `grep -r "AppState {" crates/mcp-server/tests/` returns zero matches (test factory used)
- [ ] No change to any REST API response body or status code
- [ ] No change to any MCP tool response format
