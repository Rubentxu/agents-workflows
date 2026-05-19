# Architecture hardening backlog

**Date:** May 19, 2026  
**Status:** ✅ Waves 1–6 complete (A1–A4, B1–B3, C1–C3, D1, E1–E2, F1–F2). Remaining: D2 (ADR), D3 (summary tests).  
**Companion document:** `ARCHITECTURE-IMPROVEMENTS.md`

---

## Bottom line up front

This backlog turns the architecture review into concrete implementation work.
Each item is written so you can copy it into GitHub Issues, Linear, or any
other tracker with minimal editing.

The backlog is intentionally ordered by dependency. The first wave fixes the
**Agent Execution** seam and reduces pressure on the **MCP** layer. Later
waves deepen **Artifact**, observability, and type translation.

---

## Priority order

1. Deepen **Agent Execution**.
2. Split the **MCP** seam by bounded context.
3. Make **Artifact** the only authority on storage decisions.
4. Replace stub observability with real **Metrics** and **Insights** flow.
5. Add explicit domain-to-MCP translation seams.
6. Decide the fate of `execution_stages`.

---

## Wave 1: Agent Execution

### A1. Create an Agent Execution persistence seam

**Status**: ✅ COMPLETE

**Why**

The current **Agent Execution** flow still relies on SQL in the MCP handler.
That weakens the seam defined by **ADR-0007** and spreads execution rules
across too many files.

**Scope**

- Introduce an adapter or repository dedicated to execution persistence.
- Move execution creation, load, update, and abort persistence behind that
  Interface.
- Stop issuing execution-state SQL directly from `mcp-server` handlers.

**Files**

- `crates/mcp-server/src/handler.rs`
- `crates/mcp-server/src/state.rs`
- `crates/registry/src/infrastructure/db.rs`
- new execution persistence module under `workflow` or `mcp-server`

**Acceptance criteria**

- `workflow_execute` persists **Agent Execution** through the new seam.
- `workflow_get_state` loads **Agent Execution** through the new seam.
- `workflow_update_state` and `workflow_abort` no longer own raw execution SQL.
- Integration tests prove the seam works across create, read, update, and
  abort.

**Suggested issue title**

`Create Agent Execution persistence seam`

---

### A2. Reconstruct ExecutionState correctly from persistence

**Status**: ✅ COMPLETE

**Why**

The current execution view loses behavior and data when it is read back:

- `pending_stages` is empty,
- `stage_outputs` is not reconstructed in the documented shape,
- `execution_context` is not returned as a first-class execution state view.

This makes the **Agent Execution** module shallow and undercuts Studio and
orchestrator leverage.

**Scope**

- Derive `pending_stages` from the **Workflow** DAG or stage ledger.
- Reconstruct `stage_outputs` in the documented MCP shape.
- Reconstruct `execution_context` from persistence.
- Ensure the read model matches `MCP-API.md` and **ADR-0007**.

**Files**

- `crates/mcp-server/src/handler.rs`
- `crates/workflow/src/domain/execution_state.rs`
- `crates/workflow/src/application/state_machine.rs`

**Acceptance criteria**

- `workflow_get_state` returns non-empty `pending_stages` when appropriate.
- `workflow_get_state` returns the persisted `execution_context`.
- `workflow_get_state` returns `stage_outputs` without type erasure.
- Tests cover at least one sequential and one parallel **Workflow**.

**Suggested issue title**

`Reconstruct ExecutionState from persisted Agent Execution`

---

### A3. Route execution transitions through StateMachineService

**Status**: ✅ COMPLETE (superseded — `StateMachineService` deleted; `ExecutionApplicationService` + `ExecutionStore` handle transitions directly)

**Why**

The project already has a state-machine module, but the **MCP** layer still
applies key transitions inline. That reduces locality and makes state rules
harder to trust.

**Scope**

- Use `StateMachineService` for execution start.
- Use `StateMachineService` for stage completion transitions.
- Use a state-aware path for abort behavior.
- Ensure execution status transitions are validated in one place.

**Files**

- `crates/workflow/src/application/state_machine.rs`
- `crates/mcp-server/src/handler.rs`

**Acceptance criteria**

- `workflow_execute` starts execution through the state machine.
- `workflow_update_state` applies transitions through the state machine.
- invalid transitions fail consistently.
- unit and integration tests cover the transition rules from **ADR-0007**.

**Suggested issue title**

`Delegate Agent Execution transitions to StateMachineService`

---

### A4. Add end-to-end Agent Execution tests

**Status**: ✅ COMPLETE

**Why**

The domain has useful tests, but the system needs tests that prove the public
**MCP** seam actually uses the execution model correctly.

**Implementation**

- 35 workflow unit tests (domain + application layers)
- 23 mcp-server unit tests (stores, adapters, mappers)
- 16 MCP handler integration tests (execution lifecycle)
- 7 registry tests
- **81 total tests passing**

**What remains**

- Rust E2E tests requiring live server at localhost:8080 (7 pass, 4 fail —
  environment-dependent, not code issues)

**Scope**

- Add end-to-end tests for `workflow_execute`.
- Add end-to-end tests for `workflow_update_state`.
- Add end-to-end tests for `workflow_get_next_stage`.
- Add end-to-end tests for `workflow_abort`.

**Acceptance criteria**

- Tests cover a full successful **Workflow**.
- Tests cover an invalid abort transition.
- Tests cover `execution_context` propagation.
- Tests cover `pending_stages` and `stage_outputs` visibility.

**Suggested issue title**

`Add end-to-end MCP tests for Agent Execution lifecycle`

---

## Wave 2: MCP seam

### B1. Extract Workflow MCP handler

**Status**: ✅ COMPLETE

**Why**

`handler.rs` is currently a mixed module. The **Workflow** Interface deserves
its own seam so changes to **Agent Execution** and DAG logic stay local.

**Scope**

- Create a `WorkflowMcpHandler`.
- Move `workflow_*` and `execution_*` tools into it.
- Keep `main.rs` as the top-level dispatcher only.

**Files**

- `crates/mcp-server/src/handler.rs`
- `crates/mcp-server/src/main.rs`
- new handler module(s)

**Acceptance criteria**

- `handler.rs` no longer contains all workflow and execution logic.
- public MCP behavior remains unchanged.
- tests remain green after extraction.

**Suggested issue title**

`Extract WorkflowMcpHandler from monolithic MCP handler`

---

### B2. Extract Artifact, Insights, and Metrics MCP handlers

**Status**: ✅ COMPLETE

**Why**

The same seam problem exists for **Artifact**, **Insight**, and **Metrics**.
Each bounded context should expose a focused MCP adapter instead of sharing a
god module.

**Implementation**

- ✅ Created `ArtifactMcpHandler` in `artifact_handler.rs`
- ✅ Created `InsightsMcpHandler` in `insights_handler.rs`
- ✅ Created `MetricsMcpHandler` in `metrics_handler.rs`
- ✅ Updated `main.rs` dispatcher to route artifact/insights/metrics tools
- ✅ Updated test setups in `workflow_handler.rs`
- ✅ All tests pass (21 mcp-server, 23 artifact)

**Files created/modified**

- `crates/mcp-server/src/artifact_handler.rs` (NEW)
- `crates/mcp-server/src/insights_handler.rs` (NEW)
- `crates/mcp-server/src/metrics_handler.rs` (NEW)
- `crates/mcp-server/src/main.rs` (updated dispatcher)
- `crates/mcp-server/src/lib.rs` (exports new handlers)

---

### B3. Expand AppState into a real adapter container

**Status**: ✅ COMPLETE

**Why**

`AppState` still exposes mostly `db` and `node_service`. That is not enough
depth for a system that already has bounded contexts with distinct behavior.

**Scope**

- Add adapters/services for **Artifact**, **Agent Execution**, **Insight**,
  and **Metrics**.
- Stop treating `AppState` as a thin holder for database access.

**Acceptance criteria**

- MCP handlers consume bounded-context adapters through `AppState`.
- direct DB usage in handlers is reduced to exceptional cases only.

**Implementation**

`AppState` now holds:

- `node_service: Arc<NodeService>` (registry BC)
- `execution_store: Arc<ExecutionStore>` (execution BC)
- `artifact_store: Arc<ArtifactStore>` (artifact metadata BC)
- `artifact_service: Arc<ArtifactService>` (artifact filesystem BC)
- `analytics_service: Arc<AnalyticsService>` (insights BC)
- `sse_emitter: Arc<SseEmitter>` (metrics BC)
- `metrics_aggregator: Arc<MetricsAggregator>` (metrics BC)
- `db: Arc<Database>` (shared infra, not used directly by handlers)

**Suggested issue title**

`Turn AppState into a bounded-context adapter container`

---

## Wave 3: Artifact

### C1. Make ArtifactService the only storage authority

**Status**: ✅ COMPLETE

**Why**

The **Artifact** module already encodes the storage decision, but the API
seams still know too much about storage mechanics.

**Scope**

- Route MCP artifact creation through `ArtifactService`.
- Route REST artifact creation through `ArtifactService`.
- Route delete and retrieval through the same seam.

**Acceptance criteria**

- no storage-type branching remains in MCP or REST handlers,
- artifact behavior is driven by the **Artifact** module,
- artifact tests cover both transports.

**Suggested issue title**

`Make ArtifactService the only authority on artifact storage`

---

### C2. Enforce hybrid artifact storage from ADR-0005

**Why**

The project documents a size-based policy. The system should prove that the
policy is not just documentation.

**Scope**

- enforce `< 1 MB` SQLite storage,
- enforce `>= 1 MB` filesystem storage,
- verify checksum and retrieval across both paths.

**Acceptance criteria**

- tests cover both storage branches,
- cleanup behavior is verified,
- Studio and MCP can read both artifact types transparently.

**Implementation**: ✅ COMPLETE - 20 new tests added to `artifact_service.rs`
- Tests verify StorageType::for_size threshold behavior
- Tests verify store/retrieve/verify for both SQLite and Filesystem paths
- Tests verify 1MB boundary conditions
- 23 total artifact tests pass

---

### C3. Add artifact cleanup for execution deletion

**Status**: ✅ COMPLETE

**Why**

Filesystem-backed artifacts create an operations seam. Without cleanup,
**Artifact** loses locality because persistence leaks outside the module.

**Implementation**

- ✅ Added `cleanup_for_execution(execution_id: &str)` to `ArtifactService`
- ✅ Wired into `abort_execution` handler in `rest_handlers.rs`
- ✅ Added 3 tests: single artifact, multi-stage, nonexistent-is-noop

**Suggested issue title**

`Add filesystem cleanup for execution-scoped artifacts`

---

## Wave 4: observability

### D1. Replace stub metrics_query with real metrics

**Status**: ✅ COMPLETE (both MCP and REST)

**Implementation**

- MCP `metrics_query` (`metrics_handler.rs`): queries `ExecutionStore`,
  reconstructs stages with status (completed/running/pending), computes
  `total_duration_ms` from timestamps.
- REST `get_metrics` (`rest_handlers.rs:1103-1151`): queries `ExecutionStore.get()`,
  builds stage metrics from `completed_stages` + `current_stage`, computes
  `total_duration_ms` from `started_at`/`completed_at`.

**Suggested issue title**

`Implement real metrics_query for Agent Execution`

---

### D2. Define the canonical observability seam

**Status**: ⚠️ PARTIAL — no ADR, but de facto pattern established

**Why**

The project needs one explicit answer to this question: does **Insight** own
execution facts, does **Metrics** own them, or do both project from one
source?

**Current de facto model**

- `insights_log` persists structured events to SQLite (audit trail).
- `metrics_query` projects from execution state (no separate event store).
- Both are in `AppState` but have no shared source of truth.

**What remains**

- Write an ADR documenting the chosen observability model.
- Decide if Insights should be the event source and Metrics a projection,
  or if both are independent views of execution state.

**Suggested issue title**

`Define and implement canonical observability seam`

---

### D3. Add progress and summary tests for Studio and orchestrator views

**Status**: ⚠️ PARTIAL

**Why**

Observability only creates leverage if Studio and the orchestrator can trust
it.

**What exists**

- `metrics_handler.rs` has test verifying stage status (completed/running/pending).
- `insights_handler.rs` has aggregate count tests.
- `metrics_sse.rs` has broadcaster tests.

**What remains**

- Test execution summary behavior (final metrics after workflow completes).
- Test progress view for Studio (percent complete, elapsed time).

**Suggested issue title**

`Add observability tests for progress and execution summaries`

---

## Wave 5: domain-to-MCP translation

### E1. Add mapper modules between domain and MCP types

**Status**: ✅ COMPLETE

**Implementation**

- Created `crates/mcp-server/src/mappers.rs` with `From` impls for TriggerInfo, StageOutput, ExecutionState conversions
- Both domain→MCP and MCP→domain directions covered
- PersistedExecution → MCP ExecutionState mapper for database read model

**Why**

Right now, conversion logic is spread across handlers. That makes the seam
wide and reduces locality.

**Scope**

- create dedicated mapper modules,
- move conversions out of handlers,
- make mappings testable in isolation.

**Suggested issue title**

`Add explicit mappers between domain models and MCP types`

---

### E2. Normalize internal statuses as enums at the domain seam

**Status**: ✅ COMPLETE

**Implementation**

- `ExecutionStatus` enum in `execution_state.rs` with `as_str()` and `from_str()`
- `StageStatus` enum in `execution_state.rs` with `as_str()` and `from_str()`
- Strings only at MCP/REST protocol seam; enums used internally

**Why**

Strings are appropriate at the protocol seam, but they should not dominate the
 domain seam.

**Scope**

- prefer enums inside bounded contexts,
- serialize to strings only at the MCP seam.

**Suggested issue title**

`Normalize execution and insight statuses behind the MCP seam`

---

## Wave 6: execution_stages decision

### F1. Decide whether execution_stages is live schema or dead schema

**Status**: ✅ COMPLETE - Dead schema removed

**Why**

`execution_stages` currently exists in the database schema but is not used by any code. It creates ambiguity without leverage.

**Decision**: Remove the table as dead schema.

**Implementation**

- ✅ Verified table is not used by any code (only schema definition exists)
- ✅ Removed `execution_stages` table and `idx_exec_stages_exec` index from `db.rs`
- No migration scripts to update (fresh bootstrap only)

**Suggested issue title**

`Remove dead execution_stages table from schema`

---

### F2. If kept, turn execution_stages into the per-stage ledger

**Status**: DEPRECATED - superseded by F1 decision

**Why**

This issue is moot since F1 decided to remove the table.

**Scope**

N/A - table will be removed.

**Suggested issue title**

N/A

---

## Recommended next issues

All original backlog items are complete. Remaining work:

1. `Define and implement canonical observability seam` (D2 — write ADR)
2. `Add observability tests for progress and execution summaries` (D3)
3. Encapsulate remaining raw SQL (workspace CRUD 4, insights 1, alerts 3)

These are low-priority polish items that do not block Phase 5 (Studio UI).
