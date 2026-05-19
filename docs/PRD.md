# Product Requirements Document

## Agentic Workflow System

**Version:** 1.0.0
**Date:** 2025-05-17
**Status:** Planning

---

## 1. Overview

### 1.1 Purpose

Build a federated agentic workflow system that enables:
- **Portable skill definitions** across AI coding tools (OpenCode, Claude Code, Codex)
- **Visual workflow construction** with drag-and-drop DAG editor
- **Live execution monitoring** with real-time metrics streaming
- **Centralized MCP backend** that orchestrates all agents

### 1.2 Target Users

| User | Use Case |
|------|----------|
| **AI Coding Tool Users** | OpenCode, Claude Code, Codex orchestrators query workflows via MCP |
| **Workflow Designers** | Build workflows visually in Studio |
| **DevOps/Platform Engineers** | Configure agent pipelines, monitor executions |
| **Skill Developers** | Create portable skills following mattpocock format |

### 1.3 Problem Statement

Current agentic systems suffer from:
- **Fragmentation:** Skills and workflows are tool-specific
- **Black boxes:** No visibility into what agents are doing
- **No reuse:** Can't share workflows between Claude Code and OpenCode
- **Poor debugging:** Hard to understand why a workflow failed

---

## 2. User Stories

### 2.1 As an AI Orchestrator (OpenCode/Claude Code/Codex)

```
Given I need to implement a feature using SDD methodology
When I invoke /sdd-apply for feature-X
Then the orchestrator loads workflow:arn://local/sdd-full
And executes each stage with the configured agents
And I receive real-time metrics about progress
And all artifacts are persisted for later review
```

### 2.2 As a Workflow Designer

```
Given I want to create a custom CI/CD workflow
When I open Studio and drag "Build" stage onto canvas
And connect it to "Test" stage with depends_on edge
And configure the agent with sdd-apply skill
Then the workflow is saved as workflow:arn://local/my-ci
And I can execute it from any AI coding tool via MCP
```

### 2.3 As a Skill Developer

```
Given I want to create a new skill for PDF processing
When I write SKILL.md following mattpocock format
And add triggers for "pdf", "document", "extract"
Then the skill is auto-discovered by the skill registry
And becomes available to all agents via skill:arn://local/pdf-*
And can be used in any workflow
```

### 2.4 As a Debugger

```
Given a workflow execution failed at the "apply" stage
When I open Studio's Execution Dashboard
Then I see the full DAG with failed node highlighted
And I can click to see artifact outputs at each stage
And I see the error message and stack trace
And I can replay from the failed stage
```

---

## 3. Requirements

### 3.1 Core Features

| ID | Feature | Priority | Description |
|----|---------|----------|-------------|
| F-001 | MCP Server | P0 | Rust server with workflow execution engine |
| F-002 | ARN Registry | P0 | Graph-based resource registry |
| F-003 | Workflow YAML | P0 | Definition format for workflows |
| F-004 | Skill Discovery | P0 | Auto-discover skills from SKILL.md files |
| F-005 | Execution Engine | P0 | DAG executor with stage orchestration |
| F-006 | Artifact Storage | P1 | Hybrid SQLite/filesystem artifact persistence |
| F-007 | Metrics Streaming | P1 | SSE/WebSocket for live execution updates |
| F-008 | Studio UI | P1 | React app with workflow builder and dashboard |

### 3.2 Technical Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| T-001 | MCP Protocol | v1.4 via rmcp |
| T-002 | Database | SQLite with rusqlite |
| T-003 | Frontend | React 18+, React Flow, Jotai |
| T-004 | Backend | Rust with tokio async runtime |
| T-005 | Skill Format | Mattpocock SKILL.md |
| T-006 | Workflow Format | YAML with ARN references |

### 3.3 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| N-001 | Startup time | < 2s for MCP server startup |
| N-002 | Workflow load | < 500ms for eager resolution |
| N-003 | Metrics latency | < 100ms from stage completion to SSE event |
| N-004 | Concurrent executions | Support 10+ simultaneous workflow runs |
| N-005 | Artifact threshold | 1MB cutoff for SQLite storage |

---

## 4. User Interface

### 4.1 Studio Components

#### 4.1.1 Workflow Builder

- Drag-and-drop DAG editor (React Flow)
- Stage palette with available agents/skills
- Connection lines for depends_on edges
- Property panel for stage configuration
- YAML preview/editor toggle

#### 4.1.2 Execution Dashboard

- Real-time execution state (pending → running → completed/failed)
- Stage progress indicators
- Artifact output previews
- Token usage and duration metrics
- Error messages with stack traces

#### 4.1.3 Registry Browser

- Tabbed interface: Workflows | Agents | Skills | Prompts | Tools
- Search and filter by type, registry, tags
- Detail view with full ARN expansion
- Usage graph (what uses this, what does it use)

#### 4.1.4 Artifact Viewer

- Markdown rendered preview for specs/designs
- Diff view for code changes
- JSON tree view for structured data
- Download original file option

### 4.2 Screen Layouts

```
┌─────────────────────────────────────────────────────────────────────┐
│  Studio                                                [Settings]   │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌────────────────────────────────────────────────┐ │
│  │ Palette  │  │                                                │ │
│  │ ──────── │  │              Workflow Canvas                   │ │
│  │ Stages   │  │                                                │ │
│  │ ├ Init   │  │     ┌─────┐     ┌─────┐     ┌─────┐          │ │
│  │ ├ Explore│───────▶│Init │─────▶│Explr│────▶│Spec │          │ │
│  │ ├ Spec   │  │     └─────┘     └─────┘     └─────┘          │ │
│  │ └ ...    │  │                                                │ │
│  │          │  │                                                │ │
│  │ Agents   │  │                                                │ │
│  │ └ sdd-*  │  └────────────────────────────────────────────────┘ │
│  │          │  ┌────────────────────────────────────────────────┐ │
│  └──────────┘  │  Stage: SPEC                    Running  67%   │ │
│                │  ─────────────────────────────────────────────  │ │
│  ┌──────────┐  │  Artifacts: spec.md (23KB)                    │ │
│  │Details   │  │  Metrics: tokens=12,340 | dur=2m 34s          │ │
│  │ ──────── │  └────────────────────────────────────────────────┘ │
│  │Agent:    │                                                     │
│  │Model:    │  ┌────────────────────────────────────────────────┐ │
│  │Skills:   │  │  Artifact Preview                              │ │
│  └──────────┘  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. API Specification

### 5.1 MCP Resources

```typescript
// Workflow resources
"workflow:arn://*"                    // List all workflows
"workflow:arn://local/sdd-full"      // Get workflow definition

// Agent resources
"agent:arn://*"                      // List all agents

// Skill resources
"skill:arn://*"                      // List all skills

// Execution resources
"execution:arn://local/sdd-full/2025-05-17/run-001"  // Get execution

// Artifact resources
"artifact:arn://local/sdd/demo/spec" // Get artifact content
```

### 5.2 MCP Tools

```typescript
// Workflow execution
workflow_execute(workflow_arn: string, input: object): string
// Returns: execution_arn

workflow_subscribe_metrics(execution_arn: string): AsyncGenerator<MetricEvent>

workflow_list_active(): Execution[]

workflow_abort(execution_arn: string): boolean

// Registry management
registry_register(arn: string, config: object): boolean

registry_unregister(arn: string): boolean

registry_query(type?: string, filters?: object): RegistryItem[]

// Artifact access
artifact_get(arn: string): Artifact

artifact_list(execution_arn?: string): Artifact[]
```

### 5.3 MetricEvent Schema

```typescript
interface MetricEvent {
  execution_arn: string;
  stage_id: string;
  timestamp: string;        // ISO 8601
  event_type: 'started' | 'completed' | 'failed' | 'progress';
  metrics: {
    tokens_used?: number;
    duration_ms?: number;
    progress_percent?: number;
    artifacts_created?: string[];
    errors?: string[];
  };
}
```

---

## 6. Out of Scope

The following are explicitly **NOT** planned for v1.0:

- **Multi-user/team support** — Single user only
- **Workflow versioning** — Git-based versioning via filesystem
- **Marketplace** — Just local + GitHub imports
- **Workflow marketplace** — Future consideration
- **Agent code execution sandbox** — Agents execute in host environment
- **Custom agent implementations** — Only YAML-configured agents

---

## 7. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Workflow load time | < 500ms | Eager resolution + SQLite cache |
| Metrics streaming latency | < 100ms | Stage completion → SSE event |
| Skill auto-discovery | < 1s for 100 skills | Registry scan time |
| Studio initial render | < 2s | Lighthouse performance |
| Concurrent executions | 10+ simultaneous | Load test |

---

## 8. Glossary

| Term | Definition |
|------|------------|
| ARN | Amazon Resource Name — unique identifier format for resources |
| DAG | Directed Acyclic Graph — workflow dependency structure |
| MCP | Model Context Protocol — standard for AI tool communication |
| SDD | Spec-Driven Development — gentle-ai methodology |
| Studio | React UI for workflow building and monitoring |
| Stage | Single unit of work in a workflow execution |
