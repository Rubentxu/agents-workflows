# Agentic Workflow System — Specification

## Overview

Federated agentic workflow system with centralized MCP backend, portable skills following mattpocock format, visual Studio for workflow building and monitoring, and multi-workspace support.

**Target:** OpenCode, Claude Code, Codex, and future AI coding tools as clients.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        agents-workflows                                      │
│                        (SINGLE BINARY)                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Axum Server (:8080)                                                  │   │
│  │                                                                       │   │
│  │  ├── GET  /studio/*    → React (embedded static assets)               │   │
│  │  ├── POST /api/*       → REST API (Studio CRUD)                     │   │
│  │  ├── POST /mcp/*      → MCP HTTP Stream (JSON-RPC)                  │   │
│  │  └── GET  /metrics/sse → SSE streaming                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ~/.workflows/                                                              │
│  ├── global/                       # Shared resources                       │
│  │   ├── registry.db              # SQLite, source of truth               │
│  │   ├── workflows/               # arn:local:global:workflow/*           │
│  │   ├── agents/                  # arn:local:global:agent/*            │
│  │   ├── skills/                  # arn:local:global:skill/*            │
│  │   └── prompts/                 # arn:local:global:prompt/*            │
│  │                                                                           │
│  └── workspaces/                     # Workspace-isolated resources          │
│      └── {workspace-id}/                                                    │
│          └── artifacts/            # arn:local:workspace/{id}:artifact/*   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Deployment Modes

| Mode | Command | Description |
|------|---------|-------------|
| Production | `agents-workflows-server start --workspace ~/.workflows` | Studio embedded, all features |
| Development | `agents-workflows-server start --dev` | Proxies Studio to Vite :5173 |
| Init | `agents-workflows-server init [--template git:...]` | Bootstrap resources |

---

## DDD Bounded Contexts

### 1. Registry Context

Manages the graph of nodes (workflows, agents, skills, prompts, tools) and edges (relationships).

**Domain Entities:**
- `Node` — Any resource with ARN identification
- `Edge` — Relationship between nodes (uses, depends_on, produces, consumes, references)
- `Arn` — Value object for ARN parsing and formatting

**Application Services:**
- `NodeService` — CRUD operations for nodes
- `EdgeService` — Relationship management
- `RegistryScanner` — Discovers resources from filesystem

### 2. Workflow Context

Manages workflow definitions, DAG structure, and execution state machine.

**Domain Entities:**
- `Workflow` — Top-level definition with stages
- `Stage` — Single unit of work
- `ExecutionConfig` — How to run the workflow
- `ExecutionState` — Server-side state machine state

**Application Services:**
- `WorkflowService` — Validation, topological sort, parallelization
- `StateMachineService` — Execution state transitions
- `YAML Parser` — Parse workflow YAML into domain objects

### 3. Artifact Context

Manages artifact storage with hybrid approach (<1MB in SQLite, ≥1MB in filesystem).

**Domain Entities:**
- `Artifact` — Stored output with content and metadata
- `StorageType` — Sqlite or Filesystem

**Application Services:**
- `ArtifactService` — Store, retrieve, verify, delete
- `StorageStrategy` — Size-based storage decision

### 4. Metrics Context

Manages metrics collection and SSE streaming for execution monitoring.

**Domain Entities:**
- `MetricEvent` — Single event with timestamp and data
- `MetricData` — Metrics payload (tokens, duration, progress, etc.)
- `ExecutionMetrics` — Aggregated execution summary

**Application Services:**
- `SseEmitter` — SSE streaming to subscribers
- `MetricsAggregator` — Aggregate events into summaries

### 5. Insights Context

Manages structured logs for workflow behavior analysis.

**Domain Entities:**
- `Insight` — Structured event with execution context
- `InsightType` — Category of insight (workflow, stage, agent, metrics)

**Application Services:**
- `InsightsService` — Log and query insights
- `AnalyticsService` — Aggregate insights for analysis

---

## Project Structure

```
agents-workflows/
├── Cargo.toml                    # Workspace root
├── package.json                  # Studio dependencies
├── SPEC.md                      # This specification
│
├── docs/
│   ├── adr/                     # Architecture Decision Records
│   │   ├── README.md
│   │   ├── 0001-skill-format-mattpocock.md
│   │   ├── 0002-arn-reference-system.md
│   │   ├── 0003-graph-tables-schema.md
│   │   ├── 0004-eager-arn-resolution.md
│   │   ├── 0005-hybrid-artifact-storage.md
│   │   ├── 0006-multi-workspace-arn.md
│   │   ├── 0007-server-side-state-machine.md
│   │   └── 0008-rich-mcp-api.md
│   ├── ARCHITECTURE.md           # Architecture overview
│   ├── MCP-API.md                # MCP tool definitions
│   ├── REST-API.md               # REST API reference
│   ├── ORCHESTRATOR.md           # Orchestrator agent design
│   ├── PRD.md                   # Product Requirements Document
│   └── ROADMAP.md               # Implementation roadmap
│
├── studio/                       # React web application (source)
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── stores/
│   │   └── types/
│   └── dist/                     # Built assets (embedded in binary)
│
├── crates/                       # Rust workspace
│   ├── registry/
│   │   ├── domain/             # Node, Edge, Arn entities
│   │   ├── application/        # NodeService, EdgeService, Scanner
│   │   └── infrastructure/     # SQLite repositories
│   │
│   ├── workflow/
│   │   ├── domain/             # Workflow, Stage, ExecutionState
│   │   ├── application/        # WorkflowService, StateMachine, Parser
│   │   └── infrastructure/
│   │
│   ├── artifact/
│   │   ├── domain/             # Artifact, StorageType
│   │   ├── application/        # ArtifactService, StorageStrategy
│   │   └── infrastructure/
│   │
│   ├── metrics/
│   │   ├── domain/             # MetricEvent, ExecutionMetrics
│   │   ├── application/        # SseEmitter, MetricsAggregator
│   │   └── infrastructure/
│   │
│   ├── insights/
│   │   ├── domain/             # Insight, InsightType
│   │   ├── application/        # InsightsService, AnalyticsService
│   │   └── infrastructure/
│   │
│   └── mcp-server/
│       ├── main.rs
│       └── handler.rs
│
└── ~/.workflows/                # Runtime data (at runtime)
    ├── global/
    │   ├── registry.db
    │   ├── workflows/
    │   ├── agents/
    │   ├── skills/
    │   └── prompts/
    └── workspaces/
        └── {workspace-id}/
            └── artifacts/
```

---

## ARN Reference System

### Format

```
arn:local:{scope}:{type}/{name}
```

### Components

| Component | Description | Allowed Values |
|-----------|-------------|----------------|
| `arn:` | ARN prefix | Fixed prefix |
| `local` | Registry type | Fixed |
| `scope` | Resource scope | `global`, `workspace/{id}` |
| `type` | Resource type | workflow, agent, skill, prompt, tool, artifact, execution |
| `name` | Resource name | kebab-case, max 64 chars |

### Scope Semantics

| Scope | Resources | Visibility |
|-------|-----------|------------|
| `global` | skills, agents, prompts, workflows | All workspaces share |
| `workspace/{id}` | artifacts, executions, custom workflows | Workspace-isolated |

### Examples

```yaml
# Global resources
arn:local:global:workflow/sdd-full
arn:local:global:skill/sdd-explore
arn:local:global:agent/orchestrator
arn:local:global:prompt/sdd-orchestrator

# Workspace-scoped resources
arn:local:workspace/abc123:workflow/custom-ci
arn:local:workspace/abc123:artifact/execution-456/spec
arn:local:workspace/abc123:execution/run-001
```

---

## Database Schema

### Nodes Table

```sql
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,           -- ARN
    type TEXT NOT NULL,           -- workflow|agent|skill|prompt|tool
    name TEXT NOT NULL,
    scope TEXT NOT NULL,          -- global|workspace/{id}
    path TEXT,                    -- Path to source file
    checksum TEXT,               -- SHA256 of source
    config_json TEXT,             -- Resolved configuration
    metadata_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Edges Table

```sql
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT NOT NULL REFERENCES nodes(id),
    to_id TEXT NOT NULL REFERENCES nodes(id),
    relationship_type TEXT NOT NULL,  -- uses|depends_on|produces|consumes|references
    metadata_json TEXT,
    UNIQUE(from_id, to_id, relationship_type)
);
```

### Executions Table

```sql
CREATE TABLE executions (
    id TEXT PRIMARY KEY,           -- ARN
    workflow_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    current_stage TEXT,
    completed_stages_json TEXT,
    stage_outputs_json TEXT,
    execution_context_json TEXT,
    triggered_by_json TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Artifacts Table

```sql
CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,           -- ARN
    execution_id TEXT REFERENCES executions(id),
    stage_id TEXT,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    storage_type TEXT NOT NULL,   -- sqlite|filesystem
    location TEXT NOT NULL,        -- path or JSON blob
    content_type TEXT,
    checksum TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Insights Table

```sql
CREATE TABLE insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT REFERENCES executions(id),
    stage_id TEXT,
    insight_type TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## Workflow YAML Format

```yaml
arn: arn:local:global:workflow/sdd-full
name: "SDD Full Pipeline"
version: "1.0"
description: "Spec-Driven Development complete workflow"

agents:
  explore:
    description: "Investigate codebase"
    model: glm-5.1
    skills:
      - skill:arn:local:global:skill/sdd-explore
    tools:
      - tool:arn:local:global:tool/cognicode

stages:
  explore:
    id: sdd-explore
    agent: explore
    depends_on: []
    input:
      goal: "{user_goal}"

  propose:
    id: sdd-propose
    agent: explore
    depends_on: ["sdd-explore"]
    input:
      exploration: { from: "sdd-explore" }

execution:
  mode: sequential
  onFailure: interactive
  default_workflow: true

metrics:
  streaming: true
  interval: 1000ms
```

---

## MCP Interface

### Transport

- **Protocol:** HTTP Stream (JSON-RPC over HTTP)
- **Endpoint:** `POST /mcp`
- **Content-Type:** `application/json`
- **Accept:** `application/json, text/event-stream`

### Resources

```
workflow:arn:local:global:workflow/*
agent:arn:local:global:agent/*
skill:arn:local:global:skill/*
prompt:arn:local:global:prompt/*
artifact:arn:local:workspace/{id}:artifact/*
execution:arn:local:workspace/{id}:execution/*
```

### Tools (Rich Orchestration API)

#### Workflow Tools
- `workflow_list` — List workflows with filters
- `workflow_get` — Get full workflow definition
- `workflow_get_dag` — Get DAG for visualization
- `workflow_execute` — Start execution
- `workflow_get_state` — Get current execution state
- `workflow_update_state` — Update state after stage
- `workflow_get_next_stage` — Get suggested next stage
- `workflow_abort` — Abort execution

#### Resource Tools
- `agent_list`, `agent_get`, `agent_query`
- `skill_list`, `skill_get`, `skill_query`
- `prompt_list`, `prompt_get`

#### Execution Tools
- `execution_list` — List executions with filters
- `execution_get` — Get execution details
- `execution_history` — Historical executions

#### Artifact Tools
- `artifact_create` — Create artifact
- `artifact_get` — Get artifact content
- `artifact_list` — List execution artifacts

#### Metrics & Insights Tools
- `metrics_query` — Query execution metrics
- `metrics_subscribe` — Subscribe to SSE stream
- `insights_log` — Log structured insight
- `insights_query` — Query insights

See [MCP-API.md](docs/MCP-API.md) for full reference.

---

## Orchestrator Agent

The orchestrator agent is deployed to IDEs (OpenCode, Claude Code, Codex) to coordinate workflow execution.

### Responsibilities
- Query MCP for available workflows, agents, skills
- Execute workflows via MCP tools
- Update state as stages complete
- Log insights for analysis
- Stream metrics to user
- Delegate to specialized agents

### Key Differences from OpenCode SDD Orchestrator

| Aspect | SDD Orchestrator | Workflow Orchestrator |
|--------|------------------|------------------------|
| Knowledge | Built-in SDD phases | Workflow-agnostic |
| State | Client-side | Server-side (MCP) |
| Discovery | Fixed phase order | Dynamic via DAG query |

See [ORCHESTRATOR.md](docs/ORCHESTRATOR.md) for full design.

---

## REST API (Studio)

The REST API provides **full CRUD operations** for resource management, used exclusively by Studio. Unlike the MCP API (which is read-oriented for orchestration), the REST API supports create, update, and delete operations.

### Workspaces
- `POST /api/workspaces` — Create workspace
- `GET /api/workspaces` — List workspaces
- `GET /api/workspaces/{id}` — Get workspace
- `DELETE /api/workspaces/{id}` — Delete workspace

### Workflows (CRUD)
- `POST /api/workflows` — Create workflow
- `GET /api/workflows` — List workflows
- `GET /api/workflows/{arn}` — Get workflow
- `PUT /api/workflows/{arn}` — Update workflow
- `DELETE /api/workflows/{arn}` — Delete workflow

### Agents (CRUD)
- `POST /api/agents` — Create agent
- `GET /api/agents` — List agents
- `GET /api/agents/{arn}` — Get agent
- `PUT /api/agents/{arn}` — Update agent
- `DELETE /api/agents/{arn}` — Delete agent

### Skills (CRUD)
- `POST /api/skills` — Create skill
- `GET /api/skills` — List skills
- `GET /api/skills/{arn}` — Get skill
- `PUT /api/skills/{arn}` — Update skill
- `DELETE /api/skills/{arn}` — Delete skill

### Prompts (CRUD)
- `POST /api/prompts` — Create prompt
- `GET /api/prompts` — List prompts
- `GET /api/prompts/{arn}` — Get prompt
- `PUT /api/prompts/{arn}` — Update prompt
- `DELETE /api/prompts/{arn}` — Delete prompt

### Executions (Control)
- `GET /api/executions/{arn}` — Get execution state
- `GET /api/executions` — List executions
- `POST /api/executions/{arn}/pause` — Pause execution
- `POST /api/executions/{arn}/resume` — Resume execution
- `POST /api/executions/{arn}/abort` — Abort execution

### Artifacts (Read/Delete)
- `GET /api/artifacts/{arn}` — Get artifact
- `GET /api/artifacts` — List artifacts
- `DELETE /api/artifacts/{arn}` — Delete artifact

### Insights (Read)
- `GET /api/insights` — Query insights with filters
- `GET /api/metrics` — Query metrics

### Server Configuration
- `GET /api/health` — Health check
- `GET /api/config` — Get configuration
- `PUT /api/config` — Update configuration

See [REST-API.md](docs/REST-API.md) for full reference including request/response schemas.

---

## Key Decisions Summary

| Aspect | Decision |
|--------|----------|
| Deployment | Single binary, embedded Studio |
| Registry | Single SQLite, segmented by ARN namespace |
| ARN Format | `arn:local:{scope}:{type}/{name}` |
| MCP Role | Server-side state machine, rich orchestration API |
| REST API Role | Full CRUD for resource administration |
| Studio | Served from binary, full create/edit capabilities |
| Artifact storage | Hybrid (SQLite <1MB, FS ≥1MB) |
| Skills | mattpocock SKILL.md format |
| Metrics | SSE streaming |
| Bootstrap | Idempotent init with optional git templates |
| State machine | Server-side execution state |
| Orchestrator | Workflow-agnostic, queries MCP |
