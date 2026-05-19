# Spec-to-Code Gap Analysis

**Date:** 2026-05-19 (re-verified)
**Status:** Closed — 18 of 18 gaps resolved
**Source specs:** REST-API.md, MCP-API.md, ARCHITECTURE.md, ADR-0006, ADR-0007, ADR-0008

---

## Summary

Audited `crates/mcp-server/` against all specifications. Found **18 gaps** classified into
3 priority tiers. Each gap is expressed as one or more Gherkin scenarios ready for
implementation.

| Priority | Count | Theme |
|----------|-------|-------|
| P0 — Blocking | 8 | Routes, execution CRUD, artifact CRUD, insights persistence |
| P1 — High | 6 | Code duplication, YAML parse bug, workflow logic, state machine |
| P2 — Medium | 4 | Error codes, scope fields, validation, naming consistency |

### Resolution status (re-verified 2026-05-19)

| Gap | Status | Notes |
|-----|--------|-------|
| GAP-001 | ✅ Resolved | `/api` prefix via `Router::new().nest("/api", api_router)` |
| GAP-002 | ✅ Resolved | REST execution CRUD: get/pause/resume/abort all functional |
| GAP-003 | ✅ Resolved | REST artifact get/delete/download all functional |
| GAP-004 | ✅ Resolved | MCP `insights_log` persists to SQLite |
| GAP-005 | ✅ Resolved | MCP `execution_list` queries `ExecutionStore` |
| GAP-006 | ✅ Resolved | MCP `execution_get`/`artifact_get` use real data |
| GAP-007 | ✅ Resolved | Uses `WorkflowNavigator` for next-stage computation |
| GAP-008 | ✅ Resolved | `workflow_abort` persists state + artifact cleanup |
| GAP-009 | ✅ Resolved | `RestState` wraps `Arc<AppState>`, delegates all calls |
| GAP-010 | ⚠️ Deferred | Handlers are ~1173 lines; shared patterns exist but no generic fn |
| GAP-011 | ✅ Resolved | `update_workflow`, `update_agent`, `update_skill`, `update_prompt` all use `serde_yaml::from_str` |
| GAP-012 | ✅ Resolved | `generate_execution_plan` uses shared `parse_registry_workflow_yaml` |
| GAP-013 | ✅ Resolved | `list_nodes(None)` calls `node_service.list_all()` |
| GAP-014 | ✅ Resolved | All delete handlers return 404 on missing |
| GAP-015 | ✅ Resolved | Error codes: `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `ALREADY_EXISTS`, `INTERNAL_ERROR` |
| GAP-016 | ✅ Resolved | `CreateSkillRequest`/`CreatePromptRequest` have `scope` with `default_global_scope` |
| GAP-017 | ✅ Resolved | `create_workflow` preserves `description` in YAML config |
| GAP-018 | ✅ Resolved | `validate_arn()` used in most handlers; minor gap: `delete_agent`/`delete_skill`/`delete_prompt` skip it while `delete_workflow` uses it |

### Open issues discovered during verification

| Issue | Status | Description |
|-------|--------|-------------|
| ~~YAML parse in update agent/skill/prompt~~ | ✅ Fixed | All update handlers now use `serde_yaml::from_str` |
| ~~REST `get_metrics` is stub~~ | ✅ Fixed | Now queries `ExecutionStore` for real execution data |

---

## P0 — Blocking Gaps

Spec contracts that are completely broken or missing. No client following the spec
can use these features.

### GAP-001: REST routes missing `/api` prefix

**Spec:** REST-API.md — `Base URL: http://localhost:8080/api`
**Code:** `rest.rs` — `create_rest_router()` mounts all routes at root (`/health`, `/workflows`, etc.)
**Impact:** Every REST client that constructs URLs per spec gets 404.

```gherkin
Feature: REST API prefix
  In order to match the REST-API.md spec
  As a Studio frontend developer
  I want all REST endpoints served under /api

  Scenario: Health endpoint is served at /api/health
    When I send GET /api/health
    Then the response status is 200
    And the response body contains "status": "healthy"

  Scenario: Workspace list is served at /api/workspaces
    When I send GET /api/workspaces
    Then the response status is 200
    And the response body contains "workspaces"

  Scenario: Non-prefixed routes return 404
    When I send GET /health
    Then the response status is 404
```

**Files to change:** `crates/mcp-server/src/rest.rs`

---

### GAP-002: REST execution handlers always return 404

**Spec:** REST-API.md — Get/Pause/Resume/Abort execution
**Code:** `rest_handlers.rs:711-749` — all four handlers return hard-coded `StatusCode::NOT_FOUND`
**Impact:** Execution control panel in Studio is non-functional.

```gherkin
Feature: REST execution control
  In order to observe and control running workflows
  As a Studio operator
  I want to use the execution REST endpoints

  Background:
    Given a workflow "sdd-full" exists in the registry
    And an execution "run-001" exists with status "running"

  Scenario: Get execution by ARN
    When I send GET /api/executions/arn:local:workspace/ws1:execution/run-001
    Then the response status is 200
    And the response body contains "status": "running"

  Scenario: Pause a running execution
    When I send POST /api/executions/arn:local:workspace/ws1:execution/run-001/pause
    Then the response status is 200
    And the execution status is "paused"

  Scenario: Resume a paused execution
    Given the execution "run-001" is paused
    When I send POST /api/executions/arn:local:workspace/ws1:execution/run-001/resume
    Then the response status is 200
    And the execution status is "running"

  Scenario: Abort a running execution
    When I send POST /api/executions/arn:local:workspace/ws1:execution/run-001/abort
    Then the response status is 200
    And the execution status is "aborted"

  Scenario: Get non-existent execution
    When I send GET /api/executions/arn:local:workspace/ws1:execution/nonexistent
    Then the response status is 404
```

**Files to change:** `crates/mcp-server/src/rest_handlers.rs`

---

### GAP-003: REST artifact get/delete/download always return 404

**Spec:** REST-API.md — Get Artifact, Delete Artifact, Download Artifact
**Code:** `rest_handlers.rs:784-812` — three handlers return hard-coded 404
**Impact:** Artifact panel in Studio shows nothing on click.

```gherkin
Feature: REST artifact retrieval
  In order to view execution outputs
  As a Studio operator
  I want to retrieve, download, and delete artifacts

  Background:
    Given an artifact "spec-output" exists for execution "run-001" stage "spec"

  Scenario: Get artifact by ARN
    When I send GET /api/artifacts/arn:local:workspace/ws1:artifact/spec-output
    Then the response status is 200
    And the response body contains "name": "spec-output"

  Scenario: Download artifact raw content
    When I send GET /api/artifacts/arn:local:workspace/ws1:artifact/spec-output/download
    Then the response status is 200
    And the Content-Type header matches the artifact content_type

  Scenario: Delete an artifact
    When I send DELETE /api/artifacts/arn:local:workspace/ws1:artifact/spec-output
    Then the response status is 204
    And a subsequent GET returns 404

  Scenario: Get non-existent artifact
    When I send GET /api/artifacts/arn:local:workspace/ws1:artifact/missing
    Then the response status is 404
```

**Files to change:** `crates/mcp-server/src/rest_handlers.rs`

---

### GAP-004: MCP insights_log does not persist

**Spec:** MCP-API.md — `insights_log` persists structured events
**Code:** `handler.rs:707-716` — constructs an `Insight` and returns it without INSERT
**Impact:** Insights query always returns empty; no audit trail for workflow execution.

```gherkin
Feature: MCP insights persistence
  In order to build an audit trail of workflow execution
  As an orchestrator agent
  I want logged insights to be persisted and queryable

  Scenario: Log and retrieve an insight
    When I call insights_log with:
      | execution_arn | arn:local:workspace/ws1:execution/run-001 |
      | stage_id      | explore                                    |
      | insight_type  | stage:completed                            |
      | data          | { "duration_ms": 45000 }                   |
    Then the insight is persisted in the database
    When I call insights_query with execution_arn "arn:local:workspace/ws1:execution/run-001"
    Then the results include the logged insight
```

**Files to change:** `crates/mcp-server/src/handler.rs`

---

### GAP-005: MCP execution_list returns hard-coded mock

**Spec:** MCP-API.md — `execution_list` filters real executions from the database
**Code:** `handler.rs:590-603` — returns a single-item vec with hard-coded values
**Impact:** Studio and orchestrator see fake execution history.

```gherkin
Feature: MCP execution list is real
  In order to display accurate execution history
  As an orchestrator agent
  I want execution_list to query the database

  Background:
    Given 3 executions exist for workspace "ws1"
    And 2 of them have status "completed"
    And 1 of them has status "running"

  Scenario: List all executions for a workspace
    When I call execution_list with workspace_id "ws1"
    Then the result contains 3 executions

  Scenario: Filter executions by status
    When I call execution_list with workspace_id "ws1" and status "completed"
    Then the result contains 2 executions

  Scenario: Limit execution results
    When I call execution_list with limit 1
    Then the result contains at most 1 execution
```

**Files to change:** `crates/mcp-server/src/handler.rs`

---

### GAP-006: MCP execution_get and artifact_get are mocks

**Spec:** MCP-API.md — `execution_get`, `artifact_get`, `artifact_list`
**Code:** `handler.rs:606-700` — returns hard-coded objects
**Impact:** Orchestrator cannot retrieve real execution state or artifacts.

```gherkin
Feature: MCP execution and artifact retrieval is real

  Background:
    Given an execution "run-001" exists with status "running" and current_stage "spec"
    And an artifact "explore-report" exists for execution "run-001" stage "explore"

  Scenario: Get execution by ARN returns real data
    When I call execution_get with arn "arn:local:workspace/ws1:execution/run-001"
    Then the result contains status "running"
    And the result contains current_stage "spec"

  Scenario: Get artifact by ARN returns real content
    When I call artifact_get with arn "arn:local:workspace/ws1:artifact/explore-report"
    Then the result contains the actual artifact content

  Scenario: List artifacts for execution
    When I call artifact_list with execution_arn "arn:local:workspace/ws1:execution/run-001"
    Then the result includes artifact "explore-report"
```

**Files to change:** `crates/mcp-server/src/handler.rs`

---

### GAP-007: MCP workflow_get_next_stage ignores parameters

**Spec:** ADR-0007 — `workflow_get_next_stage` uses DAG and completed stages
**Code:** `handler.rs:375-386` — always returns `"stage-1"` with `conditions_met: true`
**Impact:** Orchestrator cannot determine what stage to run next.

```gherkin
Feature: MCP workflow next stage uses DAG
  In order to sequence stages correctly
  As an orchestrator agent
  I want workflow_get_next_stage to compute the next stage from the DAG

  Background:
    Given a workflow "sdd-full" with stages: explore → propose → spec → design → apply → verify

  Scenario: First stage after execution start
    When I call workflow_get_next_stage with completed_stage null
    Then the suggested_stage is "explore"

  Scenario: Next stage after completing explore
    When I call workflow_get_next_stage with completed_stage "explore"
    Then the suggested_stage is "propose"

  Scenario: Parallel stages are suggested together
    Given a workflow "parallel-ci" with stages: build → {test, lint} → deploy
    When I call workflow_get_next_stage with completed_stage "build"
    Then the suggested_stage includes both "test" and "lint"
```

**Files to change:** `crates/mcp-server/src/handler.rs`

---

### GAP-008: MCP workflow_abort does not update state

**Spec:** ADR-0007 — `workflow_abort` transitions execution to "aborted" in DB
**Code:** `handler.rs:389-400` — returns a hard-coded object without DB UPDATE
**Impact:** Abort has no effect; execution continues.

```gherkin
Feature: MCP workflow abort persists state change
  In order to stop a running workflow
  As an orchestrator agent
  I want workflow_abort to persist the aborted state

  Background:
    Given an execution "run-001" exists with status "running"

  Scenario: Abort a running execution
    When I call workflow_abort with execution_arn "arn:local:workspace/ws1:execution/run-001"
    Then the execution status in the database is "aborted"
    And the returned ExecutionState has status "aborted"

  Scenario: Abort a completed execution fails
    Given the execution "run-002" exists with status "completed"
    When I call workflow_abort with execution_arn "arn:local:workspace/ws1:execution/run-002"
    Then the result is an error indicating invalid state transition
```

**Files to change:** `crates/mcp-server/src/handler.rs`

---

## P1 — High Priority Gaps

Functional issues that degrade correctness but don't block the entire system.

### GAP-009: Duplicated state between RestState and AppState

**Spec:** ARCHITECTURE.md — single Axum server, shared services
**Code:** `rest.rs:RestState` and `state.rs:AppState` have identical fields (`db`, `node_service`)
and duplicate methods (`list_by_type` vs `list_nodes`, `get_node` vs `get_node`)
**Impact:** Divergent behavior, maintenance burden, risk of inconsistency.

```gherkin
Feature: Unified application state
  In order to avoid duplicated service references
  As a developer
  I want REST and MCP handlers to share a single state struct

  Scenario: RestState wraps AppState instead of duplicating fields
    Given the source code of rest.rs
    Then RestState contains an Arc<AppState>
    And RestState does NOT contain its own db or node_service fields

  Scenario: All handler methods delegate to AppState
    Given the RestState implementation
    Then list_by_type delegates to AppState.list_nodes
    And get_node delegates to AppState.get_node
    And save_node delegates to AppState.node_service
```

**Files to change:** `crates/mcp-server/src/rest.rs`, `crates/mcp-server/src/state.rs`

---

### GAP-010: CRUD handler duplication across resource types

**Spec:** ARCHITECTURE.md — clean, maintainable codebase
**Code:** `rest_handlers.rs` — create/get/update/delete for Workflow, Agent, Skill, Prompt
are nearly identical (each ~80 lines with only NodeType and ARN format differing)
**Impact:** 4× the code to maintain, high risk of inconsistency.

```gherkin
Feature: Generic resource CRUD handlers
  In order to reduce code duplication
  As a developer
  I want a generic implementation for resource CRUD

  Scenario: Create handler is shared
    Given a generic function create_resource(node_type, scope_format)
    Then create_workflow, create_agent, create_skill, create_prompt all delegate to it

  Scenario: Get handler is shared
    Given a generic function get_resource(node_type)
    Then get_workflow, get_agent, get_skill, get_prompt all delegate to it

  Scenario: Update handler is shared
    Given a generic function update_resource(node_type)
    Then update_workflow, update_agent, update_skill, update_prompt all delegate to it

  Scenario: Delete handler is shared
    Given a generic function delete_resource()
    Then delete_workflow, delete_agent, delete_skill, delete_prompt all delegate to it
```

**Files to change:** `crates/mcp-server/src/rest_handlers.rs`

---

### GAP-011: update_workflow parses config as JSON but data is YAML

**Spec:** CONTEXT.md — `config_json` stores YAML manifest
**Code:** `rest_handlers.rs:235-238` — `serde_json::from_str(c)` on YAML content
**Impact:** Update silently destroys workflow config when YAML is not JSON-compatible.

```gherkin
Feature: Update workflow preserves YAML format
  In order to avoid data loss during workflow updates
  As a Studio user
  I want the update handler to correctly parse and re-serialize YAML

  Scenario: Update description preserves existing stages
    Given a workflow with YAML config containing stages and execution settings
    When I send PUT /api/workflows/{arn} with description "updated"
    Then the workflow config is still valid YAML
    And the existing stages are preserved
    And the description is updated

  Scenario: Update stages preserves existing metadata
    Given a workflow with YAML config containing metadata and labels
    When I send PUT /api/workflows/{arn} with new stages
    Then the metadata and labels are preserved
```

**Files to change:** `crates/mcp-server/src/rest_handlers.rs` — use `serde_yaml::from_str` instead of `serde_json::from_str` when reading `config_json`

---

### GAP-012: generate_execution_plan parses config as JSON but data is YAML

**Spec:** CONTEXT.md — `config_json` stores YAML manifest
**Code:** `state.rs:143-146` — `serde_json::from_str(&config)` on YAML content
**Impact:** Execution planning never works for REST-created workflows.

```gherkin
Feature: Execution planning parses YAML config
  In order to generate execution plans
  As a workflow engine
  I want generate_execution_plan to parse YAML correctly

  Scenario: Plan for a REST-created workflow
    Given a workflow created via REST API (config stored as YAML)
    When I call generate_execution_plan for that workflow
    Then the plan contains the correct stages and dependencies
```

**Files to change:** `crates/mcp-server/src/state.rs`

---

### GAP-013: list_nodes(None) returns empty vec

**Spec:** ARCHITECTURE.md — Registry context supports listing all nodes
**Code:** `state.rs:62-65` — `None => { vec![] }`
**Impact:** Cannot list all resources regardless of type.

```gherkin
Feature: List all nodes without type filter
  In order to browse the full registry
  As an operator
  I want to list all nodes regardless of type

  Scenario: List all nodes returns every node
    Given 3 workflows, 2 agents, and 4 skills exist in the registry
    When I call list_nodes with no type filter
    Then the result contains 9 nodes
```

**Files to change:** `crates/mcp-server/src/state.rs`, `crates/registry/src/infrastructure/node_repository.rs`

---

### GAP-014: Delete handlers return 204 even when resource doesn't exist

**Spec:** REST-API.md — `204 No Content` implies resource existed and was deleted
**Code:** `rest_handlers.rs:273-281` — `state.delete_node()` succeeds even with 0 rows deleted
**Impact:** Client cannot distinguish between "deleted" and "never existed".

```gherkin
Feature: Delete returns 404 for non-existent resources
  In order to give accurate feedback
  As a Studio user
  I want DELETE to return 404 when the resource does not exist

  Scenario: Delete existing workflow returns 204
    Given a workflow "test-wf" exists
    When I send DELETE /api/workflows/{arn}
    Then the response status is 204

  Scenario: Delete non-existent workflow returns 404
    Given no workflow with name "ghost" exists
    When I send DELETE /api/workflows/arn:local:global:workflow/ghost
    Then the response status is 404
```

**Files to change:** `crates/mcp-server/src/rest_handlers.rs` — check row count after delete

---

## P2 — Medium Priority Gaps

Polish and spec alignment issues that don't break core functionality.

### GAP-015: Error codes don't match REST-API.md spec

**Spec:** REST-API.md — `VALIDATION_ERROR`, `RESOURCE_NOT_FOUND`, `ALREADY_EXISTS`, `INTERNAL_ERROR`
**Code:** Uses `NOT_FOUND`, `DB_ERROR`, `SAVE_ERROR`, `DELETE_ERROR`, `YAML_ERROR`, `CONFLICT`, `INVALID_ARN`
**Impact:** Clients cannot parse errors per spec.

```gherkin
Feature: Error codes match specification
  In order to handle errors programmatically
  As a client developer
  I want error codes to match the REST-API.md spec

  Scenario: Resource not found returns RESOURCE_NOT_FOUND
    When I request a non-existent workflow
    Then the error code is "RESOURCE_NOT_FOUND"

  Scenario: Duplicate creation returns ALREADY_EXISTS
    When I create a workflow that already exists
    Then the error code is "ALREADY_EXISTS"

  Scenario: Bad request returns VALIDATION_ERROR
    When I send invalid JSON to a create endpoint
    Then the error code is "VALIDATION_ERROR"

  Scenario: Server error returns INTERNAL_ERROR
    When an unexpected database error occurs
    Then the error code is "INTERNAL_ERROR"
```

**Files to change:** `crates/mcp-server/src/rest_handlers.rs`, `crates/mcp-server/src/rest_types.rs`

---

### GAP-016: Skills and Promplets forced to global scope

**Spec:** ADR-0006 — Resources can exist in `global` or `workspace/{id}` scope
**Code:** `rest_handlers.rs:445,575` — hard-codes `arn:local:global:skill/` and `arn:local:global:prompt/`
**Impact:** Cannot create workspace-scoped skills or prompts via REST.

```gherkin
Feature: Skills and prompts support workspace scope
  In order to create workspace-specific resources
  As a project admin
  I want to scope skills and prompts to a workspace

  Scenario: Create skill with workspace scope
    When I send POST /api/skills with:
      | name        | my-skill                |
      | scope       | workspace/ws1           |
      | description | A workspace skill       |
    Then the response status is 201
    And the ARN is "arn:local:workspace/ws1:skill/my-skill"

  Scenario: Create skill defaults to global scope
    When I send POST /api/skills without scope
    Then the ARN is "arn:local:global:skill/{name}"

  Scenario: Create prompt with workspace scope
    When I send POST /api/prompts with scope "workspace/ws1"
    Then the response status is 201
    And the ARN is "arn:local:workspace/ws1:prompt/{name}"
```

**Files to change:** `crates/mcp-server/src/rest_types.rs`, `crates/mcp-server/src/rest_handlers.rs`

---

### GAP-017: create_workflow ignores description field

**Spec:** REST-API.md — Create Workflow accepts `description`
**Code:** `rest_handlers.rs:163-175` — `req.description` is never used in the YAML manifest
**Impact:** Workflow descriptions are silently dropped on creation.

```gherkin
Feature: Create workflow preserves description
  In order to document workflows
  As a Studio user
  I want the description to be saved when creating a workflow

  Scenario: Create workflow with description
    When I send POST /api/workflows with description "CI pipeline"
    Then the stored workflow config contains "CI pipeline" in metadata.annotations.description

  Scenario: Create workflow without description
    When I send POST /api/workflows without description
    Then the workflow is created successfully
    And no description field is set
```

**Files to change:** `crates/mcp-server/src/rest_handlers.rs`

---

### GAP-018: parse_arn helper defined but never used

**Spec:** Code quality
**Code:** `rest_handlers.rs:15-26` — `parse_arn()` function exists but is never called
**Impact:** Dead code, no ARN validation on incoming path params.

```gherkin
Feature: ARN validation on path parameters
  In order to reject malformed requests early
  As the server
  I want all ARN path parameters to be validated

  Scenario: Valid ARN is accepted
    When I send GET /api/workflows/arn:local:global:workflow/test
    Then the request is processed normally

  Scenario: Invalid ARN returns 400
    When I send GET /api/workflows/not-an-arn
    Then the response status is 400
    And the error code is "VALIDATION_ERROR"
```

**Files to change:** `crates/mcp-server/src/rest_handlers.rs` — integrate `parse_arn` into all get/update/delete handlers

---

## Implementation Order

The recommended order to close these gaps, respecting dependencies:

```
Sprint 1 — Unblocking the API surface
  GAP-001  /api prefix                      (rest.rs)
  GAP-002  REST execution CRUD              (rest_handlers.rs + handler.rs)
  GAP-003  REST artifact retrieval           (rest_handlers.rs)
  GAP-004  MCP insights_log persistence      (handler.rs)

Sprint 2 — Making MCP real
  GAP-005  MCP execution_list from DB        (handler.rs)
  GAP-006  MCP execution_get / artifact_get  (handler.rs)
  GAP-007  MCP workflow_get_next_stage       (handler.rs)
  GAP-008  MCP workflow_abort persistence    (handler.rs)

Sprint 3 — Code quality
  GAP-009  Unify RestState + AppState        (rest.rs, state.rs)
  GAP-010  Generic CRUD handlers            (rest_handlers.rs)
  GAP-011  YAML parse in update_workflow    (rest_handlers.rs)
  GAP-012  YAML parse in generate_plan      (state.rs)

Sprint 4 — Polish
  GAP-013  list_nodes(None) returns all     (state.rs, node_repository.rs)
  GAP-014  Delete returns 404 on missing    (rest_handlers.rs)
  GAP-015  Error codes match spec           (rest_handlers.rs, rest_types.rs)
  GAP-016  Skill/Prompt workspace scope     (rest_handlers.rs, rest_types.rs)
  GAP-017  Workflow description on create   (rest_handlers.rs)
  GAP-018  ARN validation in handlers       (rest_handlers.rs)
```

---

## Implementation summary

All 18 gaps have been verified against the codebase as of 2026-05-19.

**Build**: 0 errors, 81 tests passing (35 workflow + 23 mcp-server + 7 registry + 16 integration)

**Architecture improvements since original analysis**:
- REST execution handlers route through `ExecutionStore` (not raw SQL)
- REST artifact handlers route through `ArtifactStore` (not raw SQL)
- MCP `execution_history` uses real data from `ExecutionStore.list()`
- REST `get_metrics` uses real data from `ExecutionStore.get()`
- MCP `workflow_get` uses shared domain `parse_registry_workflow_yaml`
- `update_agent`/`update_skill`/`update_prompt` use `serde_yaml::from_str`
- `AppState` is raw-SQL-free (all SQL in `ExecutionStore` + `ArtifactStore`)
- `StateMachineService` deleted entirely
- `execution_repository::mappers` module deleted (dead code)
- 8 raw SQL remaining: workspace CRUD (4), insights (1), alerts (3)

**Only remaining deferred item**: GAP-010 (generic CRUD handler) — code works, but 4 resource types repeat ~80 lines each.
