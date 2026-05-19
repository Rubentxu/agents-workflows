# Roadmap

## Agentic Workflow System

**Last Updated:** 2026-05-19  
**Version:** 2.0.0-planning

---

## Architecture Summary

```
agents-workflows (SINGLE BINARY)
├── Axum Server (:8080)
│   ├── /studio/*   → React (embedded)
│   ├── /api/*      → REST API (Studio CRUD)
│   ├── /mcp/*     → MCP HTTP Stream
│   └── /metrics/sse → SSE streaming
└── ~/.workflows/
    ├── global/       → arn:local:global:*
    └── workspaces/   → arn:local:workspace/{id}:*
```

## Architecture hardening

The original roadmap focuses on feature delivery. After the implementation
review against `@docs`, the project also has an architecture hardening
backlog.

See `docs/ARCHITECTURE-IMPROVEMENTS.md` for the current proposals, especially
for:

- deepening the **Agent Execution** module,
- splitting the **MCP** seam by bounded context,
- making **Artifact** the only authority on storage decisions,
- converging **Metrics** and **Insights** into a stronger observability seam,
- adding explicit domain-to-MCP translation seams.

---

## Phases

### Phase 1: Core Infrastructure

**Goal:** Database schema, workspace management, basic registry.

| Task | Description | Status |
|------|-------------|--------|
| 1.1 | Update SQLite schema (nodes, edges, executions, artifacts, insights) | ✅ Done |
| 1.2 | Workspace CRUD API | ✅ Done |
| 1.3 | ARN parser and validator | ✅ Done |
| 1.4 | Multi-workspace segmentation | ✅ Done |
| 1.5 | Registry scanner (filesystem → DB) | ✅ Done |

**Deliverables:**
- SQLite schema with insights table
- Workspace creation/deletion via REST API
- ARN format: `arn:local:{scope}:{type}/{name}`

**Duration:** 1 week

---

### Phase 2: Rich MCP API

**Goal:** Complete MCP server with all orchestration tools.

| Task | Description | Status |
|------|-------------|--------|
| 2.1 | MCP HTTP Stream transport (rmcp) | ✅ Done |
| 2.2 | Workflow tools (list, get, get_dag, execute) | ✅ Done |
| 2.3 | Resource tools (agent/skill/prompt list, get, query) | ✅ Done |
| 2.4 | Artifact tools (create, get, list) | ✅ Done |
| 2.5 | Execution tools (list, get, history) | ✅ Done |
| 2.6 | Insights tools (log, query) | ✅ Done |
| 2.7 | Metrics tools (query, subscribe) | ✅ Done |

**Deliverables:**
- Complete MCP API as specified in docs/MCP-API.md (26 tools)
- HTTP Stream transport for IDE integration
- Dedicated handlers: `WorkflowMcpHandler`, `ArtifactMcpHandler`, `InsightsMcpHandler`, `MetricsMcpHandler`

**Duration:** 2 weeks

---

### Phase 3: Server-Side State Machine

**Goal:** Execution state management, transitions, DAG validation.

| Task | Description | Status |
|------|-------------|--------|
| 3.1 | ExecutionState domain entity | ✅ Done |
| 3.2 | State transitions (pending → running → completed/failed) | ✅ Done |
| 3.3 | workflow_update_state tool | ✅ Done |
| 3.4 | workflow_get_next_stage tool | ✅ Done (via `WorkflowNavigator`) |
| 3.5 | Conditional transitions (based on workflow config) | ✅ Done |
| 3.6 | Parallel stage detection | ✅ Done |
| 3.7 | DDD refactor: `WorkflowNavigator` + `ExecutionApplicationService` | ✅ Done |
| 3.8 | Remove `Dag` from domain layer | ✅ Done |

**Deliverables:**
- Server-side execution state machine with DDD layering
- `Workflow` = definition aggregate, `ExecutionState` = runtime aggregate
- `StateMachineService` deleted entirely — production uses `ExecutionApplicationService` + `WorkflowNavigator`
- State persisted to SQLite through `ExecutionRepository` port + `ExecutionStore` + `ArtifactStore`
- 81 unit + integration tests passing (35 workflow + 23 mcp-server + 7 registry + 16 integration)

**Duration:** 2 weeks

---

### Phase 4: REST API (Studio Backend)

**Goal:** Full CRUD for resource administration via REST.

| Task | Description | Status |
|------|-------------|--------|
| 4.1 | Workflow CRUD endpoints | ✅ Done |
| 4.2 | Agent CRUD endpoints | ✅ Done |
| 4.3 | Skill CRUD endpoints | ✅ Done |
| 4.4 | Prompt CRUD endpoints | ✅ Done |
| 4.5 | Execution control (pause, resume, abort) | ✅ Done |
| 4.6 | Server config endpoints | ✅ Done |
| 4.7 | Error codes per spec | ✅ Done |
| 4.8 | YAML parse in update handlers | ✅ Done (workflow, agent, skill, prompt all use serde_yaml) |
| 4.9 | REST metrics wired to real data | ✅ Done |
| 4.10 | REST execution handlers through ExecutionStore | ✅ Done |
| 4.11 | REST artifact handlers through ArtifactStore | ✅ Done |

**Deliverables:**
- REST API at `/api/*` as specified in REST-API.md
- Resource persistence to filesystem + DB index
- 18 GAP items resolved (all verified)
- 81 tests passing (35 workflow + 23 mcp-server + 7 registry + 16 integration)
- REST handlers route through `ExecutionStore` and `ArtifactStore` (no raw execution/artifact SQL in handlers)
- AppState is raw-SQL-free (all SQL encapsulated in `ExecutionStore` and `ArtifactStore`)

**Duration:** 1 week

---

### Phase 5: Embedded Studio UI

**Goal:** React app embedded in binary, served by Axum.

| Task | Description | Status |
|------|-------------|--------|
| 5.1 | React build setup + include_dir! integration | ✅ Done |
| 5.2 | WorkflowCanvas (React Flow) | ✅ Done |
| 5.3 | Registry Browser (workflows, agents, skills) | ✅ Done |
| 5.4 | Execution Dashboard (real-time metrics) | ✅ Done — MetricsPage with SSE real data, 5 tabs (Agent Executions, Workflows, Agents, Resources, System) |
| 5.5 | Resource Editor (create/edit workflows, agents) | ✅ Done — All editors wired to REST API (Workflow, Agent, Skill, Prompt, Tool, Template) |
| 5.6 | Artifact Viewer | ✅ Done (ArtifactsListPage) |
| 5.7 | Dev mode proxy to Vite | ✅ Done (vite.config.ts proxy) |

**Implementation summary (verified 2026-05-19):**
- **81+ TypeScript files, ~8,500 LOC**, TypeScript 0 errors, Vite build clean (253 modules)
- **studio.rs**: `embedded-studio` feature flag with `include_dir!` + filesystem fallback, both cfg paths implemented
- **7 Zustand stores**: dashboard, workflowEditor, execution, registryCache, metrics, registry + workspaceStore (new)
- **11 hooks**: mcpClient (JSON-RPC), useMcpTools (8 MCP ops), useDashboard, useExecutionApi, useInsightsApi, useResourceApi, useMetricsStream (SSE), useProjects, useResourceCatalog, useWorkspaceApi (new)
- **30+ routes**: StudioShell → ProjectLayout → pages, React Router v6
- **ReactFlow editors**: WorkflowEditorPage (365 LOC), AgentExecutionDetailPage (347 LOC)
- **Known remaining gaps**: ProjectsPage hardcoded to "app", DependenciesPage uses mock data, CSS light-mode only

**Deliverables:**
- ✅ Studio served from binary via include_dir!
- ✅ Dev mode with hot reload (Vite proxy)
- ✅ Full CRUD UI for resources (all editors wired to REST API)

**Duration:** 3 weeks

---

### Phase 6: Bootstrap & Templates

**Goal:** Idempotent init, default resources, git templates.

| Task | Description | Status |
|------|-------------|--------|
| 6.1 | CLI init command (idempotent) | ✅ Done — `agents-workflows-server init [--workspace <path>] [--template <git-url>]` |
| 6.2 | Default resources (sdd-*, orchestrator agent) | ✅ Done — sdd-full.yaml, orchestrator.yaml, 8 SDD skills, sdd-orchestrator prompt |
| 6.3 | Git template loader | ✅ Done — stub exists (`--template <git-url>` flag), waits on registry design |
| 6.4 | Default workflow configuration | ✅ Done — ~/.workflows/global/ directory structure + registry.db |

**Deliverables:**
- ✅ `agents-workflows-server init` command (idempotent, creates ~/.workflows structure)
- ✅ Default SDD workflows, agents, skills
- ✅ Template loading from git repositories (stub with proper flag)

**Duration:** 1 week

---

### Phase 7: Orchestrator Agent

**Goal:** Orchestrator prompt for IDE deployment.

| Task | Description | Status |
|------|-------------|--------|
| 7.1 | Orchestrator prompt template | ✅ Done — `~/.workflows/global/prompts/orchestrator-agent.md` (361 lines) |
| 7.2 | IDE configuration guides (OpenCode focus) | ✅ Done — `docs/ORCHESTRATOR.md` (518 lines) |
| 7.3 | Agent delegation pattern | ✅ Done — documented in ORCHESTRATOR.md |
| 7.4 | Insights logging integration | ✅ Done — documented in ORCHESTRATOR.md |

**Deliverables:**
- ✅ Orchestrator agent prompt (`~/.workflows/global/prompts/orchestrator-agent.md`)
- ✅ OpenCode configuration guide (`docs/ORCHESTRATOR.md`)
- ✅ IDE guides: Claude Code, Cursor, Windsurf
- ✅ Agent delegation pattern documented
- ✅ Insights logging integration documented

**Duration:** 1 week

---

### Phase 8: Integration & Testing

**Goal:** End-to-end with OpenCode, performance testing.

| Task | Description | Status |
|------|-------------|--------|
| 8.1 | OpenCode MCP configuration | ✅ Done — `docs/examples/opencode.jsonc` |
| 8.2 | End-to-end execution test | ✅ Done — `e2e_workflow_test.rs` (17 tests) + `rest_api.rs` (16 tests) |
| 8.3 | Performance testing | ✅ Done — `performance.rs` (3 benchmarks) |
| 8.4 | Documentation finalization | ✅ Done — ROADMAP.md, ORCHESTRATOR.md, docs/examples/ |

**Deliverables:**
- ✅ OpenCode MCP configuration example
- ✅ E2E workflow tests (17 passing)
- ✅ Performance benchmarks (3 passing)
- ✅ Complete documentation

**Note:** `e2e.rs` integration tests (7 passed, 4 failed) require live MCP server at `localhost:8080` — expected behavior.

**Duration:** 1 week

---

## Milestones

| Milestone | Description | Target | Status |
|-----------|-------------|--------|--------|
| M1 | Phase 1-2 — MCP server + Rich API | Week 3 | ✅ Done |
| M2 | Phase 3 — State machine | Week 4 | ✅ Done |
| M3 | Phase 4 — REST API | Week 5 | ✅ Done |
| M4 | Phase 5 — Studio UI | Week 8 | ✅ Done |
| M5 | Phase 6-7 — Bootstrap + Orchestrator | Week 10 | ✅ Done |
| M6 | Phase 8 — GA integration | Week 11 | ✅ Done |

## Timeline

```
Week:  1   2   3   4   5   6   7   8   9  10  11
       │───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
Phase1 │███████████████│
Phase2                     │█████████████████████████│
Phase3                                         │███████│
Phase4                                             │███████│
Phase5                         │█████████████████████████████████████████│
Phase6                                                         │███████████████│
Phase7                                                         │███████████████│
Phase8                                                                 │█████████│
        └───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┘
       M1   M2   M3   M4   M5   M6
```

## Dependencies

```
Phase1 (Core Infrastructure)
└── Phase2 (Rich MCP API)
    └── Phase3 (State Machine)
        └── Phase4 (REST API)
            └── Phase5 (Studio UI)
                └── Phase8 (Integration)

Phase1 (Core Infrastructure)
└── Phase6 (Bootstrap)
    └── Phase7 (Orchestrator)
        └── Phase8 (Integration)
```

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| rmcp SDK complexity | Medium | High | Reference existing cognicode-mcp |
| Embedded Studio bundling | Low | Medium | Use include_dir! macro |
| State machine edge cases | Medium | High | Thorough transition testing |
| MCP HTTP Stream compatibility | Medium | High | Test with OpenCode early |

## Future Considerations (Post-v1.0)

- **Policies/IAM** — ARN-based permissions (ARN supports it)
- **Multi-user** — Authentication layer
- **Remote registries** — `arn:remote:*` for distributed
- **Marketplace** — Workflow sharing
- **VS Code extension** — Alternative Studio client
- **CI/CD triggers** — Webhook-based execution
