# Workspace Structure

## Overview

The agents-workflows system uses a workspace-based directory structure for organizing resources.

## Directory Structure

```
~/.workflows/
├── global/                       # Shared resources (ARN: global/*)
│   ├── registry.db             # SQLite database
│   ├── workflows/              # Workflow definitions (YAML)
│   │   └── sdd-full.yaml
│   ├── agents/                 # Agent definitions (YAML)
│   │   └── orchestrator.yaml
│   ├── skills/                 # Skills (mattpocock SKILL.md)
│   │   ├── sdd-explore/
│   │   │   └── SKILL.md
│   │   └── sdd-apply/
│   │       └── SKILL.md
│   └── prompts/                # Prompt templates
│       └── orchestrator.md
│
└── workspaces/                 # Workspace-isolated resources
    └── {workspace-id}/        # Per-project isolated resources
        ├── registry.db         # Workspace-specific registry
        ├── workflows/          # Custom workflows
        ├── artifacts/         # Execution artifacts
        └── executions/         # Execution history
```

## ARN Format

Resources are identified by ARN:

```
arn:local:{scope}:{type}/{name}

Scopes:
- global           → Shared across all workspaces
- workspace/{id}   → Isolated to specific workspace

Examples:
- arn:local:global:workflow/sdd-full
- arn:local:global:skill/sdd-explore
- arn:local:workspace/abc123:artifact/run-001/spec
```

## Resource Types

| Type | Scope | Description |
|------|-------|-------------|
| workflow | global, workspace | DAG of stages |
| agent | global | Orchestrator or specialized agent |
| skill | global | Portable capability (mattpocock format) |
| prompt | global | Prompt template |
| artifact | workspace | Execution output |
| execution | workspace | Run instance of a workflow |

## Bootstrap

First run creates the structure:

```bash
agents-workflows-server init
# Creates ~/.workflows/global/ with default resources
```

## Custom Workspaces

Create workspace-specific resources:

```bash
# Via REST API
curl -X POST http://localhost:8081/api/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name": "my-project"}'
```

Resources in a workspace use ARN scope `workspace/{id}`.
