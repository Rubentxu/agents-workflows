# Tasks: architecture-deepening — Phase 1 Quick Wins

**Change**: architecture-deepening
**Phase**: 1 (Quick Wins)
**Status**: Ready for implementation
**Date**: 2026-05-24

---

## Execution Order

Candidates are independent but recommended in this order for minimal context switching:

| Step | Candidate | Risk | Files Touched | Net Lines |
|------|-----------|------|---------------|-----------|
| 1 | C10 (extract_description rename) | Zero | 3 | +13 / -13 |
| 2 | C9 (state.rs parser dedup) | Zero | 1 | +10 / -86 |
| 3 | C11 (AppState test factory) | Very Low | 2 + 4 test files | +50 / -0 |
| 4 | C7 (RestState elimination) | Low | 10+ | +20 / -93 |

Each step must produce a passing `cargo test -p mcp-server && cargo clippy -p mcp-server` before proceeding.

---

## C10: extract_description Rename

**Goal**: Eliminate name collision between two unrelated `extract_description` functions by renaming each to reflect its data source.

### Files

| File | What |
|------|------|
| `crates/mcp-server/src/handler.rs:70` | Rename `extract_description` → `description_from_metadata` |
| `crates/mcp-server/src/handler.rs:105,123,150,153,175,193,219,222,244,262` | Update 10 `Self::extract_description` call sites |
| `crates/mcp-server/src/workflow_handler.rs:51,126` | Update 2 `McpHandler::extract_description` call sites |
| `crates/mcp-server/src/resources/agent.rs:137` | Rename `extract_description` → `description_from_config` |
| `crates/mcp-server/src/resources/agent.rs:131` | Update 1 call site |

### Tasks

- [ ] **T10.1** In `crates/mcp-server/src/handler.rs`, rename the function at line 70:
  ```rust
  // BEFORE (line 70)
  pub fn extract_description(node: &Node) -> String {

  // AFTER
  pub fn description_from_metadata(node: &Node) -> String {
  ```

- [ ] **T10.2** In `crates/mcp-server/src/handler.rs`, update all 10 call sites (`Self::extract_description` → `Self::description_from_metadata`):
  - Line 105: `let description = Self::description_from_metadata(&node);`
  - Line 123: `let description = Self::description_from_metadata(&node);`
  - Line 150: `Self::description_from_metadata(&node).to_lowercase().contains(&query_lower)`
  - Line 153: `let description = Self::description_from_metadata(&node);`
  - Line 175: `let description = Self::description_from_metadata(&node);`
  - Line 193: `let description = Self::description_from_metadata(&node);`
  - Line 219: `Self::description_from_metadata(&node).to_lowercase().contains(&query_lower)`
  - Line 222: `let description = Self::description_from_metadata(&node);`
  - Line 244: `let description = Self::description_from_metadata(&node);`
  - Line 262: `let description = Self::description_from_metadata(&node);`

- [ ] **T10.3** In `crates/mcp-server/src/workflow_handler.rs`, update 2 call sites:
  - Line 51: `let description = McpHandler::description_from_metadata(&node);`
  - Line 126: `let description = McpHandler::description_from_metadata(&node);`

- [ ] **T10.4** In `crates/mcp-server/src/resources/agent.rs`, rename the local function at line 137:
  ```rust
  // BEFORE (line 137)
  fn extract_description(node: &Node) -> String {

  // AFTER
  fn description_from_config(node: &Node) -> String {
  ```

- [ ] **T10.5** In `crates/mcp-server/src/resources/agent.rs`, update the call site at line 131:
  ```rust
  // BEFORE (line 131)
  description: extract_description(node),

  // AFTER
  description: description_from_config(node),
  ```

- [ ] **T10.6** Verify:
  ```bash
  cargo check -p mcp-server
  cargo test -p mcp-server
  cargo clippy -p mcp-server
  grep -r "fn extract_description" crates/mcp-server/src/
  # Expected: zero matches
  ```

---

## C9: state.rs Parser Deduplication

**Goal**: Delete the ad-hoc `extract_stage_ids` function and its tests from `state.rs`, rewriting `get_workflow_stage_ids` to use the domain parser `parse_registry_workflow_yaml`.

### Files

| File | What |
|------|------|
| `crates/mcp-server/src/state.rs:127-143` | Rewrite `get_workflow_stage_ids` |
| `crates/mcp-server/src/state.rs:207-245` | Delete `extract_stage_ids` function |
| `crates/mcp-server/src/state.rs:247-293` | Delete `#[cfg(test)] mod tests` block |
| `crates/mcp-server/src/state.rs:184` | Move `parse_registry_workflow_yaml` import to module level |

### Tasks

- [ ] **T9.1** Add module-level import at the top of `crates/mcp-server/src/state.rs` (after line 12):
  ```rust
  use workflow::parse_registry_workflow_yaml;
  ```
  Note: This function is already imported locally at line 184 inside `generate_execution_plan`. After adding the module-level import, the local `use workflow::{Workflow, parse_registry_workflow_yaml};` at line 184 should be simplified to `use workflow::Workflow;` since `parse_registry_workflow_yaml` is now in scope.

- [ ] **T9.2** Rewrite `get_workflow_stage_ids` at lines 127-143:
  ```rust
  // BEFORE
  pub async fn get_workflow_stage_ids(&self, arn: &str) -> Result<Vec<String>> {
      let node = self
          .node_service
          .get(arn)
          .ok()
          .flatten()
          .ok_or_else(|| anyhow::anyhow!("Workflow not found: {}", arn))?;

      let config = node
          .config_json
          .ok_or_else(|| anyhow::anyhow!("Workflow node has no config: {}", arn))?;

      let yaml_val: serde_yaml::Value = serde_yaml::from_str(&config)
          .map_err(|e| anyhow::anyhow!("Failed to parse workflow YAML: {}", e))?;

      Ok(extract_stage_ids(&yaml_val))
  }

  // AFTER
  pub async fn get_workflow_stage_ids(&self, arn: &str) -> Result<Vec<String>> {
      let node = self
          .node_service
          .get(arn)
          .ok()
          .flatten()
          .ok_or_else(|| anyhow::anyhow!("Workflow not found: {}", arn))?;

      let config = node
          .config_json
          .ok_or_else(|| anyhow::anyhow!("Workflow node has no config: {}", arn))?;

      let workflow = parse_registry_workflow_yaml(&node.id, &node.name, &config)
          .map_err(|e| anyhow::anyhow!("Failed to parse workflow: {}", e))?;
      Ok(workflow.stages.iter().map(|s| s.id.clone()).collect())
  }
  ```

- [ ] **T9.3** Delete `extract_stage_ids` function (lines 207-245) — the entire free function.

- [ ] **T9.4** Delete the `#[cfg(test)] mod tests` block (lines 247-293) — both `extract_stage_ids_from_top_level_mapping` and `extract_stage_ids_from_spec_mapping` tests. The `workflow` crate already has equivalent coverage for `parse_registry_workflow_yaml`.

- [ ] **T9.5** Update `generate_execution_plan` at line 184 to use the module-level import:
  ```rust
  // BEFORE (line 184)
  use workflow::{Workflow, parse_registry_workflow_yaml};

  // AFTER
  use workflow::Workflow;
  ```
  `parse_registry_workflow_yaml` is now imported at module level (from T9.1).

- [ ] **T9.6** Verify:
  ```bash
  cargo test -p mcp-server
  cargo test -p workflow
  cargo clippy -p mcp-server
  grep -r "fn extract_stage_ids" crates/mcp-server/
  # Expected: zero matches
  wc -l crates/mcp-server/src/state.rs
  # Expected: ~207 (down from 293)
  ```

---

## C11: AppState Test Factory

**Goal**: Add `AppState::test()` and `AppState::test_with_workspace()` builders gated by a `test-factory` feature flag, then migrate all 7 manual test construction sites to use them.

### Files

| File | What |
|------|------|
| `crates/mcp-server/Cargo.toml` | Add `test-factory` feature + optional `tempfile` |
| `crates/mcp-server/src/state.rs` | Add `#[cfg(feature = "test-factory")]` impl block |
| `crates/mcp-server/tests/rest_api.rs` | Replace `create_test_rest_state()` with factory |
| `crates/mcp-server/tests/performance.rs` | Replace `create_test_router()` with factory |
| `crates/mcp-server/tests/e2e_workflow_test.rs` | Replace `create_test_rest_state_with_bootstrap()` with factory |
| `crates/mcp-server/src/workflow_handler.rs:533-567` | Replace `make_workflow_handler()` inline construction |
| `crates/mcp-server/src/insights_handler.rs:215-231` | Replace `create_test_state()` inline construction |
| `crates/mcp-server/src/metrics_handler.rs:117-133` | Replace `create_test_state()` inline construction |

### Tasks

- [ ] **T11.1** Add feature flag and dependency to `crates/mcp-server/Cargo.toml`:
  ```toml
  # In [features] section (after line 13)
  test-factory = ["tempfile"]

  # In [dependencies] section — add tempfile as optional
  tempfile = { version = "3", optional = true }

  # Keep existing tempfile in [dev-dependencies] (line 59) — it's used directly by tests
  ```

- [ ] **T11.2** Add test factory to `crates/mcp-server/src/state.rs` — append after the existing `impl AppState` block (after line 205):
  ```rust
  #[cfg(feature = "test-factory")]
  impl AppState {
      pub fn test() -> anyhow::Result<(Self, tempfile::TempDir)> {
          let temp_dir = tempfile::TempDir::new()?;
          let state = Self::test_with_workspace(temp_dir.path())?;
          Ok((state, temp_dir))
      }

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

- [ ] **T11.3** Migrate `crates/mcp-server/tests/rest_api.rs` (lines 34-51):
  Replace `create_test_rest_state()` with:
  ```rust
  fn create_test_router() -> (Router, TempDir) {
      let (state, temp_dir) = AppState::test().expect("test state");
      (create_rest_router(Arc::new(state)), temp_dir)
  }
  ```
  Remove: `create_test_rest_state()` function, direct imports of `ExecutionStore`, `NodeService`, `Database`, `SqliteNodeRepository`, `AnalyticsService`, `SseEmitter`, `MetricsAggregator`.
  Keep: imports for `AppState`, `create_rest_router`, `TempDir`, `Arc`.

- [ ] **T11.4** Migrate `crates/mcp-server/tests/performance.rs` (lines 27-48):
  Replace `create_test_router()` with:
  ```rust
  fn create_test_router() -> (Router, TempDir) {
      let temp_dir = TempDir::new().expect("temp dir");
      let workspace = temp_dir.path().to_path_buf();
      let bootstrap = BootstrapService::new(workspace.clone());
      bootstrap.init().expect("bootstrap");
      let (state, _) = AppState::test_with_workspace(&workspace).expect("test state");
      let state = Arc::new(state);
      bootstrap.register_resources_to_db(
          state.node_service.clone()
      ).expect("register resources");
      (create_rest_router(state), temp_dir)
  }
  ```
  Remove: all manual construction imports.

- [ ] **T11.5** Migrate `crates/mcp-server/tests/e2e_workflow_test.rs` (lines 32-57):
  Replace `create_test_rest_state_with_bootstrap()` with:
  ```rust
  fn create_test_router_with_bootstrap() -> (Router, TempDir) {
      let temp_dir = TempDir::new().expect("temp dir");
      let workspace = temp_dir.path().to_path_buf();
      let bootstrap = BootstrapService::new(workspace.clone());
      bootstrap.init().expect("bootstrap");
      let (state, _) = AppState::test_with_workspace(&workspace).expect("test state");
      let state = Arc::new(state);
      bootstrap.register_resources_to_db(state.node_service.clone()).expect("register");
      (create_rest_router(state), temp_dir)
  }
  ```
  Remove: `create_test_rest_state_with_bootstrap()`, manual construction imports.

- [ ] **T11.6** Migrate `crates/mcp-server/src/workflow_handler.rs` inline test (lines 533-567):
  Replace `make_workflow_handler()` with:
  ```rust
  fn make_workflow_handler() -> (Arc<McpHandler>, WorkflowMcpHandler) {
      let (state, _temp) = AppState::test().expect("test state");
      let state = Arc::new(state);
      state.node_service.create(test_workflow_node()).expect("create workflow node");
      let mcp_handler = Arc::new(McpHandler::new(state.clone(), Arc::new(MetricsBroadcaster::new())));
      let workflow_handler = WorkflowMcpHandler::new(state, Arc::new(MetricsBroadcaster::new()), mcp_handler.clone());
      (mcp_handler, workflow_handler)
  }
  ```

- [ ] **T11.7** Migrate `crates/mcp-server/src/insights_handler.rs` inline test (lines 215-231):
  Replace `create_test_state(db)` with:
  ```rust
  fn create_test_state() -> Arc<AppState> {
      let (state, _temp) = AppState::test().expect("test state");
      Arc::new(state)
  }
  ```
  Note: The existing `create_test_state(db: Arc<Database>)` takes a DB parameter because it seeds insights directly via SQL. After migration, the test helper will need to access `state.db` directly for seeding. Update call sites accordingly.

- [ ] **T11.8** Migrate `crates/mcp-server/src/metrics_handler.rs` inline test (lines 117-133):
  Same pattern as T11.7 — replace `create_test_state(db)` with `AppState::test()`.
  Note: Same caveat about tests that seed data via raw SQL — they need `state.db` access.

- [ ] **T11.9** Verify:
  ```bash
  cargo test -p mcp-server --features test-factory
  cargo clippy -p mcp-server --features test-factory
  cargo check -p mcp-server
  # ^ Without test-factory — confirms factory is not in production builds
  grep -r "AppState {" crates/mcp-server/tests/ --include="*.rs"
  # Expected: zero matches (all construction via factory)
  grep -r "AppState {" crates/mcp-server/src/ --include="*.rs"
  # Expected: only the factory and AppState::new() — no test helpers
  ```

**Important notes on T11.7 and T11.8**: The insights_handler and metrics_handler tests create a DB, seed it with raw SQL (e.g., `INSERT INTO insights ...`), then construct AppState wrapping that same DB. After migration to `AppState::test()`, these tests need to use `state.db` from the factory-constructed state for their SQL seeding. The pattern becomes:
```rust
fn create_test_state() -> (Arc<AppState>, Arc<Database>) {
    let (state, _temp) = AppState::test().expect("test state");
    let state = Arc::new(state);
    let db = state.db.clone();
    (state, db)
}
```

---

## C7: RestState → AppState Elimination

**Goal**: Delete `RestState` wrapper, move `started_at` and useful methods into `AppState`, update all 103 references across the codebase.

### Files

| File | What |
|------|------|
| `crates/mcp-server/src/state.rs` | Add `started_at` field, `#[derive(Clone)]`, add `save_node`/`delete_node`/`list_by_type_str`/`get_node_by_arn` methods |
| `crates/mcp-server/src/rest.rs` | Delete `RestState` struct and `impl`, change `create_rest_router` to accept `Arc<AppState>`, update `health_check` |
| `crates/mcp-server/src/main.rs:61,611-612` | Remove `RestState` import and `RestState::new()` call |
| `crates/mcp-server/src/rest_handlers.rs` | Replace all 52 `State<RestState>` → `State<Arc<AppState>>`, update method calls |
| `crates/mcp-server/src/resources/agent.rs` | Replace `Arc<RestState>` → `Arc<AppState>`, update method calls |
| `crates/mcp-server/src/resources/skill.rs` | Same |
| `crates/mcp-server/src/resources/prompt.rs` | Same |
| `crates/mcp-server/src/resources/template.rs` | Same |
| `crates/mcp-server/src/resources/tool.rs` | Same |
| `crates/mcp-server/src/resources/workflow.rs` | Same |
| `crates/mcp-server/src/resources/mod.rs:19` | Update doc comment example |
| `crates/mcp-server/tests/rest_api.rs` | Remove RestState usage |
| `crates/mcp-server/tests/performance.rs` | Remove RestState usage |
| `crates/mcp-server/tests/e2e_workflow_test.rs` | Remove RestState usage |

### Tasks

- [ ] **T7.1** Add `Clone` derive and `started_at` field to `AppState` in `crates/mcp-server/src/state.rs`:
  ```rust
  // BEFORE (line 18-19)
  /// Application state - holds all services
  pub struct AppState {

  // AFTER
  /// Application state - holds all services
  #[derive(Clone)]
  pub struct AppState {
  ```
  Add field after `workspace_root`:
  ```rust
  pub workspace_root: PathBuf,
  pub started_at: std::time::Instant,
  ```
  Initialize in `AppState::new()` (after line 65):
  ```rust
  Ok(Self { node_service, db, execution_store, artifact_store, artifact_service, analytics_service, sse_emitter, metrics_aggregator, workspace_root, started_at: std::time::Instant::now() })
  ```

- [ ] **T7.2** Add new methods to `AppState` in `crates/mcp-server/src/state.rs` (inside the `impl AppState` block, before the closing brace):
  ```rust
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

  pub fn delete_node_by_arn(&self, arn: &str) -> Result<bool, String> {
      let node = self.node_service.get(arn).map_err(|e| e.to_string())?;
      if node.is_none() {
          return Ok(false);
      }
      self.node_service.delete(arn).map_err(|e| e.to_string())?;
      Ok(true)
  }

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

  pub fn get_node_by_arn(&self, arn: &str) -> Result<Option<Node>, String> {
      self.node_service.get(arn).map_err(|e| e.to_string())
  }
  ```

- [ ] **T7.3** Rewrite `crates/mcp-server/src/rest.rs`:
  - Delete the `RestState` struct definition (lines 22-27) and `impl RestState` block (lines 29-92)
  - Keep the imports (lines 1-21) but remove `Database` import (line 20) — no longer needed in this file
  - Change `create_rest_router` signature (line 94):
    ```rust
    // BEFORE
    pub fn create_rest_router(state: RestState) -> Router {

    // AFTER
    pub fn create_rest_router(state: Arc<AppState>) -> Router {
    ```
  - Update `health_check` (lines 200-207):
    ```rust
    // BEFORE
    async fn health_check(State(state): State<RestState>) -> Json<serde_json::Value> {
        let uptime_secs = state.started_at.elapsed().as_secs();

    // AFTER
    async fn health_check(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
        let uptime_secs = state.started_at.elapsed().as_secs();
    ```

- [ ] **T7.4** Update `crates/mcp-server/src/main.rs`:
  - Line 61: Change `use rest::{create_rest_router, RestState};` → `use rest::create_rest_router;`
  - Lines 611-612: Change:
    ```rust
    // BEFORE
    let rest_state = RestState::new(state_for_rest);
    let rest_app = create_rest_router(rest_state);

    // AFTER
    let rest_app = create_rest_router(state_for_rest);
    ```

- [ ] **T7.5** Update `crates/mcp-server/src/rest_handlers.rs`:
  - Line 14: Change `use super::rest::RestState;` → `use crate::state::AppState;`
  - Replace ALL `State<RestState>` → `State<Arc<AppState>>` (52 occurrences at lines: 42, 65, 98, 128, 152, 158, 165, 172, 180, 191, 197, 204, 211, 219, 234, 240, 247, 254, 262, 273, 279, 286, 293, 301, 312, 328, 357, 377, 397, 428, 437, 453, 493, 531, 581, 626, 649, 672, 748, 754, 761, 768, 776, 787, 793, 800, 807, 815, 1065, 1104, 1168)
  - Replace `state.db()` → `state.db` (the field is public)
  - Replace `state.list_by_type(...)` → `state.list_by_type_str(...)`
  - Replace `state.get_node(...)` → `state.get_node_by_arn(...)`
  - Replace `state.save_node(...)` → `state.save_node(...)`
  - Replace `state.delete_node(...)` → `state.delete_node_by_arn(...)`

- [ ] **T7.6** Update `crates/mcp-server/src/resources/agent.rs`:
  - Line 9: Change `use crate::rest::RestState;` → `use crate::state::AppState;`
  - Replace all `Arc<RestState>` → `Arc<AppState>` (lines 155, 162, 171, 202, 236)
  - Replace `state.list_by_type(...)` → `state.list_by_type_str(...)`
  - Replace `state.get_node(...)` → `state.get_node_by_arn(...)`
  - Replace `state.save_node(...)` → `state.save_node(...)`
  - Replace `state.delete_node(...)` → `state.delete_node_by_arn(...)`

- [ ] **T7.7** Update `crates/mcp-server/src/resources/skill.rs`:
  - Same pattern as T7.6: `RestState` → `AppState`, method name updates

- [ ] **T7.8** Update `crates/mcp-server/src/resources/prompt.rs`:
  - Same pattern as T7.6

- [ ] **T7.9** Update `crates/mcp-server/src/resources/template.rs`:
  - Same pattern as T7.6

- [ ] **T7.10** Update `crates/mcp-server/src/resources/tool.rs`:
  - Same pattern as T7.6

- [ ] **T7.11** Update `crates/mcp-server/src/resources/workflow.rs`:
  - Same pattern as T7.6

- [ ] **T7.12** Update `crates/mcp-server/src/resources/mod.rs`:
  - Line 19: Change `State<RestState>` → `State<Arc<AppState>>` in doc comment

- [ ] **T7.13** Update test files:
  - `tests/rest_api.rs`: Remove `RestState` import (line 22), remove `create_test_rest_state()`, change `create_test_router()` to use `create_rest_router(Arc::new(state))` directly
  - `tests/performance.rs`: Remove `RestState` import (line 18), update `create_test_router()` to call `create_rest_router(Arc::new(state))`
  - `tests/e2e_workflow_test.rs`: Remove `RestState` import (line 23), update to use `create_rest_router(Arc::new(state))`

  **Note**: If C11 (test factory) was done first, these test files already use `AppState::test()` and just need the `RestState` wrapping removed. If C7 is done first, replace `RestState::new(app_state)` with `create_rest_router(Arc::new(state))` directly.

- [ ] **T7.14** Update `crates/mcp-server/src/state.rs` test factory (if C11 was done):
  - `AppState::test()` and `AppState::test_with_workspace()` must also initialize `started_at: std::time::Instant::now()`

- [ ] **T7.15** Verify:
  ```bash
  cargo test -p mcp-server
  cargo clippy -p mcp-server
  grep -r "RestState" crates/mcp-server/
  # Expected: zero matches
  wc -l crates/mcp-server/src/rest.rs
  # Expected: ~115 (down from 207)
  ```

---

## Cross-Cutting Verification (After All 4 Candidates)

```bash
cargo test -p mcp-server
cargo clippy -p mcp-server
grep -r "RestState" crates/mcp-server/                  # expect: 0 matches
grep -r "fn extract_stage_ids" crates/mcp-server/       # expect: 0 matches
grep -r "fn extract_description" crates/mcp-server/src/ # expect: 0 matches
grep -r "AppState {" crates/mcp-server/tests/           # expect: 0 matches (factory used)
wc -l crates/mcp-server/src/state.rs                    # expect: ~220 (down from 293)
wc -l crates/mcp-server/src/rest.rs                     # expect: ~115 (down from 207)
```

---

## Entropy Budget

| Metric | Before Phase 1 | After Phase 1 | Delta |
|--------|---------------|---------------|-------|
| I(A;B) AppState coupling | ~45 bits | ~15 bits | **-30 bits** |
| Duplicate logic sites | 3 | 0 | **-3** |
| Net lines changed | — | +93 / -192 | **-99** |
| Test construction sites | 7 manual | 1 factory | **-6** |
| Indirection layers | 1 (RestState) | 0 | **-1** |
| New connascence pairs | 0 | 1 (factory→AppState) | **+1 CoN** |
