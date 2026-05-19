# Agentic Workflow System — Architecture

**Version:** 2.0.0  
**Date:** 2025-05-17  
**Status:** Design Complete

---

## Overview

Federated agentic workflow system with centralized MCP backend, portable skills following mattpocock format, visual Studio for workflow building and monitoring, and multi-workspace support.

**Target:** OpenCode, Claude Code, Codex, and future AI coding tools as clients.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  agents-workflows (SINGLE BINARY)                                    │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Axum Server (:8080)                                            │ │
│  │                                                                  │ │
│  │  ├── GET  /studio/*    → React (embedded static assets)         │ │
│  │  ├── POST /api/*       → REST API (Studio CRUD)                 │ │
│  │  ├── POST /mcp/*      → MCP HTTP Stream (JSON-RPC)             │ │
│  │  └── GET  /metrics/sse → SSE streaming                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ~/.workflows/                                                       │
│  ├── global/                                                        │
│  │   ├── registry.db          ← UN SQLite, source of truth          │
│  │   ├── skills/              ← arn:local:global:skill/*           │
│  │   ├── agents/             ← arn:local:global:agent/*           │
│  │   ├── prompts/            ← arn:local:global:prompt/*          │
│  │   └── workflows/          ← arn:local:global:workflow/*        │
│  │                                                                  │
│  └── workspaces/                                                    │
│      └── {workspace-id}/                                            │
│          └── artifacts/       ← arn:local:workspace/{id}:artifact/* │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Single Binary** — Everything in one executable, easy deployment
2. **Single Global Registry** — One SQLite database, segmented by ARN namespace
3. **MCP as State Keeper** — Server-side execution state machine
4. **Studio as Full UI** — Same functionality as MCP + create/edit capabilities
5. **Rich MCP API** — Many tools for orchestration, not just execute

---

## ARN Reference System

### Format

Inspired by AWS ARN pattern:

```
arn:local:{scope}:{type}/{name}
```

### Components

| Component | Description | Allowed Values |
|-----------|-------------|----------------|
| `arn:` | ARN prefix | Fixed prefix |
| `local` | Local registry | Fixed (extensible to remote registries) |
| `scope` | Resource scope | `global`, `workspace/{id}` |
| `type` | Resource type | `workflow`, `agent`, `skill`, `prompt`, `tool`, `artifact`, `execution` |
| `name` | Resource name | kebab-case, max 64 chars |

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

### Scope Semantics

- **`global`** — Shared across all workspaces. Skills, agents, prompts, and default workflows.
- **`workspace/{id}`** — Isolated to a specific workspace. Artifacts and executions.

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

Manages workflow definitions, DAG structure, stage orchestration, and execution state machine.

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

## Deployment Modes

### Production Mode (Default)

```bash
agents-workflows-server start --workspace ~/.workflows
```

- Studio served from embedded assets (via `include_dir!`)
- MCP available at `/mcp`
- REST API at `/api`
- SSE metrics at `/metrics/sse`

### Development Mode

```bash
agents-workflows-server start --workspace ~/.workflows --dev
```

- Proxies `/studio/*` to Vite dev server at `:5173`
- Hot reload for Studio React code
- Useful for Studio development

### Init Command (Bootstrap)

```bash
agents-workflows-server init [--template git:https://github.com/user/template]
```

- Creates `~/.workflows/global/` with default resources (idempotent)
- Can load templates from git repositories
- Generates configuration files for IDEs

---

## Project Structure

```
agents-workflows/
├── Cargo.toml                    # Workspace root
├── package.json                  # Studio dependencies
├── SPEC.md                       # This specification
│
├── docs/
│   ├── adr/                     # Architecture Decision Records
│   ├── ARCHITECTURE.md          # This file
│   ├── MCP-API.md               # MCP tool definitions
│   └── ORCHESTRATOR.md          # Orchestrator agent design
│
├── crates/                       # Rust workspace
│   ├── registry/
│   ├── workflow/
│   ├── artifact/
│   ├── metrics/
│   ├── insights/
│   └── mcp-server/
│
└── studio/                       # React web application (source)
    ├── src/
    │   ├── components/
    │   ├── hooks/
    │   ├── stores/
    │   └── types/
    └── dist/                     # Built assets (embedded in binary)
```

---

## Key Decisions Summary

| Aspect | Decision |
|--------|----------|
| Deployment | Single binary, embedded Studio |
| Registry | Single SQLite, segmented by ARN namespace |
| ARN Format | `arn:local:{scope}:{type}/{name}` |
| MCP Role | Server-side state machine, rich orchestration API |
| Studio | Served from binary, full create/edit capabilities |
| Artifacts | Hybrid storage (SQLite <1MB, FS ≥1MB) |
| Skills | mattpocock SKILL.md format |
| Metrics | SSE streaming |
| Bootstrap | Idempotent init with optional git templates |
