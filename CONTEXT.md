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
│  │  ├── /studio/*   → React UI (Monaco editors per resource type) │ │
│  │  ├── /api/*     → REST API (file read/write + SQLite index)    │ │
│  │  ├── /schemas/* → JSON Schema endpoint (schemars-generated)    │ │
│  │  ├── /mcp/*    → MCP HTTP Stream (IDE integration)             │ │
│  │  └── /metrics/sse → SSE (real-time metrics)                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  AppState (Context Decomposition)                               │ │
│  │  ├── RegistryContext → node_service, db, workspace_repository   │ │
│  │  ├── ExecutionContext → execution_store, artifact_service        │ │
│  │  ├── InsightsContext → insights_repository, analytics_service  │ │
│  │  └── MetricsContext → alert_repository                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ~/.workflows/                                                       │
│  ├── global/                    # Shared across all workspaces       │
│  │   ├── registry.db            # SQLite CACHE (files = truth)      │
│  │   ├── agents/*.yaml          # arn:local:global:agent/*          │
│  │   ├── skills/*/SKILL.md      # arn:local:global:skill/*         │
│  │   ├── prompts/*.md           # arn:local:global:prompt/*         │
│  │   ├── templates/*.md|json    # arn:local:global:template/*       │
│  │   ├── tools/*.yaml           # arn:local:global:tool/*           │
│  │   └── workflows/*.yaml       # arn:local:global:workflow/*      │
│  │                                                                  │
│  └── workspaces/               # All resource types supported       │
│      └── {workspace-id}/                                            │
│          ├── registry.db       # Workspace-scoped SQLite cache      │
│          ├── agents/           # Workspace-local agents/overrides   │
│          ├── skills/           # Workspace-local skills             │
│          ├── prompts/          # Workspace-local prompts            │
│          ├── templates/        # Workspace-local templates          │
│          ├── tools/            # Workspace-local tools              │
│          ├── workflows/        # Workspace-local workflows          │
│          └── artifacts/        # arn:local:workspace/{id}:artifact/*│
└─────────────────────────────────────────────────────────────────────┘
```

## Bounded Contexts

1. **Registry** — Graph of nodes (workflows, agents, skills, prompts, tools) and edges
2. **Workflow** — Workflow definitions (spec), stages, execution state (status), navigation
3. **Artifact** — Hybrid storage (SQLite <1MB, filesystem ≥1MB); defines `ArtifactRepository` trait for artifact metadata persistence
4. **Metrics** — SSE streaming for execution monitoring; defines `AlertRepository` trait for system monitoring notifications (alerts). Alerts are placed in this bounded context because they are monitoring/observability notifications, not core domain entities. The `AlertRepository` trait lives in `crates/metrics/src/domain/` with its implementation (`AlertStore`) in `crates/mcp-server/`.
5. **Insights** — Structured logging for workflow behavior analysis; defines `InsightsRepository` trait

## Key Paths

| Path | Description |
|------|-------------|
| `crates/registry/` | Registry bounded context |
| `crates/registry/src/domain/workspace_repository.rs` | `WorkspaceRepository` trait |
| `crates/workflow/` | Workflow BC: definitions, execution state, navigation |
| `crates/artifact/` | Artifact bounded context |
| `crates/artifact/src/domain/artifact_repository.rs` | `ArtifactRepository` trait |
| `crates/metrics/` | Metrics bounded context |
| `crates/metrics/src/domain/alert_repository.rs` | `AlertRepository` trait |
| `crates/insights/` | Insights bounded context |
| `crates/insights/src/domain/insights_repository.rs` | `InsightsRepository` trait |
| `crates/mcp-server/` | MCP protocol handler, REST API, adapters |
| `crates/mcp-server/src/types/` | MCP DTO types (`workflow_dto.rs`, `execution.rs`, `agent.rs`, `skill.rs`, `prompt.rs`, `artifact.rs`, `insight.rs`, `metrics.rs`, `impact.rs`) |
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
| `crates/mcp-server/src/state.rs` | AppState with context decomposition (`RegistryContext`, `ExecutionContext`, `InsightsContext`, `MetricsContext`) — raw-SQL-free |

### AppState Context Decomposition

```rust
pub struct AppState {
    pub registry: Arc<RegistryContext>,    // node_service, db, workspace_repository
    pub execution: Arc<ExecutionContext>, // execution_store, artifact_service, artifact_repository
    pub insights: Arc<InsightsContext>,   // insights_repository, analytics_service
    pub metrics: Arc<MetricsContext>,     // alert_repository
    pub workspace_root: PathBuf,
    pub started_at: Instant,
}
```

### What was removed

- `Dag`, `DagStage`, `StageCondition` — removed from domain. The `Workflow` struct is the single source of structural truth.
- `ExecutionState::get_next_stage(&Dag)` — replaced by `WorkflowNavigator::find_next_stage`.
- `StateMachineService` — deleted entirely. Production code uses `ExecutionApplicationService` + `WorkflowNavigator`.
- `execution_repository::mappers` module — deleted (dead code: `PersistedExecution`, `PersistedTriggerInfo`, `PersistedStageOutput` were never used outside tests).
- `mcp-server::types::Dag` — **kept** as API view model for `workflow_get_dag` responses (nodes, edges, parallel_groups).

### What was added this session

#### Phase 1: New Repository Traits
- `WorkspaceRepository` trait in `crates/registry/src/domain/workspace_repository.rs` — implemented by `WorkspaceStore` in mcp-server
- `InsightsRepository` trait in `crates/insights/src/domain/insights_repository.rs` — implemented by `InsightsStore` in mcp-server
- `AlertRepository` trait in `crates/metrics/src/domain/alert_repository.rs` — implemented by `AlertStore` in mcp-server
- `ArtifactRepository` trait in `crates/artifact/src/domain/artifact_repository.rs` — implemented by `ArtifactStore` in mcp-server

#### Phase 2: Type Reorganization
- All MCP types now organized in `crates/mcp-server/src/types/`: `workflow_dto.rs`, `execution.rs`, `agent.rs`, `skill.rs`, `prompt.rs`, `artifact.rs`, `insight.rs`, `metrics.rs`, `impact.rs`
- DTO naming convention: domain types stay in domain crates, MCP/presentation types use `*Dto` suffix (`WorkflowDto`, `ExecutionStateDto`, `StageOutputDto`, `TriggerInfoDto`)

#### Phase 3: AppState Context Decomposition
- `AppState` decomposed into `RegistryContext`, `ExecutionContext`, `InsightsContext`, `MetricsContext`
- Each context holds its own repositories and services

#### Bug Fixes & Improvements
- `insights_handler.rs` now uses injected `analytics_service` from `state.insights.analytics_service` instead of creating local instance

#### Dead Code Removed
- `sse_emitter` — was dead in AppState (SSE via MetricsBroadcaster externally)
- `metrics_aggregator` — was dead in AppState (never used)

#### Prior Session
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
12. **Agent data model aligns with opencode AgentConfig** — Agent YAML is a superset of opencode's `AgentConfig` schema; fields: `model` (provider/model format), `prompt` (ARN reference, not file path), `temperature`, `top_p`, `steps`, `mode`, `hidden`, `color`, `permission` (granular with glob patterns), `tools` (Record<string,boolean>), `options`, `variant`; extensions: `arn`, `scope`, `skills` (ARN references) — ADR-0010
13. **ARN references for all cross-resource dependencies** — Agents reference prompts via ARN (`arn:local:global:prompt/name`), not via `{file:...}` syntax; `{file:...}` only for resources that manage file content directly — ADR-0015
14. **File-referenced content model** — Large text content (skills, prompts, templates) lives in separate files referenced by `content_path`, not inline in YAML; variables inferred from `{{variable}}` patterns in content, never manually declared — ADR-0011, ADR-0012, ADR-0013
15. **Skill declares required_tools** — Skills list tool names they need; agents binding a skill must auto-merge those tools into their `tools` map — ADR-0011
16. **Templates are native-format files** — A template for markdown IS a markdown file, for JSON IS a JSON file; no meta-descriptions of format — ADR-0013
17. **Prompt-as-function** — Prompts have typed inputs (inferred from content) and optional output format via Template ARN reference; classification by `kind`: system, user, template — ADR-0012
18. **Tools dual-source model** — Tools come from MCP servers (catalog), built-in opencode tools, or custom implementations; all registered with ARN, input_schema, category, tags — ADR-0014
19. **Registry edges reflect ARN references** — On save, edges are created for every ARN reference (uses, references, requires); on delete, edges are cleaned; orphan detection available — ADR-0015
20. **Files as source of truth, SQLite as cache** — Filesystem YAML/MD files are the source of truth; SQLite databases are caches/indices rebuilt from files; follows Kubernetes pattern (YAML → etcd cache) — ADR-0006
21. **Workspace scope supports ALL resource types** — Workspaces can contain agents, skills, prompts, tools, templates, workflows (not just artifacts/executions); each workspace has its own `registry.db` and directory tree; application accesses both global and active workspace — ADR-0006
22. **Professional Monaco editors per resource type** — Studio uses Monaco Editor (not HTML forms) as the primary editing experience; each resource type has a dedicated editor matching its native format: YAML editor (agents, tools, workflows), Markdown editor with YAML frontmatter (skills, prompts), format-adaptive editor (templates) — like Lens, OpenShift, GitHub Actions
23. **Schema validation via monaco-yaml + schemars** — Rust domain types generate JSON Schema via `schemars`; schemas served via REST endpoint (`/schemas/{resource_type}`); Monaco uses `monaco-yaml` (backed by `yaml-language-server`) for validation, autocomplete, hover docs; frontmatter validation for markdown resources
24. **One workspace per project (current), multi-workspace (future)** — Current: each project has one workspace; future: projects may have multiple workspaces; application resolves global + active workspace resources
25. **4-layer validation pipeline** — Client-side (Monaco + monaco-yaml), Schema validation (Rust serde + schemars), Cross-reference linter (ARN resolution), Semantic linters (domain rules) — ADR-0016
26. **Generic content endpoint** — `GET/PUT /api/content/:arn` serves raw file content for all resource types; `POST /api/validate/:arn` returns structured diagnostics — ADR-0016
27. **Schema pipeline from Rust types** — `#[derive(JsonSchema)]` on domain structs generates JSON Schema; served via `GET /api/schemas/:type`; consumed by `monaco-yaml` for autocomplete and validation; schemas never desync from code — ADR-0016
28. **Frontmatter split for MD resources** — Skill, Prompt, Template use two coordinated Monaco instances (YAML header + Markdown body) that visually appear as one panel — ADR-0016
29. **Workflow dual editor** — React Flow visual DAG + Monaco YAML code editor with bidirectional sync, like GitHub Actions — ADR-0016

## Flagged Ambiguities

- "project" vs "workspace" — resolved: project is the top-level Studio container; workspace is the scoped isolation unit inside a project
- "workflow" ownership — resolved: workflow definitions belong at project/global level; runs, overrides, artifacts, metrics, and execution state belong to a workspace
- "override" vs "copy" — resolved: an override is an explicit scoped copy with origin tracking, but it should not exist if it has no scope-specific changes
- "artifact" vs "output" — resolved: artifact is the stored entity, output is the stage result
- "run" vs "execute" — resolved: only agents decide which workflows to run and execute stages; Studio visualizes information maintained through MCP and Insights
- "execution" — resolved: use **Agent Execution** for executions reported by agents; avoid wording that implies Studio starts them
- "SQLite as source of truth" — **OVERTURNED**: files are now the source of truth; SQLite is a cache/index; follows Kubernetes pattern — ADR-0006 updated
- "workspace = only artifacts/executions" — **OVERTURNED**: workspace scope now supports ALL resource types (agents, skills, prompts, tools, templates, workflows); workspace overrides of global resources are supported — ADR-0006 updated
- "form-based editors" — **OVERTURNED**: Studio uses Monaco Editor with dedicated editors per resource type, not HTML forms; YAML for agents/tools/workflows, Markdown+frontmatter for skills/prompts, format-adaptive for templates
