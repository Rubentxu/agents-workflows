# ADR-0009: Full-system E2E strategy

**Status:** Accepted  
**Date:** 2026-05-19  
**Deciders:** Agentic Workflow System Design Team

## Context

The repository already has Playwright-based E2E tests, but the existing setup
and suite structure do not fully match the product model or the reliability bar
needed for regression confidence.

We observed several issues:

- UI tests rely too heavily on visible text, CSS classes, and timeouts
- local runs and container-backed runs are not clearly separated
- documentation is outdated relative to the actual test files and endpoints
- the Studio product language requires `Agent Execution`, but parts of the UI
  and tests still use `Executions`
- full-system flows need stronger evidence capture than ordinary UI smoke tests
- Studio deep-link navigation depends on SPA fallback support from the server

We needed a durable decision for how the system should be tested end-to-end
without confusing Studio's responsibility boundaries. Studio observes agent-
reported behavior; it does not run workflows itself.

## Decision

We adopt a full-system E2E strategy with the following rules.

### 1. The canonical scope is full-system

The E2E suite covers Studio, REST, MCP, and real observed Agent Execution
behavior.

### 2. Runtime mode is hybrid

- **Container mode** is canonical for CI and official regression runs
- **Attach mode** is allowed for local development against an already running
  server

### 3. Execution drivers are mixed

- **MCP-direct flows** are used for fast, deterministic coverage
- **Agent-stub flows** are used for canonical end-to-end contract validation

### 4. Evidence capture is tiered

- default UI/API flows retain screenshots on failure, trace on retry or failure,
  and video on failure
- workflow/system flows keep stronger forensic evidence when failures occur

### 5. Isolation is hybrid

- suite-level seeded baselines are allowed for readonly flows
- isolated workspaces/resources are required for destructive or failure-driven
  scenarios

### 6. UI testability is explicit

Critical actions and states must expose stable `data-testid` hooks plus semantic
roles and accessible labels.

### 7. Terminology follows the domain

User-facing testing and UI should prefer `Agent Execution` over generic
`Execution` when referring to observed runs reported by agents.

## Consequences

### Positive

- better alignment between tests, documentation, and product boundaries
- more reliable CI regressions
- faster local debugging through attach mode
- clearer diagnosis from richer evidence capture
- less brittle browser tests through stable test selectors

### Negative

- more initial instrumentation work in the UI
- more documentation and fixture maintenance
- some flows require an agent stub or extra helpers, not only direct API calls
- full-system smoke tests remain slower than unit or integration tests

## Follow-up work

- instrument critical Studio surfaces with `data-testid`
- standardize Playwright helpers for evidence capture
- introduce or formalize agent-stub execution fixtures
- keep `docs/TEST-PLAN.md` synchronized with the operational suite
