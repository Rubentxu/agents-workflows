# ADR-0017: CRUD Handler Extraction

**Status:** Partially Implemented  
**Date:** 2026-05-22  
**Deciders:** Agentic Workflow System Design Team

## Context

`rest_handlers.rs` was 1825 lines with 55 HTTP handler functions. Of these:
- **~1100 lines** were CRUD operations for 6 resource types (workflow, agent, skill, prompt, tool, template)
- Each CRUD operation followed the same 5-step pattern but with type-specific variations

### The Problem

Adding a new resource type required ~150 lines of copy-paste:

```rust
pub async fn list_foos(...) -> Result<...> {
    let nodes = state.list_by_type("foo");        // Step 1: Query
    let foos: Vec<_> = nodes.into_iter().map(|n| serde_json::json!({  // Step 2: Map
        "id": n.id,
        "name": n.name,
        // ... type-specific fields
    })).collect();
    Ok(Json(serde_json::json!({ "foos": foos })))  // Step 3: Respond
}

pub async fn create_foo(...) -> Result<(StatusCode, ...)> {
    let arn = format!("arn:local:{}:foo/{}", req.scope, req.name);  // Step 1: ARN
    let config = serde_json::json!({  // Step 2: Build spec
        "apiVersion": "foos.local/v1",
        "kind": "Foo",
        "spec": { /* type-specific fields */ },
    });
    let config_yaml = serde_yaml::to_string(&config)?;  // Step 3: Serialize
    let mut node = registry::domain::Node::new(/* ... */);  // Step 4: Create node
    node.config_json = Some(config_yaml);
    state.save_node(node)?;  // Step 5: Persist
    Ok((StatusCode::CREATED, Json(/* ... */)))
}
```

### Why This Is Architectural Friction

1. **Repetition without leverage**: The 5-step pattern is repeated 30 times (5 CRUD × 6 types) but provides no abstraction benefit
2. **Locality failure**: Understanding "how to add a resource type" requires finding an existing example and copy-pasting
3. **Test surface obscured**: Business logic (field mapping, spec building) is tangled with HTTP scaffolding
4. **Cohesion violation**: `rest_handlers.rs` is neither "all HTTP handlers" nor "resource logic" — it's both

## Decision

Extract CRUD logic into a `resources/` module with direct functions per type (per-resource modules), while keeping thin HTTP adapter wrappers in `rest_handlers.rs`.

### Why Not CrudHandler<T> Trait

The original proposal used a `CrudHandler<T>` generic struct with `ResourceCallbacks<C, U>` trait. This was rejected in favor of direct functions per type because:

1. **Axum adapter layer is unavoidable**: Axum's `State<RestState>`, `Path<T>`, `Json<T>` extractors cannot be abstracted away by a generic trait. Thin wrappers in `rest_handlers.rs` are required regardless of the abstraction pattern chosen.
2. **Generics overhead**: The `CrudHandler<T>` pattern adds Rust generics complexity (multiple type parameters, trait bounds) without proportional benefit when the adapter layer must exist.
3. **Simpler debugging**: Direct functions per type are easier to trace in a debugger — no trait object dispatch indirection.

### Final Structure

```
crates/mcp-server/src/
├── resources/
│   ├── mod.rs              # Shared helpers (CrudError, not_found, validate_arn, etc.)
│   ├── agent.rs            # CRUD functions: list, get, create, update, delete
│   ├── skill.rs            # CRUD functions: list, get, create, update, delete
│   ├── prompt.rs           # CRUD functions: list, get, create, update, delete
│   ├── tool.rs             # CRUD functions: list, get, create, update, delete
│   ├── template.rs         # CRUD functions: list, get, create, update, delete
│   └── workflow.rs         # CRUD functions: list, get, create, update, delete
└── rest_handlers.rs        # Thin HTTP adapters + non-CRUD handlers (~1236 lines)
```

### Per-Resource Module Interface

Each resource module exposes:

```rust
// resources/skill.rs
pub async fn list(state: Arc<RestState>) -> Result<Json<serde_json::Value>, CrudError>;
pub async fn get(state: Arc<RestState>, arn: &str) -> Result<Json<serde_json::Value>, CrudError>;
pub async fn create(state: Arc<RestState>, req: CreateSkillRequest) -> Result<(StatusCode, Json<...>), CrudError>;
pub async fn update(state: Arc<RestState>, arn: &str, req: UpdateSkillRequest) -> Result<Json<...>, CrudError>;
pub async fn delete(state: Arc<RestState>, arn: &str) -> Result<StatusCode, CrudError>;
```

### Shared Helpers (resources/mod.rs)

```rust
pub type CrudError = (StatusCode, Json<ErrorResponse>);
pub fn not_found(resource: &str, arn: &str) -> CrudError;
pub fn internal_error(e: impl ToString) -> CrudError;
pub fn invalid_arn() -> CrudError;
pub fn validate_arn(arn: &str) -> Result<String, CrudError>;
pub fn node_to_response(node: &Node) -> serde_json::Value;
pub fn list_response<T: Serialize>(items: Vec<T>) -> serde_json::Value;
```

### HTTP Adapter Layer (rest_handlers.rs)

```rust
// Thin wrappers that adapt Axum extractors to resource functions
pub async fn list_skills(
    State(state): State<RestState>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    skill::list(Arc::new(state)).await
}

pub async fn get_skill(
    State(state): State<RestState>,
    Path(arn): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    skill::get(Arc::new(state), &arn).await
}
```

**Why these wrappers cannot be eliminated**: Axum's type-based extractors (`State`, `Path`, `Json`) require concrete function signatures. A generic trait cannot implement these bounds, so the adapter layer is architectural necessary.

## Consequences

### Positive

- **~589 lines removed** from `rest_handlers.rs` (1825 → 1236)
- **Business logic separated**: CRUD operations are in testable pure functions, not tangled with HTTP
- **Module cohesion**: Each resource type has its own file with all related operations
- **Adding a resource type** = new file (~200 lines) instead of scattered copy-paste
- **Simpler generics**: No trait objects or complex type bounds

### Negative

- **~30 thin wrappers remain** in `rest_handlers.rs` — unavoidable adapter tax
- **Duplicated helper patterns**: `build_arn`, `build_*_config`, `apply_*_update` are similar but not shared (would require trait to share)
- **Two-step debugging**: Trace through wrapper in rest_handlers → then into resources/

### Neutral

- `rest_handlers.rs` still contains non-CRUD handlers (executions, insights, metrics, artifacts, alerts, schemas, content, validate)
- No generic trait means less compile-time polymorphism but simpler code

## Implementation Notes (2026-05-22)

### What Was Done

1. **Phase 1**: Created `resources/` module with skeleton files for all 6 resource types
2. **Phase 2**: Implemented `agent.rs` as reference, then migrated `skill`, `prompt`, `tool`, `template`, `workflow`
3. **Phase 3**: Updated `rest_handlers.rs` to delegate to `resources::` modules
4. **Result**: `rest_handlers.rs` reduced from 1825 to 1236 lines

### What Was NOT Done (ADR-0015 concerns)

- **Edge creation on save**: `EdgeService` exists but is not called from CRUD handlers. ARN references are stored in `config_json` but edges are not created/updated.
- **Orphan detection**: Not implemented — references are not validated against the registry.
- **`required_tools` auto-merge**: Not implemented in agents — skill binding does not auto-merge tools.

### Metrics

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| rest_handlers.rs | 1825 lines | 1236 lines | -589 (32%) |
| resources/ | 0 files | 7 files | +7 |
| CRUD functions migrated | 0 | 30 (5 per type × 6 types) | +30 |

## Alternatives Considered

### 1. CrudHandler<T> with ResourceCallbacks Trait
- **Pro**: Maximum code reuse, compile-time safety
- **Con**: Axum adapter layer unavoidable, generics complexity, trait object dispatch overhead
- **Verdict**: Rejected in favor of simpler direct functions

### 2. Macro-Based Code Generation
- **Pro**: Zero runtime overhead
- **Con**: Build-time complexity, harder to debug, less flexible
- **Verdict**: Considered but deferred

### 3. Full RPC/Service Layer
- **Pro**: Maximum abstraction
- **Con**: Heavy, requires restructuring beyond HTTP handlers
- **Verdict**: Overkill for this use case

### 4. Do Nothing (Copy-Paste Pattern)
- **Pro**: No migration cost
- **Con**: Technical debt accumulates with each new resource type
- **Verdict**: Rejected — the problem was real

## References

- [ADR-0006: Multi-Workspace ARN System](0006-multi-workspace-arn.md)
- [ADR-0015: Cross-Resource Reference System](0015-cross-resource-reference-system.md)
- [ADR-0016: Monaco Editors + Rust Validation Pipeline](0016-monaco-editors-rust-validation-pipeline.md)
