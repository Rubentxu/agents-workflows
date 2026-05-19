# CONTEXT.md — Agentic Workflow System

## Domain Terms

| Term | Definition |
|------|------------|
| **Agent Execution** | Execution reported by an agent while using workflows and agentic resources through MCP |
| **ARN** | Agent Resource Name — identifier format inspired by AWS ARN (`arn:local:{scope}:{type}/{name}`) |
| **Bounded Context** | DDD concept — a subsystem with its own domain model |
| **DAG** | Directed Acyclic Graph — workflow dependency structure |
| **Execution State** | Server-side state machine tracking workflow execution progress |
| **Insight** | Structured event log for workflow behavior analysis |
| **MCP** | Model Context Protocol — standard for AI tool communication |
| **Orchestrator Agent** | IDE agent that discovers and uses agentic resources through MCP and reports execution data |
| **Profile** | Mode of using Studio, such as builder, runner, operator, or admin |
| **Project** | Top-level Studio container that groups related workspaces |
| **Resource Override** | Scoped copy of an inherited ARN resource that changes behavior for a project or workspace |
| **Scope** | ARN component: `global`, `project/{id}`, or `workspace/{id}` |
| **SDD** | Spec-Driven Development — gentle-ai methodology |
| **Stage** | Single unit of work in a workflow execution |
| **Studio** | React UI served from binary for creating, editing, deleting, maintaining, and visualizing agentic resources |
| **Workflow** | DAG of stages with conditions and execution configuration |

## Language

**ARN Format:**
```
arn:local:{scope}:{type}/{name}
```
- `scope`: `global`, `project/{id}`, or `workspace/{id}`
- `type`: workflow, agent, skill, prompt, tool, artifact, execution
- Examples: `arn:local:global:agent/orchestrator`, `arn:local:project/app:workflow/sdd-full`, `arn:local:workspace/abc123:artifact/report`

**Agent Execution**:
An execution reported by an agent while using workflows and agentic resources through MCP; Studio visualizes it but does not start it.

**Project**:
A top-level Studio container representing an initiative, product, repository, or logical installation. A project groups one or more workspaces.

**Workspace**:
A scoped environment within a project. Artifacts and executions are workspace-isolated. Skills, agents, prompts, and workflows are global (shared).

**Project Workflow**:
A reusable workflow definition available to the project and its workspaces.

**Resource Override**:
A project- or workspace-scoped copy of an inherited resource that keeps a reference to its origin and exists only when it introduces scope-specific changes.

**Workspace Workflow Run**:
A workspace-specific execution of a workflow with its own inputs, overrides, artifacts, metrics, and state.

**Orchestrator Agent**:
The agent deployed to an IDE that queries MCP, discovers available workflows and resources, decides which workflows to use, coordinates workflow execution, and reports state, insights, artifacts, and metrics back through MCP.

**Profile**:
A mode of interacting with **Studio**, not necessarily a separate user account or role.

**Insight**:
A structured log event capturing inputs, outputs, and metadata for each stage of workflow execution. Used for behavioral analysis and debugging.

## Relationships

- An **Orchestrator Agent** queries the **MCP** for available **Workflows**
- An **Orchestrator Agent** decides which **Workflow** to run; **Studio** does not launch workflows
- An **Agent Execution** is reported by an agent and visualized by **Studio**
- **Studio** creates, edits, and deletes workflow, agent, skill, prompt, tool, and related resource definitions
- **MCP** exposes resources for agents to discover and use, but agents do not mutate resource definitions through MCP
- A **Project** contains one or more **Workspaces**
- A **Project Workflow** can be run in one or more **Workspaces**
- A **Resource Override** derives from an inherited ARN resource and replaces it only in the more specific scope
- A **Workflow** contains multiple **Stages** organized as a **DAG**
- A **Stage** is executed by an **Agent** using the workflow definition and its resolved resources
- **Insights** are logged for each stage completion to the **MCP**
- **Artifacts** produced by stages are stored and can be queried
- **Studio** maintains and visualizes resource definitions, execution state, insights, artifacts, and metrics
- A **Profile** determines which **Studio** workflows are prominent: building, running, operating, or administering.
- **MCP** provides programmatic access (for IDEs) via **HTTP Stream**

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  agents-workflows (SINGLE BINARY)                                    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Axum Server                                                    │ │
│  │  ├── /studio/*   → React UI (embedded)                          │ │
│  │  ├── /api/*     → REST API (Studio CRUD)                       │ │
│  │  ├── /mcp/*    → MCP HTTP Stream (IDE integration)             │ │
│  │  └── /metrics/sse → SSE (real-time metrics)                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ~/.workflows/                                                       │
│  ├── global/                    # Shared resources                   │
│  │   ├── registry.db            # SQLite, source of truth            │
│  │   ├── workflows/            # arn:local:global:workflow/*        │
│  │   ├── agents/              # arn:local:global:agent/*          │
│  │   ├── skills/              # arn:local:global:skill/*          │
│  │   └── prompts/             # arn:local:global:prompt/*          │
│  │                                                                  │
│  └── workspaces/              # Isolated resources                   │
│      └── {workspace-id}/                                            │
│          └── artifacts/       # arn:local:workspace/{id}:artifact/* │
└─────────────────────────────────────────────────────────────────────┘
```

## Bounded Contexts

1. **Registry** — Graph of nodes (workflows, agents, skills, prompts, tools) and edges
2. **Workflow** — Workflow definitions (spec), stages, execution state (status), navigation
3. **Artifact** — Hybrid storage (SQLite <1MB, filesystem ≥1MB)
4. **Metrics** — SSE streaming for execution monitoring
5. **Insights** — Structured logging for workflow behavior analysis

## Key Paths

| Path | Description |
|------|-------------|
| `crates/registry/` | Registry bounded context |
| `crates/workflow/` | Workflow BC: definitions, execution state, navigation |
| `crates/artifact/` | Artifact bounded context |
| `crates/metrics/` | Metrics bounded context |
| `crates/insights/` | Insights bounded context |
| `crates/mcp-server/` | MCP protocol handler, REST API, adapters |
| `studio/` | React web application (embedded in binary) |
| `docs/` | Architecture Decision Records and specifications |

## DDD Execution Model

The execution layer follows a **spec-vs-status** pattern (analogous to Kubernetes):

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| Domain (definition) | `Workflow` + `Stage` | What the workflow declares (stages, deps, conditions) |
| Domain (runtime) | `ExecutionState` + `ExecutionStatus` | What is happening right now (status, completed stages) |
| Domain service | `WorkflowNavigator` | Structural navigation on `Workflow` + `ExecutionState` |
| Application service | `ExecutionApplicationService` | Orchestrates create/start/complete/abort/list |
| Port | `ExecutionRepository` | Persistence interface for `ExecutionState` |
| Adapter | `ExecutionRepositoryAdapter` | Bridges domain port to `ExecutionStore` (SQLite) |
| Storage DTO | `PersistedExecution` | Flat persistence model in `ExecutionStore` |

### Key files

| File | Role |
|------|------|
| `crates/workflow/src/domain/workflow.rs` | `Workflow` definition aggregate |
| `crates/workflow/src/domain/execution_state.rs` | `ExecutionState` runtime aggregate |
| `crates/workflow/src/domain/execution_repository.rs` | Repository port (mappers module removed — dead code) |
| `crates/workflow/src/application/workflow_navigator.rs` | Navigation domain service |
| `crates/workflow/src/application/execution_service.rs` | Application use cases |
| `crates/workflow/src/application/parser.rs` | Shared YAML parser (`parse_registry_workflow_yaml`) |
| `crates/mcp-server/src/execution_store.rs` | Execution SQLite persistence |
| `crates/mcp-server/src/artifact_store.rs` | Artifact metadata SQLite persistence |
| `crates/mcp-server/src/execution_repository_adapter.rs` | Port adapter |
| `crates/mcp-server/src/workflow_handler.rs` | MCP handler (uses app service + domain parser) |
| `crates/mcp-server/src/rest_handlers.rs` | REST API handlers (1173 lines, 8 raw SQL remaining) |
| `crates/mcp-server/src/studio.rs` | Embedded Studio serving (`include_dir!` feature) + filesystem fallback |
| `crates/mcp-server/src/state.rs` | AppState adapter container (raw-SQL-free) |

### What was removed

- `Dag`, `DagStage`, `StageCondition` — removed from domain. The `Workflow` struct is the single source of structural truth.
- `ExecutionState::get_next_stage(&Dag)` — replaced by `WorkflowNavigator::find_next_stage`.
- `StateMachineService` — deleted entirely. Production code uses `ExecutionApplicationService` + `WorkflowNavigator`.
- `execution_repository::mappers` module — deleted (dead code: `PersistedExecution`, `PersistedTriggerInfo`, `PersistedStageOutput` were never used outside tests).
- `mcp-server::types::Dag` — **kept** as API view model for `workflow_get_dag` responses (nodes, edges, parallel_groups).

### What was added this session

- `ArtifactStore` — artifact metadata persistence seam (list/get/delete/download/get_location/get_storage_info)
- `ExecutionStore::pause()` / `resume()` — REST pause/resume no longer raw SQL
- REST `get_metrics` — now queries `ExecutionStore` for real data (was hardcoded stub)
- MCP `execution_history` — now queries `ExecutionStore.list()` (was fabricated data)
- `workflow_get` — now uses shared `parse_registry_workflow_yaml` (was inline YAML parsing)
- `update_agent`/`update_skill`/`update_prompt` — now use `serde_yaml::from_str` (was `serde_json::from_str` on YAML)

## Registry Format

```
arn:local:global:workflow/sdd-full
arn:local:global:agent/orchestrator
arn:local:global:skill/sdd-explore
arn:local:global:prompt/sdd-orchestrator
arn:local:project/app:workflow/sdd-full
arn:local:workspace/abc123:workflow/custom-ci
arn:local:workspace/abc123:artifact/execution-001/report
arn:local:workspace/abc123:execution/run-001
```

## Design Decisions

1. **Single Binary** — Everything served from one executable
2. **Embedded Studio** — React app bundled via `include_dir!`
3. **Single Global Registry** — One SQLite database, segmented by ARN
4. **Server-side State** — MCP maintains execution state (not client)
5. **Rich MCP API** — Many tools for full orchestration control
6. **Workflow-agnostic Orchestrator** — IDE agent queries MCP, not hardcoded phases
7. **DDD spec-vs-status model** — `Workflow` = definition (spec), `ExecutionState` = runtime (status), `WorkflowNavigator` = domain service, `ExecutionApplicationService` = use case orchestrator
8. **`Workflow` as single structural truth** — No parallel `Dag` model in domain; `mcp-server::types::Dag` is an API view model only
9. **Adapter pattern for persistence** — `ExecutionRepository` port in domain, `ExecutionRepositoryAdapter` bridges to `ExecutionStore`; `ArtifactStore` encapsulates artifact SQL; AppState is raw-SQL-free
10. **Shared YAML parser** — `parse_registry_workflow_yaml` in domain layer used by both MCP and REST handlers; no inline YAML parsing in handlers
11. **Storage seams eliminate raw SQL** — REST handlers for execution and artifact go through `ExecutionStore`/`ArtifactStore`, not raw SQL; 8 raw SQL remain (workspace CRUD 4, insights 1, alerts 3) — these use `state.db()` directly

## Flagged Ambiguities

- "project" vs "workspace" — resolved: project is the top-level Studio container; workspace is the scoped isolation unit inside a project
- "workflow" ownership — resolved: workflow definitions belong at project/global level; runs, overrides, artifacts, metrics, and execution state belong to a workspace
- "override" vs "copy" — resolved: an override is an explicit scoped copy with origin tracking, but it should not exist if it has no scope-specific changes
- "artifact" vs "output" — resolved: artifact is the stored entity, output is the stage result
- "run" vs "execute" — resolved: only agents decide which workflows to run and execute stages; Studio visualizes information maintained through MCP and Insights
- "execution" — resolved: use **Agent Execution** for executions reported by agents; avoid wording that implies Studio starts them
