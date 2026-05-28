# Proposal: architecture-deepening

## Intent

Reduce coupling and increase depth in the `mcp-server` crate without changing external behavior. Thirteen candidates identified via entropy analysis (architecture score 90/100, 2 self-recursive cycles, I(delta) ~140 bits) organized into 4 phases.

## Scope

### In Scope
- **13 refactoring candidates** across 4 phases (see Approach)
- Elimination of 8 raw SQL statements from `rest_handlers.rs`
- Type consolidation (4 `StageOutput` structs → canonical definitions)
- `types.rs` (534L) split into domain-aligned modules
- `AppState` test factory and `RestState` → `AppState` unification
- `handler.rs` `analyze_impact` extraction to repository layer
- `ArtifactStore` typed DTOs replacing `serde_json::Value`

### Out of Scope
- No new features, API changes, or breaking changes
- No changes to Studio (React) or workflow domain crate
- No new dependencies or crate splits
- ADR-0015 edge creation, orphan detection, `required_tools` auto-merge (separate change)

## Capabilities

### New Capabilities
- `mcp-server-modularity`: Internal modularity improvements for storage seams, type organization, and test infrastructure

### Modified Capabilities
- None (pure internal refactor — no spec-level behavior changes)

## Background

ADR-0017 extracted CRUD handlers from `rest_handlers.rs` (1825→1303L), but the crate retains accumulated coupling:
- 8 raw SQL statements in `rest_handlers.rs` (workspace CRUD 4, insights 1, alerts 3)
- `types.rs` holds 534 lines of unrelated types (workflow, agent, execution, artifact, analytics, request params)
- 4 `StageOutput` structs across 4 crates with different fields (domain=5, API=1, schema=separate)
- `AppState` (293L) mixes infrastructure wiring with domain logic (`get_workflow_stage_ids`, `generate_execution_plan`)
- `RestState` wraps `AppState` adding only `started_at` — unnecessary indirection
- `handler.rs` `analyze_impact` contains 120 lines of raw SQL that should live in a repository
- No test factory for `AppState` — each test must construct the full dependency graph

## Approach

### Phase 1: Quick Wins (~25 bits, ~1 session)

Independent, zero-risk changes that require no design decisions:

| ID | Candidate | Lines Affected | What |
|----|-----------|----------------|------|
| C11 | AppState test factory | `state.rs` + new `tests/` | `AppState::new_test()` with in-memory DB, temp dirs |
| C7 | RestState → AppState | `rest.rs` + `rest_handlers.rs` (52 refs) | Eliminate `RestState` wrapper; `AppState` gains `started_at` |
| C9 | `state.rs` parser → domain parser | `state.rs:127-245` | Move `extract_stage_ids()` and YAML parsing to `workflow::application::parser` |
| C10 | `extract_description` rename | `handler.rs:70` | Rename to `description_from_metadata` for clarity |

**Safety**: Each candidate is independent. No shared state, no sequencing constraints.

### Phase 2: SQL Cleanup (~35 bits, ~2 sessions)

Eliminate raw SQL from `rest_handlers.rs` via storage seams:

| ID | Candidate | Lines Affected | What |
|----|-----------|----------------|------|
| C5 | 8 raw SQL → `WorkspaceStore` + `AlertsStore` | `rest_handlers.rs` + 2 new files | Workspace CRUD (4 SQL) → `WorkspaceStore`; Alerts (3 SQL) → `AlertsStore`; Insights query (1 SQL) → `InsightsStore` |
| C8 | `handler.rs` analyze_impact → repositories | `handler.rs:284-403` | Extract edge queries to `EdgeRepository`, execution queries to `ExecutionStore` |
| C4 | handler bypass → InsightsStore | `handler.rs` | MCP insights go through `InsightsStore` instead of direct `AnalyticsService` |
| C12 | ArtifactStore typed DTOs | `artifact_store.rs:133L` | Replace `serde_json::Value` returns with `ArtifactMetadata`, `ArtifactLocation` structs |

**Safety**: Storage seams are additive. Raw SQL is removed only after the new store compiles and tests pass.

### Phase 3: Structural (~50 bits, ~3 sessions)

Requires design decisions (escalated candidates):

| ID | Candidate | Lines Affected | What |
|----|-----------|----------------|------|
| C1 | `types.rs` → domain modules | 534L → 5-6 files | Split into `types/workflow.rs`, `types/agent.rs`, `types/execution.rs`, `types/artifact.rs`, `types/analytics.rs`, `types/requests.rs` |
| C6 | CRUD dedup (~800L) | `resources/*.rs` | Evaluate `CrudHandler<T>` trait vs per-module functions (ADR-0017 rejected trait; revisit with macro approach) |
| C13 | `match` → trait registry | `rest_handlers.rs`, `handler.rs` | 26-arm match dispatch → declarative trait registry with `register_handler!` macro |

**Safety**: Purely structural. No behavioral change. Each candidate can be done independently.

### Phase 4: Architectural (~30 bits, depends on Phase 3)

Highest depth, highest risk. Requires Phase 3 type reorganization first:

| ID | Candidate | Lines Affected | What |
|----|-----------|----------------|------|
| C2 | StageOutput unify | 4 crates | Canonical `StageOutput` in `workflow::domain::stage` (5 fields); API view model in `mcp-server::types` derives from it |
| C3 | AppState sub-state pattern | `state.rs`, `rest.rs` | Split into `RegistryState` (node_service, db), `ExecutionState` (execution_store, artifact_store), `AnalyticsState` (analytics, sse, metrics); Axum `State<impl AsRef<RegistryState>>` pattern |

**Safety**: Phase 4 depends on Phase 3 completing. If blocked, Phase 3 deliverables are still valuable.

## Open Questions (Escalated Decisions)

### OQ-1: C6 — Generic trait vs macro for CRUD dedup
**Context**: ADR-0017 rejected `CrudHandler<T>` due to Axum extractor constraints. ~800 lines of similar CRUD remain across `resources/*.rs`.
**Options**:
- A) Keep per-module functions (ADR-0017 decision, status quo)
- B) Declarative macro (`define_crud!`) generating function bodies
- C) Shared helper functions for common patterns (ARN building, node mapping)
**Recommendation**: Option C — lowest risk, extracts shared helpers without generics.

### OQ-2: C13 — Dispatch macro design
**Context**: 26-arm `match` for tool/handler dispatch in MCP and REST layers.
**Options**:
- A) `register_handler!` macro generating dispatch table
- B) `HashMap<String, Box<dyn Handler>>` trait objects
- C) Keep match (zero overhead, explicit)
**Recommendation**: Option A — declarative macro preserves zero-cost dispatch while reducing boilerplate.

### OQ-3: C3 — AppState sub-state and Axum constraints
**Context**: Axum requires `State<S>: FromRef<S>` for state extraction. Sub-states must satisfy this.
**Options**:
- A) `impl FromRef<AppState> for RegistryState` pattern
- B) `Arc<AppState>` with accessor methods (status quo, refined)
- C) Separate `Router` per sub-state with different `State` types
**Recommendation**: Option A — idiomatic Axum pattern, enables granular handler dependencies.

### OQ-4: C2 — StageOutput unification strategy
**Context**: 4 `StageOutput` structs: `stage::StageOutput` (2 fields), `execution_state::StageOutput` (5 fields), `types::StageOutput` (1 field), `schema::StageOutputSpec` (separate).
**Options**:
- A) Canonical in `workflow::domain::stage`, derive others via `From` impls
- B) Keep separate, document semantic differences
- C) Single struct with `#[serde(default)]` optional fields
**Recommendation**: Option A — domain is source of truth, API/adapters convert.

### OQ-5: C12 — ArtifactStore typed DTO versioning
**Context**: Introducing typed DTOs risks creating yet another type version alongside `types::Artifact`.
**Options**:
- A) Reuse `types::Artifact` as store return type
- B) Create separate `artifact_store::ArtifactRow` (DB representation) + `From<ArtifactRow> for types::Artifact`
- C) Use `types::Artifact` directly, accept coupling
**Recommendation**: Option B — store DTO is DB-shaped; API DTO is wire-shaped; `From` bridge.

## Entropy Budget

| Metric | Estimate (bits) | Threshold | Status |
|--------|-----------------|-----------|--------|
| H(Δ_existing) | 3.8 (14 files modified) | < 1.0 | ❌ OCP violated (expected for refactor) |
| H(Δ_new) | 5.2 (new modules, stores, DTOs) | > 0 | ✅ |
| New connascence pairs | 6 (store→DTO, parser→domain, factory→test) | < 3 | ⚠️ |
| OCP compliant? | No (refactor — expected) | yes | ❌ |

**Verdict**: yellow — significant refactoring scope but zero behavioral change risk
**Estimation Method**: Heuristic (file count from codebase analysis)
**Confidence**: estimated

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| C7 RestState removal breaks 52 handler signatures | Med | Mechanical find-replace; `cargo check` after each batch |
| C1 types.rs split breaks 10+ importers | Med | `mod types { pub mod ... }` re-export preserves glob imports |
| C3 sub-state fails Axum FromRef bounds | Low | POC with one handler first; fallback to refined status quo |
| Phase 3 blocked on escalated decisions | Med | Phase 1+2 deliver independently; decisions needed by Phase 3 |
| C12 creates third Artifact type | Low | `From` impl bridges; delete old `serde_json::Value` returns |
| `extract_stage_ids` move breaks state.rs tests | Low | Tests move with the function to domain parser module |

## Rollback Plan

- **Phase 1**: Each candidate is a single commit. `git revert` per candidate.
- **Phase 2**: Storage seams are additive. Remove store, restore raw SQL. New files deleted.
- **Phase 3**: Module restructure via `mod` re-exports. Restore `types.rs` monolith from git.
- **Phase 4**: Sub-state pattern via `FromRef` impls. Remove impls, restore monolithic `AppState`.
- **Nuclear**: All phases are within one crate (`mcp-server`). Full `git revert` to pre-change commit.

## Dependencies

- Phase 4 requires Phase 3 (type reorganization must precede unification)
- Phase 1 is independent of all other phases
- Phase 2 is independent of Phase 3 and 4

## Success Criteria

- [ ] `rest_handlers.rs` contains zero raw SQL statements
- [ ] `types.rs` is under 50 lines (re-exports only)
- [ ] `StageOutput` has a single canonical definition in `workflow::domain::stage`
- [ ] `AppState::new_test()` exists and is used in all handler tests
- [ ] `RestState` struct no longer exists
- [ ] `handler.rs` `analyze_impact` has zero direct SQL
- [ ] `ArtifactStore` returns typed DTOs, not `serde_json::Value`
- [ ] All existing tests pass after each phase
- [ ] `cargo clippy` and `cargo test` green after each phase
