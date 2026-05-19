# Architecture improvement proposals

**Date:** May 18, 2026  
**Status:** Proposed  
**Source inputs:** `ARCHITECTURE.md`, `MCP-API.md`, `REST-API.md`,
`ORCHESTRATOR.md`, ADR-0003, ADR-0005, ADR-0007, ADR-0008

---

## Bottom line up front

The codebase has a strong domain shape on paper: **Registry**,
**Workflow**, **Artifact**, **Metrics**, and **Insights** are clear bounded
contexts, and the **MCP** layer is supposed to expose them to the
orchestrator and **Studio**.

The main implementation issue is not missing features anymore. It is
insufficient **depth** at the seams. The `mcp-server` module still absorbs
too much Implementation that belongs inside the bounded contexts. This makes
the **MCP** Interface wider than necessary, weakens **Agent Execution**
correctness, and reduces **locality** for changes.

This document records the best architectural deepening opportunities found in
the review, including a few lateral options that go beyond direct refactors.

For implementation-ready follow-up, see
`ARCHITECTURE-HARDENING-BACKLOG.md`.

---

## Review frame

The proposals below use these principles:

- Deepen modules whose Interface is currently almost as complex as their
  Implementation.
- Move business behavior behind the correct seam instead of reproducing it in
  the **MCP** layer.
- Improve **locality** so changes in one bounded context stay concentrated.
- Increase **leverage** so callers get more behavior from a smaller Interface.
- Respect accepted ADRs unless the current friction is serious enough to
  justify reopening one.

---

## Proposal 1: Deepen the Agent Execution module

### Files

- `crates/mcp-server/src/handler.rs`
- `crates/workflow/src/application/state_machine.rs`
- `crates/workflow/src/domain/execution_state.rs`
- `crates/registry/src/infrastructure/db.rs`

### Problem

The documented **Agent Execution** model is richer than the current
Implementation exposed by the **MCP** seam.

Examples:

- `pending_stages` is returned as an empty vector instead of being derived
  from the **Workflow** DAG.
- `stage_outputs` is not reconstructed into the documented shape when the
  execution is read back.
- `execution_context` is persisted, but not reconstructed as a first-class
  execution state view.
- `workflow_update_state` updates SQL directly instead of delegating to the
  `StateMachineService`.

This creates a shallow execution module: the Interface promises a real state
machine, while the Implementation still behaves like a partially materialized
record.

### Proposal

Introduce an **Agent Execution** module as the authoritative seam for:

1. creating an execution from a **Workflow**,
2. reconstructing execution state from persistence,
3. applying stage completion transitions,
4. deriving `pending_stages`, and
5. exposing the execution as MCP-facing data.

The **MCP** layer should delegate to that module instead of composing state
from raw DB reads.

### Lateral options

#### Option A: Event journal + projection

Instead of treating the `executions` table as the whole truth, treat
`execution_stages`, **Insights**, and execution status changes as an
execution journal. Then build a projection for current state.

This would turn **Agent Execution** into a deeper module with stronger audit
and recovery behavior.

#### Option B: Execution ledger without full event sourcing

Keep the current tables, but make `execution_stages` the canonical per-stage
ledger and let `executions` remain the execution summary.

This is a smaller move than full event sourcing, but it still improves the
seam and gives `pending_stages` and stage-level recovery a real home.

### Benefits

- Better **locality** for all execution rules.
- More **leverage** for Studio and the orchestrator, because they receive a
  coherent execution view.
- Stronger tests through the execution Interface instead of scattered SQL
  behavior.

### ADR alignment

This proposal reinforces **ADR-0007**.

---

## Proposal 2: Split the MCP monolith into bounded-context handlers

### Files

- `crates/mcp-server/src/handler.rs`
- `crates/mcp-server/src/main.rs`
- `crates/mcp-server/src/state.rs`

### Problem

`handler.rs` is a large mixed module that contains logic for **Workflow**,
**Artifact**, **Insight**, **Metrics**, registry discovery, and impact
analysis. That makes the **MCP** seam shallow and leaky.

Today, the handler does not just expose the API. It also owns too much
Implementation:

- SQL queries,
- conversions,
- parsing,
- orchestration rules, and
- persistence decisions.

### Proposal

Split the MCP-facing module into handlers by bounded context:

- `WorkflowMcpHandler`
- `RegistryMcpHandler`
- `ArtifactMcpHandler`
- `InsightsMcpHandler`
- `MetricsMcpHandler`

Keep one top-level router/dispatcher in `main.rs`, but push real behavior
behind these seams.

### Lateral options

#### Option A: Command/query dispatcher

Instead of a family of handler structs, define a small internal dispatcher:

- commands mutate **Agent Execution**, **Artifact**, or **Insight** state,
- queries return projections for Studio or the orchestrator.

This would make the MCP seam resemble an application layer rather than a bag
of endpoint functions.

#### Option B: Anti-corruption layer for MCP types

Treat MCP request/response types as external protocol types and explicitly
translate them into domain commands and queries before crossing the seam.

This gives the project a durable anti-corruption layer if the MCP API grows
or if a second transport is added later.

### Benefits

- Higher **depth** at the MCP seam.
- Better **locality** by bounded context.
- Easier unit testing of tool behavior without loading unrelated modules.

### ADR alignment

This proposal reinforces **ADR-0008**.

---

## Proposal 3: Make Artifact the only authority on storage decisions

### Files

- `crates/artifact/src/application/artifact_service.rs`
- `crates/mcp-server/src/handler.rs`
- `crates/mcp-server/src/rest_handlers.rs`

### Problem

The **Artifact** bounded context already contains the important storage rule:
small artifacts live in SQLite, large artifacts live in the filesystem.

However, the seam is not yet authoritative enough. The API layer still knows
too much about persistence details, which reduces the depth of the
**Artifact** module.

### Proposal

Move all storage choice, retrieval, verification, and deletion behind the
**Artifact** Interface. The **MCP** and REST layers should only provide
inputs and receive `Artifact` results.

### Lateral options

#### Option A: Content-addressed large artifact storage

For large artifacts, store filesystem blobs by checksum rather than by only
execution path. This can enable deduplication and stronger integrity checks.

#### Option B: Artifact classes, not just size threshold

Keep the 1 MB rule from **ADR-0005**, but allow future policy hooks based on
artifact class:

- specification,
- design,
- code,
- coverage,
- test output.

This keeps the current rule intact while giving the module future leverage.

### Benefits

- More **locality** around storage policy.
- Greater **leverage** from the Artifact Interface.
- Better tests for hybrid storage and cleanup behavior.

### ADR alignment

This proposal reinforces **ADR-0005**.

---

## Proposal 4: Converge Metrics and Insights into one observability seam

### Files

- `crates/metrics/*`
- `crates/insights/*`
- `crates/mcp-server/src/handler.rs`
- `docs/MCP-API.md`
- `docs/ORCHESTRATOR.md`

### Problem

The system has two observability concepts:

- **Insight** for structured execution events,
- **Metrics** for quantitative execution summaries.

That separation is valid, but the current Implementation still leaves the
**Metrics** seam shallow. `metrics_query` remains a stub, while
`insights_aggregate` is already real.

### Proposal

Treat **Insight** as the canonical execution event stream, then project
**Metrics** from it where possible.

This does not mean deleting the **Metrics** bounded context. It means making
its leverage explicit: **Metrics** becomes the projection module for
quantitative observability, while **Insights** remains the structured event
log.

### Lateral options

#### Option A: Insight-first observability

Persist all execution facts as **Insight** events, then build:

- execution summaries,
- token totals,
- duration totals,
- quality summaries,
- stage progress views.

This would simplify the mental model for Studio and the orchestrator.

#### Option B: Dual stream with one adapter

Keep **Metrics** and **Insights** separate, but generate both from a single
internal adapter that emits execution facts once.

This avoids duplicate instrumentation logic.

### Benefits

- Higher **leverage** from execution observability.
- Better **locality** for progress reporting and analytics.
- Clearer tests for the orchestrator-facing monitoring Interface.

### ADR alignment

This proposal strengthens **ADR-0008**. It may also be worth recording a new
ADR if the team decides that **Insight** becomes the canonical execution
event stream.

---

## Proposal 5: Add an explicit translation seam between domain and MCP types

### Files

- `crates/mcp-server/src/types.rs`
- `crates/workflow/src/domain/*`
- `crates/insights/src/domain/*`
- `crates/artifact/src/domain/*`

### Problem

The codebase currently has parallel type systems:

- MCP response/request types,
- domain types in **Workflow**, **Artifact**, and **Insights**.

Without a dedicated seam, conversion happens inline inside handlers. That
spreads knowledge about status strings, shape mismatches, and JSON structure
throughout the codebase.

### Proposal

Add explicit translators or mappers per bounded context:

- `workflow_mappers`
- `artifact_mappers`
- `insights_mappers`

These modules should own conversion between protocol types and domain types.

### Lateral options

#### Option A: Protocol DTOs stay in mcp-server

Keep MCP DTOs in `mcp-server`, but move all mapping into dedicated mapper
modules.

#### Option B: Each bounded context exports a public projection type

Instead of mapping from deep domain types directly, each bounded context can
export a projection specifically for external presentation. The MCP layer then
maps from one stable projection, not from the full domain object graph.

### Benefits

- More **locality** for conversions.
- Smaller handler Interfaces.
- Better unit tests around protocol compatibility.

---

## Proposal 6: Decide whether `execution_stages` is a real module or dead
schema

### Files

- `crates/registry/src/infrastructure/db.rs`
- all execution-related modules

### Problem

The `execution_stages` table exists in schema, but it is not used by a real
adapter. That means one of two things is true:

1. the design needs it, but the Implementation never completed the seam, or
2. the design moved on, and the table is now dead schema.

Dead schema weakens **locality** because maintainers must carry a concept
that is not actually part of the running system.

### Proposal

Make an explicit decision:

- either adopt `execution_stages` as the canonical per-stage persistence
  module for **Agent Execution**,
- or remove it and simplify the schema.

### Lateral options

#### Option A: Use it as the per-stage recovery seam

Record retries, stage transitions, timings, and per-stage errors there.

#### Option B: Use it as a Studio read model only

Keep it intentionally denormalized for UI queries and monitoring, while the
execution summary remains in `executions`.

### Benefits

- Better **locality** in schema design.
- Fewer ambiguous concepts for future contributors.
- Cleaner testing of stage-level execution behavior.

### ADR alignment

This may require a follow-up ADR if the team chooses to formalize
`execution_stages` as a first-class part of **Agent Execution**.

---

## Suggested sequencing

### Wave 1: Correctness and depth

1. Deepen **Agent Execution**.
2. Split the **MCP** seam by bounded context.
3. Decide the fate of `execution_stages`.

### Wave 2: Storage and observability

4. Make **Artifact** the only authority on storage.
5. Converge **Metrics** and **Insights** into a stronger observability seam.

### Wave 3: Interface cleanup

6. Add explicit domain-to-MCP translation seams.

---

## Decision triggers for future ADRs

Create or reopen an ADR when one of these becomes true:

- **Insight** becomes the canonical execution event stream.
- `execution_stages` becomes a required persistence module.
- the **MCP** seam is formalized as an anti-corruption layer.
- **Artifact** storage evolves beyond the current 1 MB policy.

---

## Recommended next step

If the team wants the highest return first, start with:

1. **Deepen Agent Execution**, then
2. **split the MCP seam by bounded context**.

Those two changes improve the correctness of the current system and make the
rest of the proposals easier to implement without widening the Interface
further.
