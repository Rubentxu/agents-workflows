# Test plan

## Bottom line up front

This repository uses a layered test strategy, but the highest-risk gap today is
the full-system end-to-end path across Studio, REST, MCP, and real observed
Agent Executions. The canonical E2E suite must validate the product as it is
documented: Studio manages resources and observes agent-reported behavior; it
does not run workflows itself.

## Test layers

### Unit tests

Use unit tests for domain invariants, parsing, and structural behavior inside
each bounded context.

- `registry` — ARN parsing, node CRUD, edge relationships
- `workflow` — workflow validation, navigation, execution state behavior
- `artifact` — metadata behavior and storage rules
- `insights` — event validation and query behavior
- `metrics` — aggregation and stream behavior

### Integration tests

Use integration tests for crate boundaries and adapter behavior.

- MCP server handlers
- REST handlers
- repository adapters and persistence seams
- workspace and artifact storage flows

### End-to-end tests

Use Playwright E2E for full-system confidence across:

- Studio UI
- REST API
- MCP API
- Agent Execution reporting flows
- observability surfaces in Studio

## Canonical E2E scope

The mandatory full-system E2E suite covers seven capability pillars.

1. **Studio shell**
   - shell loads
   - project navigation works
   - responsive behavior is intact
   - theme toggles work
   - command palette opens, filters, and navigates

2. **Design CRUD**
   - workflows, agents, skills, and prompts can be listed
   - create, edit, and delete flows work
   - validation and error states render correctly
   - persisted changes survive refresh

3. **Observed Agent Execution flow**
   - resources are seeded or created
   - an execution is reported through MCP or an agent stub
   - the execution appears in Studio
   - execution detail shows timeline, logs, metrics, insights, and artifacts

4. **Registry, dependencies, and impact review**
   - resources are visible in registry views
   - dependency navigation works
   - destructive/shared changes surface impact review correctly

5. **Project and workspace scoping**
   - `All Workspaces` and specific workspace filters behave correctly
   - effective resources and overrides are represented correctly
   - workspace isolation is preserved

6. **Failure scenarios**
   - failed Agent Executions are visible
   - insights/errors are surfaced
   - partial artifacts and missing artifacts are handled safely
   - empty and error UI states are tested

7. **Accessibility and observability minimums**
   - critical flows work with keyboard navigation
   - important controls expose stable accessible names
   - console errors are captured
   - failed network requests are surfaced in test evidence

## E2E runtime modes

### Container mode

Container mode is the canonical path for CI and official regression runs.

- deterministic environment
- reproducible ports and startup sequence
- no dependency on an already running local server

### Attach mode

Attach mode is for local development against an already running server.

- faster local iteration
- useful when debugging UI or MCP behavior in place
- explicitly enabled with environment variables

Use:

```bash
cd tests && E2E_MODE=attach SKIP_CONTAINER_CHECK=1 npx playwright test
```

## Execution drivers

The E2E suite uses two ways to produce observed behavior.

### MCP-direct flows

Use MCP-direct calls for deterministic, fast, broad coverage.

Best for:
- CRUD-adjacent execution state setup
- status transitions
- insight and artifact seeding
- pagination/filtering scenarios

### Agent-stub flows

Use an agent stub or fixture runner for canonical end-to-end observed behavior.

Best for:
- contract validation that an agent discovers and uses resources
- realistic Agent Execution reporting
- smoke flows that prove Studio is observing, not inventing, runtime state

## Isolation model

The suite uses hybrid isolation.

### Suite-level seeded baselines

Use suite-level seeds for:
- shell navigation
- readonly catalogs
- dashboard visibility
- non-destructive browse flows

### Per-test isolation

Use isolated resources or workspaces for:
- destructive CRUD
- override creation and revert flows
- impact review
- failure injection
- canonical Agent Execution traces

## Evidence capture policy

Artifacts must stay under ignored paths such as:

- `tests/test-results/`
- `tests/playwright-report/`
- `~/.workflows/`

### Default evidence

- screenshot on failure
- trace on first retry for local runs
- trace retained on failure in CI
- video retained on failure

### Forensic evidence for workflow/system flows

For smoke and full-system execution flows, prefer stronger evidence retention:

- screenshots at key milestones
- trace retained on failure
- video retained on failure or always for especially flaky investigations
- console errors and failed request logs attached on failure
- MCP/REST transcript capture when feasible
- DOM or URL snapshot for final failure state

## UI testability contract

Stable E2E requires explicit instrumentation.

### Required selector rules

- use `data-testid` for critical actions and states
- use semantic `role` and canonical `aria-label` values
- do not use CSS classes as the primary E2E anchor
- use visible text as supporting evidence, not as the main locator

### Minimum critical instrumentation

- sidebar navigation items
- workspace selector
- command palette input and categories
- catalog list/create/refresh/delete controls
- Agent Execution lists and rows
- empty states
- error states
- impact review actions

## Suite classification

### Smoke

Run on every high-confidence verification path.

- server reachable
- Studio shell reachable
- one design CRUD path
- one observed Agent Execution path
- one failure visibility path

### Full regression

Run for release confidence and CI gates.

- all seven pillars
- multiple scopes
- multiple execution states
- dependency and impact review flows

### Exploratory and debug

Run when diagnosing regressions or evolving features.

- stress scenarios
- extra screenshot coverage
- failure injection variants
- reproduction-specific flows

## Current known gaps

- some Studio selectors still depend on text or CSS instead of `data-testid`
- attach mode and container mode were previously blurred in setup
- legacy docs referenced outdated spec names and commands
- Studio deep-link handling required SPA fallback support on the server
- UI terminology was inconsistent between `Executions` and `Agent Executions`

## Commands

### Local developer mode

```bash
cd tests && npm run test:local
cd tests && npm run test:ui:local
```

### Container-backed mode

```bash
just test_container_up
just test_e2e
just test_ui
```

## Maintenance checklist

Before merging E2E changes, verify that:

- selectors are stable and intentional
- generated artifacts remain git-ignored
- setup works in both container and attach modes
- tests avoid fixed `waitForTimeout` where a deterministic signal exists
- runtime language matches product language (`Agent Execution`)
- docs and scripts reference real file names and real endpoints
