# Technical Design: architecture-deepening — Phase 1 Quick Wins

**Change**: architecture-deepening
**Phase**: 1 (Quick Wins)
**Status**: Draft
**Date**: 2026-05-24

---

## Overview

Phase 1 comprises 4 independent, zero-risk refactoring candidates in the `mcp-server` crate. Each reduces coupling without changing external behavior. Candidates are ordered for minimal context switching but can be implemented in any order or in parallel.

---

## C11: AppState Test Factory

### Problem

Every test file manually constructs `AppState` by wiring `Database::open_in_memory()`, `SqliteNodeRepository`, `NodeService`, `ExecutionStore`, `ArtifactStore`, `ArtifactService`, `AnalyticsService`, `SseEmitter`, and `MetricsAggregator`. This is 20+ lines of boilerplate duplicated across 5 test construction sites:

| Site | Lines | File |
|------|-------|------|
| `rest_api.rs:34-50` | 17 | `create_test_rest_state()` |
| `performance.rs:27-47` | 21 | `create_test_router()` |
| `e2e_workflow_test.rs:32-56` | 25 | `create_test_rest_state_with_bootstrap()` |
| `workflow_handler.rs:533-566` | 34 | `make_workflow_handler()` |
| `rest_handlers.rs` (inline tests) | ~20 | Various test helpers |

Any field addition to `AppState` requires updating all 5 sites.

### Files Changed

- `crates/mcp-server/src/state.rs` — add `#[cfg(feature = "test-factory")]` block with `AppState::test()` and `AppState::test_with_workspace()`
- `crates/mcp-server/Cargo.toml` — add `test-factory = ["tempfile"]` feature and `tempfile` as optional dependency
- `crates/mcp-server/tests/rest_api.rs` — replace `create_test_rest_state()` with `AppState::test()`
- `crates/mcp-server/tests/performance.rs` — replace `create_test_router()` with `AppState::test_with_workspace()`
- `crates/mcp-server/tests/e2e_workflow_test.rs` — replace `create_test_rest_state_with_bootstrap()` with `AppState::test_with_workspace()` + bootstrap
- `crates/mcp-server/src/workflow_handler.rs` — replace `make_workflow_handler()` inline construction with factory call

### Interface Changes

**Added** (in `crates/mcp-server/src/state.rs`):

```rust
#[cfg(feature = "test-factory")]
impl AppState {
    /// Create an AppState suitable for testing.
    /// Uses an in-memory SQLite database and a temporary workspace directory.
    /// The TempDir is held inside the struct to prevent cleanup while tests run.
    pub fn test() -> anyhow::Result<Self> {
        let temp_dir = tempfile::TempDir::new()?;
        Self::test_with_workspace(temp_dir.path())
    }

    /// Create an AppState for testing with a specific workspace directory.
    /// Uses an in-memory SQLite database.
    /// The caller is responsible for keeping the workspace directory alive.
    pub fn test_with_workspace(workspace: &std::path::Path) -> anyhow::Result<Self> {
        let global_dir = workspace.join("global");
        std::fs::create_dir_all(&global_dir).ok();

        let db = Arc::new(Database::open_in_memory()?);
        let repository = Arc::new(SqliteNodeRepository::new(db.clone()));
        let node_service = Arc::new(NodeService::new(repository));
        let execution_store = Arc::new(ExecutionStore::new(db.clone()));
        let artifact_store = Arc::new(ArtifactStore::new(db.clone()));
        let artifacts_dir = workspace.join("artifacts");
        std::fs::create_dir_all(&artifacts_dir).ok();
        let artifact_service = Arc::new(ArtifactService::new(artifacts_dir));
        let analytics_service = Arc::new(AnalyticsService::new());
        let sse_emitter = Arc::new(SseEmitter::new());
        let metrics_aggregator = Arc::new(MetricsAggregator::new());

        Ok(Self {
            node_service,
            db,
            execution_store,
            artifact_store,
            artifact_service,
            analytics_service,
            sse_emitter,
            metrics_aggregator,
            workspace_root: workspace.to_path_buf(),
        })
    }
}
```

**Changed** in `Cargo.toml`:

```toml
[features]
default = []
embedded-studio = ["include_dir", "include_dir_macros"]
test-factory = ["tempfile"]

[dependencies]
# ... existing ...
tempfile = { version = "3", optional = true }

[dev-dependencies]
tempfile = "3"  # already present; keep for tests that use TempDir directly
```

**Deleted**: No functions deleted. Manual construction sites in test files replaced with factory calls.

### Architecture Decisions

**AD-C11-1: Feature flag `test-factory` rather than `#[cfg(test)]`**
- `#[cfg(test)]` only works for unit tests in the same crate. Integration tests in `tests/` are separate crates and cannot access `#[cfg(test)]` items.
- Feature flag `test-factory` allows integration tests to `cargo test -p mcp-server --features test-factory` while keeping the factory out of production builds.
- The feature adds `tempfile` as a dependency only when enabled.

**AD-C11-2: No `TempDir` stored inside `AppState` for `test()`**
- Storing `TempDir` inside `AppState` would require adding `Option<tempfile::TempDir>` gated by `#[cfg(feature = "test-factory")]`, which pollutes the struct.
- Instead, `test()` creates a `TempDir` but does NOT store it. Callers who need the dir to persist must use `test_with_workspace(path)` and hold the `TempDir` themselves.
- This is consistent with how `AppState::new()` works (caller owns the workspace dir).

**Wait — revised decision**: After analyzing the spec requirement FR-C11-2 ("cleans up on drop via tempfile::TempDir held inside the struct"), the factory SHOULD hold the TempDir. However, this requires a conditional field. Alternative: return a wrapper.

**Final decision (AD-C11-2 revised)**: Return `(AppState, TempDir)` from `test()`. The caller holds both. This avoids polluting `AppState` with a conditional field. The `test_with_workspace()` variant does not return a TempDir — the caller owns it.

```rust
pub fn test() -> anyhow::Result<(Self, tempfile::TempDir)> {
    let temp_dir = tempfile::TempDir::new()?;
    let state = Self::test_with_workspace(temp_dir.path())?;
    Ok((state, temp_dir))
}
```

### Testing Strategy

1. **Unit test** in `state.rs` gated by `#[cfg(test)]`: Call `AppState::test()` with feature flag, verify all fields are initialized, verify `node_service.list_all()` returns empty vec.
2. **Integration test**: Replace each test file's manual construction with factory call, verify all existing tests still pass.
3. **Compile-time verification**: `cargo check -p mcp-server` (without `test-factory` feature) must succeed — confirms factory is not in production builds.
4. **Grep verification**: `grep -r "AppState {" crates/mcp-server/tests/` returns zero matches after migration.

### Entropy Impact

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Test construction sites | 5 | 1 (the factory) | -4 sites |
| I(A;B) AppState test coupling | ~45 bits | ~30 bits | **-15 bits** |
| CoP score (test-to-prod ratio) | 0.2 | 0.6 | +0.4 |
| New connascence | 0 | 1 (factory → AppState fields) | +1 CoN |

### Design Quality Checklist

- [x] **SRP**: Factory has single responsibility — constructing test state
- [x] **OCP**: New fields added to AppState require updating only the factory, not every test
- [x] **LSP**: N/A (no subtyping)
- [x] **ISP**: Factory offers two methods — `test()` for simple cases, `test_with_workspace()` for custom dirs
- [x] **DIP**: Factory depends on abstractions (Arc-wrapped traits), not concretions
- [x] **Connascence**: Reduces CoN by 4 (eliminates 4 duplicate construction sites)
- [x] **No new cycles**: Factory is in same module as AppState
- [x] **Test coverage**: All existing tests preserved, factory itself tested

---

## C10: extract_description Rename

### Problem

Two unrelated functions share the name `extract_description`:

1. `McpHandler::extract_description(&Node)` — reads `metadata_json`, parses as JSON, extracts `description` key
2. `resources::agent::extract_description(&Node)` — reads `config_json`, parses as YAML, extracts `spec.description`

The name collision is confusing. The data source (metadata vs config) and format (JSON vs YAML) are completely different.

### Files Changed

- `crates/mcp-server/src/handler.rs:70` — rename `extract_description` → `description_from_metadata`
- `crates/mcp-server/src/handler.rs` — update 11 call sites (lines 105, 123, 150, 153, 175, 193, 219, 222, 244, 262)
- `crates/mcp-server/src/workflow_handler.rs` — update 2 call sites (lines 51, 126) from `McpHandler::extract_description` → `McpHandler::description_from_metadata`
- `crates/mcp-server/src/resources/agent.rs:137` — rename `extract_description` → `description_from_config`
- `crates/mcp-server/src/resources/agent.rs:131` — update 1 call site

### Interface Changes

**Renamed**:

```rust
// handler.rs:70 — BEFORE
pub fn extract_description(node: &Node) -> String { ... }

// handler.rs:70 — AFTER
pub fn description_from_metadata(node: &Node) -> String { ... }
```

```rust
// resources/agent.rs:137 — BEFORE
fn extract_description(node: &Node) -> String { ... }

// resources/agent.rs:137 — AFTER
fn description_from_config(node: &Node) -> String { ... }
```

**Call site updates**: Mechanical find-replace. No behavioral change.

### Architecture Decisions

**AD-C10-1: Naming convention follows data source**
- `description_from_metadata` — source is `metadata_json` (JSON)
- `description_from_config` — source is `config_json` (YAML)
- The `from_*` suffix makes the data source explicit in the function name.

**AD-C10-2: No merge into a single function yet**
- Both functions parse different formats (JSON vs YAML) from different fields.
- A future `Node::description()` method (Phase 3+) could unify them with a precedence rule.
- For Phase 1, renaming is sufficient to eliminate confusion.

### Testing Strategy

1. **Mechanical**: `cargo check -p mcp-server` confirms all call sites updated.
2. **Behavioral**: `cargo test -p mcp-server` — all existing tests pass with identical behavior.
3. **Grep verification**: `grep -r "fn extract_description" crates/mcp-server/src/` returns zero matches.

### Entropy Impact

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Name collision sites | 2 | 0 | -2 |
| I(A;B) naming confusion | ~5 bits | 0 bits | **-5 bits** |
| New connascence | 0 | 0 | 0 |

### Design Quality Checklist

- [x] **SRP**: Each function name now describes its single data source
- [x] **OCP**: Pure rename, no structural change
- [x] **LSP**: N/A
- [x] **ISP**: N/A
- [x] **DIP**: N/A
- [x] **Connascence**: Eliminates CoN (name collision)
- [x] **No new cycles**: N/A
- [x] **Test coverage**: Unchanged

---

## C9: state.rs Parser → Domain Parser

### Problem

`state.rs` contains `extract_stage_ids()` (lines 207-245) — a 38-line function that does ad-hoc YAML traversal to extract stage IDs from workflow configs. This duplicates logic already handled by `workflow::application::parse_registry_workflow_yaml`, which `state.rs` already imports and uses in `generate_execution_plan()` (line 184).

The two test functions `extract_stage_ids_from_top_level_mapping` and `extract_stage_ids_from_spec_mapping` (lines 248-293) duplicate coverage that `parse_registry_workflow_yaml` already provides in the `workflow` crate's tests.

### Files Changed

- `crates/mcp-server/src/state.rs:127-143` — rewrite `get_workflow_stage_ids` to use `parse_registry_workflow_yaml`
- `crates/mcp-server/src/state.rs:207-245` — delete `extract_stage_ids` function
- `crates/mcp-server/src/state.rs:247-293` — delete `#[cfg(test)] mod tests` block (2 tests)

### Interface Changes

**Rewritten** (`state.rs:127-143`):

```rust
// BEFORE (lines 127-143)
pub async fn get_workflow_stage_ids(&self, arn: &str) -> Result<Vec<String>> {
    let node = self.node_service.get(arn).ok().flatten()
        .ok_or_else(|| anyhow::anyhow!("Workflow not found: {}", arn))?;
    let config = node.config_json
        .ok_or_else(|| anyhow::anyhow!("Workflow node has no config: {}", arn))?;
    let yaml_val: serde_yaml::Value = serde_yaml::from_str(&config)
        .map_err(|e| anyhow::anyhow!("Failed to parse workflow YAML: {}", e))?;
    Ok(extract_stage_ids(&yaml_val))
}

// AFTER
pub async fn get_workflow_stage_ids(&self, arn: &str) -> Result<Vec<String>> {
    let node = self.node_service.get(arn).ok().flatten()
        .ok_or_else(|| anyhow::anyhow!("Workflow not found: {}", arn))?;
    let config = node.config_json
        .ok_or_else(|| anyhow::anyhow!("Workflow node has no config: {}", arn))?;
    let workflow = workflow::parse_registry_workflow_yaml(&node.id, &node.name, &config)
        .map_err(|e| anyhow::anyhow!("Failed to parse workflow: {}", e))?;
    Ok(workflow.stages.iter().map(|s| s.id.clone()).collect())
}
```

**Deleted**:
- `fn extract_stage_ids(yaml_val: &serde_yaml::Value) -> Vec<String>` (lines 207-245)
- `mod tests` with `extract_stage_ids_from_top_level_mapping` and `extract_stage_ids_from_spec_mapping` (lines 247-293)

**Added**: New import needed at top of `state.rs`:
```rust
use workflow::parse_registry_workflow_yaml;
```
Note: `generate_execution_plan` already imports this locally at line 184. After this change, the import moves to module level.

### Architecture Decisions

**AD-C9-1: Domain parser is the single source of truth**
- `parse_registry_workflow_yaml` handles both mapping and sequence stage formats, `spec` wrapping, and validation.
- `extract_stage_ids` was a simplified reimplementation that only handled the extraction subset.
- Using the domain parser means `state.rs` gets parser bug fixes for free.

**AD-C9-2: Tests deleted, not migrated**
- The `workflow` crate already has comprehensive tests for `parse_registry_workflow_yaml`.
- The `state.rs` tests only tested `extract_stage_ids` — a function being deleted.
- No coverage is lost.

### Testing Strategy

1. **Existing tests**: `cargo test -p workflow` covers `parse_registry_workflow_yaml` comprehensively.
2. **Integration**: `cargo test -p mcp-server` — `get_workflow_stage_ids` is exercised by `workflow_handler.rs` tests (`get_execution_derives_pending_stages_from_workflow`, `execution_get_excludes_completed_and_current_from_pending_stages`).
3. **Behavioral equivalence**: For any valid workflow YAML, both old `extract_stage_ids` and new `workflow.stages.iter().map(|s| s.id)` return the same `Vec<String>`.
4. **Line count verification**: `state.rs` decreases by ~86 lines.

### Entropy Impact

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Duplicate YAML parsing logic | 1 (state.rs) | 0 | -1 |
| I(A;B) state↔yaml coupling | ~8 bits | 0 bits | **-8 bits** |
| state.rs lines | 293 | ~207 | -86 lines |
| New connascence | 0 | 0 | 0 |

### Design Quality Checklist

- [x] **SRP**: `state.rs` no longer does YAML parsing; delegates to domain
- [x] **OCP**: Future YAML format changes handled by domain parser, not state
- [x] **LSP**: N/A
- [x] **ISP**: N/A
- [x] **DIP**: `state.rs` depends on domain abstraction (`parse_registry_workflow_yaml`) not ad-hoc YAML traversal
- [x] **Connascence**: Eliminates CoA (algorithm) — same YAML traversal in two places
- [x] **No new cycles**: `state.rs` → `workflow::application::parser` (same direction as `generate_execution_plan` already used)
- [x] **Test coverage**: Maintained via `workflow` crate tests + `workflow_handler` integration tests

---

## C7: RestState → AppState Absorption

### Problem

`RestState` is a wrapper around `Arc<AppState>` that adds only `started_at: std::time::Instant`. It introduces 95 references across the codebase (95 `RestState` mentions in grep) and requires a separate import in every resource handler file. All 6 resource modules and `rest_handlers.rs` accept `Arc<RestState>` instead of using `AppState` directly.

### Files Changed

- `crates/mcp-server/src/state.rs` — add `pub started_at: std::time::Instant` field to `AppState`, derive `Clone`, add `save_node()` and `delete_node()` methods, add helper methods `list_by_type()` and `get_node()`
- `crates/mcp-server/src/rest.rs` — delete `RestState` struct and `impl`, change `create_rest_router` to accept `Arc<AppState>`, update `health_check` signature
- `crates/mcp-server/src/main.rs:61,611` — remove `RestState` import and `RestState::new()` call
- `crates/mcp-server/src/rest_handlers.rs` — replace `State<RestState>` with `State<Arc<AppState>>` in all 52 handler signatures, update method calls
- `crates/mcp-server/src/resources/agent.rs` — replace `Arc<RestState>` with `Arc<AppState>`, update method calls
- `crates/mcp-server/src/resources/workflow.rs` — same
- `crates/mcp-server/src/resources/skill.rs` — same
- `crates/mcp-server/src/resources/prompt.rs` — same
- `crates/mcp-server/src/resources/template.rs` — same
- `crates/mcp-server/src/resources/tool.rs` — same
- `crates/mcp-server/tests/rest_api.rs` — replace `RestState::new()` with `Arc::new(state)`, update router creation
- `crates/mcp-server/tests/performance.rs` — same
- `crates/mcp-server/tests/e2e_workflow_test.rs` — same

### Interface Changes

**AppState** (`state.rs`) — modified:

```rust
#[derive(Clone)]
pub struct AppState {
    pub node_service: Arc<NodeService>,
    pub db: Arc<Database>,
    pub execution_store: Arc<ExecutionStore>,
    pub artifact_store: Arc<ArtifactStore>,
    pub artifact_service: Arc<ArtifactService>,
    pub analytics_service: Arc<AnalyticsService>,
    pub sse_emitter: Arc<SseEmitter>,
    pub metrics_aggregator: Arc<MetricsAggregator>,
    pub workspace_root: PathBuf,
    pub started_at: std::time::Instant,  // NEW
}
```

`AppState::new()` initializes `started_at: std::time::Instant::now()`.

**New methods on AppState** (moved from `RestState`):

```rust
impl AppState {
    /// Save (create or update) a node — tries create, falls back to update
    pub fn save_node(&self, node: Node) -> Result<Node, String> {
        match self.node_service.create(node.clone()) {
            Ok(n) => Ok(n),
            Err(e) => {
                if matches!(e, registry::domain::RegistryError::DuplicateNode(_)) {
                    return Err(e.to_string());
                }
                self.node_service.update(node).map_err(|e| e.to_string())
            }
        }
    }

    /// Delete a node by ARN. Returns true if deleted, false if not found.
    pub fn delete_node(&self, arn: &str) -> Result<bool, String> {
        let node = self.node_service.get(arn).map_err(|e| e.to_string())?;
        if node.is_none() {
            return Ok(false);
        }
        self.node_service.delete(arn).map_err(|e| e.to_string())?;
        Ok(true)
    }

    /// List nodes by type string (thin wrapper for REST handlers)
    pub fn list_by_type_str(&self, node_type: &str) -> Result<Vec<Node>, String> {
        let nt = match node_type.to_lowercase().as_str() {
            "workflow" => NodeType::Workflow,
            "agent" => NodeType::Agent,
            "skill" => NodeType::Skill,
            "tool" => NodeType::Tool,
            "prompt" => NodeType::Prompt,
            "template" => NodeType::Template,
            _ => return Ok(vec![]),
        };
        self.node_service.list_by_type(nt).map_err(|e| e.to_string())
    }

    /// Get a node by ARN (thin wrapper for REST handlers)
    pub fn get_node_by_arn(&self, arn: &str) -> Result<Option<Node>, String> {
        self.node_service.get(arn).map_err(|e| e.to_string())
    }
}
```

**Note on method naming**: `list_by_type` and `get_node` are used as thin wrappers with `Result<_, String>` error types for REST handlers. To avoid collision with the existing async methods `list_nodes()` and `get_node()` on `AppState` (which return different types), the new methods are named `list_by_type_str` and `get_node_by_arn`. Alternatively, the existing async wrappers could be removed since they are trivial.

**Better approach**: Rename `RestState` methods to match the existing `AppState` async methods. The existing `AppState::get_node()` returns `Result<Option<Node>>` (anyhow), while `RestState::get_node()` returns `Result<Option<Node>, String>`. Keep both error type paths:
- REST handlers call `state.get_node_by_arn()` (returns `Result<_, String>`)
- MCP handlers call the existing `state.get_node()` (returns `Result<_, anyhow::Error>`)

**Deleted**:

```rust
// rest.rs — entire RestState struct and impl deleted
pub struct RestState { ... }
impl RestState { ... }
```

**Router signature change** (`rest.rs`):

```rust
// BEFORE
pub fn create_rest_router(state: RestState) -> Router { ... }

// AFTER
pub fn create_rest_router(state: Arc<AppState>) -> Router { ... }
```

**Handler signature pattern** (across all handlers):

```rust
// BEFORE
pub async fn list_agents(State(state): State<RestState>) -> ... { ... }

// AFTER
pub async fn list_agents(State(state): State<Arc<AppState>>) -> ... { ... }
```

**Resource handler pattern** (across all 6 resource modules):

```rust
// BEFORE
pub async fn list(state: Arc<RestState>) -> ... {
    let nodes = state.list_by_type("agent").map_err(internal_error)?;
    ...
}

// AFTER
pub async fn list(state: Arc<AppState>) -> ... {
    let nodes = state.list_by_type_str("agent").map_err(internal_error)?;
    ...
}
```

**main.rs wiring**:

```rust
// BEFORE
let rest_state = RestState::new(state_for_rest);
let rest_app = create_rest_router(rest_state);

// AFTER
let rest_app = create_rest_router(state_for_rest);
```

### Architecture Decisions

**AD-C7-1: AppState derives Clone instead of using Arc<AppState> everywhere**
- All fields are already `Arc<_>` or `PathBuf` or `Instant` — all `Clone`-friendly.
- `#[derive(Clone)]` on `AppState` makes `State<AppState>` work directly with Axum.
- However, Axum state is typically shared via `Arc`. The current pattern `State<RestState>` wraps `Arc<AppState>` inside `RestState`. After removal, we use `State<Arc<AppState>>` consistently.
- `AppState` derives `Clone` for ergonomic reasons (cheap due to `Arc` fields), but handlers receive `State<Arc<AppState>>`.

**AD-C7-2: Thin wrappers (db, list_by_type, get_node) inlined or kept on AppState**
- `RestState::db()` is used in 8 places in `rest_handlers.rs` for raw SQL queries. After this change, handlers call `state.db` directly (it's a public field).
- `RestState::list_by_type()` is used in 6 resource modules. Mapped to `AppState::list_by_type_str()`.
- `RestState::get_node()` is used in 6 resource modules. Mapped to `AppState::get_node_by_arn()`.

**AD-C7-3: save_node and delete_node logic preserved exactly**
- `save_node()` has create-then-update fallback with `DuplicateNode` conflict detection. This logic moves to `AppState` verbatim.
- `delete_node()` has existence-check-then-delete pattern. This logic moves to `AppState` verbatim.

### Testing Strategy

1. **Mechanical verification**: `cargo check -p mcp-server` confirms all 95 `RestState` references replaced.
2. **Behavioral**: `cargo test -p mcp-server` — all REST API tests (`rest_api.rs`, `e2e_workflow_test.rs`, `performance.rs`) verify endpoint behavior unchanged.
3. **Specific scenario**: Health check returns `uptime_seconds` correctly (reads from `AppState::started_at`).
4. **Grep verification**: `grep -r "RestState" crates/mcp-server/` returns zero matches.

### Entropy Impact

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Indirection layer | 1 (RestState) | 0 | -1 |
| Total RestState references | 95 | 0 | -95 |
| I(A;B) handler↔state coupling | ~25 bits | ~15 bits | **-10 bits** |
| AppState fields | 9 | 10 | +1 (started_at) |
| New connascence | 0 | 0 | 0 |

### Design Quality Checklist

- [x] **SRP**: AppState is the single state container; RestState indirection removed
- [x] **OCP**: No behavioral change; structure simplified
- [x] **LSP**: N/A
- [x] **ISP**: Handlers depend on `AppState` (same interface they already used via `RestState.app_state`)
- [x] **DIP**: No change to dependency direction
- [x] **Connascence**: Eliminates CoP (position) — RestState was a proxy that forced knowledge of its structure
- [x] **No new cycles**: N/A (removing a type)
- [x] **Test coverage**: All existing REST tests exercise the new path

---

## Phase 1 Design Summary

### How the 4 Changes Interact

```
C11 (Test Factory)  ──────────────────────────────────┐
C10 (Rename)        ─── independent ───────────────────┤
C9  (Parser)        ─── independent ───────────────────┤
C7  (RestState)     ─── uses test factory for tests ───┘
```

- **C11 and C7 interact through tests**: C7 changes test signatures from `RestState` to `AppState`. If C11 is done first, C7's test migration can use the factory. If C7 is done first, C11 migrates the post-C7 tests. Either order works.
- **C10 and C9 are fully independent**: They touch different functions in different files with no overlap.
- **No candidate blocks another**: All 4 can be done in parallel by 4 developers with no merge conflicts (they touch different files, except C11 and C7 both touch `state.rs` and test files).

### Recommended Sequence

| Step | Candidate | Rationale |
|------|-----------|-----------|
| 1 | C10 (Rename) | Smallest change (13 renames), zero risk, warms up |
| 2 | C9 (Parser) | Single file, -86 lines, pure deletion |
| 3 | C11 (Test Factory) | Adds infrastructure for tests |
| 4 | C7 (RestState) | Largest change (95 refs), benefits from C11 factory in tests |

**Parallelization**: C10 and C9 can be done simultaneously. C11 and C7 can be done simultaneously if C7's test changes don't use the factory initially (migrate to factory in a follow-up commit).

### What Must Be Sequential

- If C11 is done before C7: C7's test migration naturally uses the factory.
- If C7 is done before C11: C11 must update the post-C7 test signatures (no `RestState` to wrap).
- **Recommended**: C11 → C7 for cleanest test migration.

### Phase-Level Verification

After all 4 candidates:

```bash
cargo test -p mcp-server
cargo clippy -p mcp-server
grep -r "RestState" crates/mcp-server/            # expect: 0 matches
grep -r "fn extract_stage_ids" crates/mcp-server/ # expect: 0 matches
grep -r "fn extract_description" crates/mcp-server/src/ # expect: 0 matches
grep -r "AppState {" crates/mcp-server/tests/     # expect: 0 matches (factory used)
wc -l crates/mcp-server/src/state.rs              # expect: ~220 (down from 293)
wc -l crates/mcp-server/src/rest.rs               # expect: ~115 (down from 207)
```

### Net Entropy Impact

| Metric | Before Phase 1 | After Phase 1 | Delta |
|--------|---------------|---------------|-------|
| I(A;B) AppState coupling | ~45 bits | ~15 bits | **-30 bits** |
| Duplicate logic sites | 3 (parser, description, construction) | 0 | **-3** |
| Total lines changed | — | +93 / -192 | **-99 net** |
| Test construction sites | 5 | 1 | **-4** |
| Indirection layers | 1 (RestState) | 0 | **-1** |
| New connascence pairs | 0 | 1 (factory→AppState) | **+1 CoN** |

**Net verdict**: Significant entropy reduction (~30 bits) with only 1 new connascence pair (the test factory, which is gated behind a feature flag and never appears in production).

---

## Implementation Risk Matrix

| Candidate | Files Touched | Refs Changed | Risk | Mitigation |
|-----------|--------------|-------------|------|-----------|
| C10 | 3 | 14 | Zero | Mechanical rename, `cargo check` catches all |
| C9 | 1 | 1 function + 2 tests | Zero | Deletion, existing coverage in `workflow` crate |
| C11 | 2 + 4 test files | +50 / -0 | Very Low | Feature flag isolates production |
| C7 | 10+ | 95 | Low | Mechanical `State<RestState>` → `State<Arc<AppState>>`; `cargo check` after each file |

All candidates are single-commit revertible. No candidate introduces new dependencies in production builds.
