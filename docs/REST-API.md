# REST API Reference

**Version:** 1.0  
**Date:** 2025-05-17

---

## Overview

The REST API is used by **Studio** (the React UI) for operations that require create/edit capabilities. The MCP API is used by IDEs for orchestration.

**Base URL:** `http://localhost:8080/api`  
**Content-Type:** `application/json`

---

## Workspaces

### Create Workspace

```
POST /api/workspaces
```

```json
{
  "name": "my-project",
  "description": "My workflow project"
}
```

**Response:** `201 Created`
```json
{
  "id": "workspace-abc123",
  "name": "my-project",
  "description": "My workflow project",
  "created_at": "2025-05-17T10:00:00Z"
}
```

### List Workspaces

```
GET /api/workspaces
```

**Response:** `200 OK`
```json
{
  "workspaces": [
    {
      "id": "workspace-abc123",
      "name": "my-project",
      "description": "My workflow project",
      "created_at": "2025-05-17T10:00:00Z"
    }
  ]
}
```

### Get Workspace

```
GET /api/workspaces/{workspace_id}
```

**Response:** `200 OK`
```json
{
  "id": "workspace-abc123",
  "name": "my-project",
  "description": "My workflow project",
  "created_at": "2025-05-17T10:00:00Z",
  "stats": {
    "executions_count": 42,
    "artifacts_count": 156,
    "last_execution": "2025-05-17T09:30:00Z"
  }
}
```

### Delete Workspace

```
DELETE /api/workspaces/{workspace_id}
```

**Response:** `204 No Content`

---

## Workflows

### Create Workflow

```
POST /api/workflows
```

```json
{
  "scope": "global",
  "name": "custom-ci",
  "description": "Custom CI workflow",
  "stages": [
    {
      "id": "build",
      "agent": "build-agent",
      "depends_on": [],
      "input": {}
    },
    {
      "id": "test",
      "agent": "test-agent",
      "depends_on": ["build"],
      "input": {}
    }
  ],
  "execution": {
    "mode": "sequential",
    "onFailure": "stop"
  }
}
```

**Response:** `201 Created`
```json
{
  "arn": "arn:local:global:workflow/custom-ci",
  "name": "custom-ci",
  "scope": "global",
  "created_at": "2025-05-17T10:00:00Z"
}
```

### Get Workflow

```
GET /api/workflows/{workflow_arn}
```

**Response:** `200 OK`
```json
{
  "arn": "arn:local:global:workflow/custom-ci",
  "name": "custom-ci",
  "description": "Custom CI workflow",
  "scope": "global",
  "stages": [...],
  "execution": {...},
  "created_at": "2025-05-17T10:00:00Z",
  "updated_at": "2025-05-17T10:00:00Z"
}
```

### Update Workflow

```
PUT /api/workflows/{workflow_arn}
```

```json
{
  "description": "Updated description",
  "stages": [...],
  "execution": {...}
}
```

**Response:** `200 OK`

### Delete Workflow

```
DELETE /api/workflows/{workflow_arn}
```

**Response:** `204 No Content`

### List Workflows

```
GET /api/workflows?scope=global&type=all
```

**Query Parameters:**
- `scope` — `global` | `workspace/{id}`
- `type` — `all` | `default` | `custom`

**Response:** `200 OK`
```json
{
  "workflows": [
    {
      "arn": "arn:local:global:workflow/sdd-full",
      "name": "sdd-full",
      "description": "SDD complete workflow",
      "scope": "global"
    }
  ]
}
```

---

## Agents

### Create Agent

```
POST /api/agents
```

```json
{
  "scope": "global",
  "name": "code-review-agent",
  "description": "Agent for code review",
  "model": "glm-4.7",
  "skills": ["arn:local:global:skill/sdd-verify"],
  "tools": ["read", "edit", "bash"]
}
```

**Response:** `201 Created`
```json
{
  "arn": "arn:local:global:agent/code-review-agent",
  "name": "code-review-agent",
  "scope": "global",
  "created_at": "2025-05-17T10:00:00Z"
}
```

### Get Agent

```
GET /api/agents/{agent_arn}
```

### Update Agent

```
PUT /api/agents/{agent_arn}
```

### Delete Agent

```
DELETE /api/agents/{agent_arn}
```

### List Agents

```
GET /api/agents?scope=global
```

---

## Skills

### Create Skill

```
POST /api/skills
```

```json
{
  "name": "my-custom-skill",
  "description": "Custom skill for...",
  "content": "# My Custom Skill\n\n## Quick start\n\n...",
  "triggers": ["custom", "special"]
}
```

**Response:** `201 Created`
```json
{
  "arn": "arn:local:global:skill/my-custom-skill",
  "name": "my-custom-skill",
  "created_at": "2025-05-17T10:00:00Z"
}
```

### Get Skill

```
GET /api/skills/{skill_arn}
```

**Response:** `200 OK`
```json
{
  "arn": "arn:local:global:skill/my-custom-skill",
  "name": "my-custom-skill",
  "description": "Custom skill for...",
  "content": "# My Custom Skill\n\n...",
  "triggers": ["custom", "special"],
  "created_at": "2025-05-17T10:00:00Z"
}
```

### Update Skill

```
PUT /api/skills/{skill_arn}
```

### Delete Skill

```
DELETE /api/skills/{skill_arn}
```

### List Skills

```
GET /api/skills?scope=global
```

---

## Prompts

### Create Prompt

```
POST /api/prompts
```

```json
{
  "name": "custom-orchestrator",
  "description": "Custom orchestrator prompt",
  "content": "# Custom Orchestrator\n\nYou are a..."
}
```

### Get Prompt

```
GET /api/prompts/{prompt_arn}
```

### Update Prompt

```
PUT /api/prompts/{prompt_arn}
```

### Delete Prompt

```
DELETE /api/prompts/{prompt_arn}
```

### List Prompts

```
GET /api/prompts?scope=global
```

---

## Executions

### Get Execution

```
GET /api/executions/{execution_arn}
```

**Response:** `200 OK`
```json
{
  "arn": "arn:local:workspace/abc123:execution/run-001",
  "workflow_arn": "arn:local:global:workflow/sdd-full",
  "workspace_id": "abc123",
  "status": "running",
  "current_stage": "propose",
  "completed_stages": ["explore"],
  "pending_stages": ["spec", "design", "tasks", "apply", "verify"],
  "triggered_by": {
    "type": "manual",
    "input": { "goal": "implement login" }
  },
  "started_at": "2025-05-17T10:00:00Z"
}
```

### List Executions

```
GET /api/executions?workspace_id=abc123&status=running
```

### Pause Execution

```
POST /api/executions/{execution_arn}/pause
```

**Response:** `200 OK`

### Resume Execution

```
POST /api/executions/{execution_arn}/resume
```

**Response:** `200 OK`

### Abort Execution

```
POST /api/executions/{execution_arn}/abort
```

**Response:** `200 OK`

---

## Artifacts

### Get Artifact

```
GET /api/artifacts/{artifact_arn}
```

**Response:** `200 OK`
```json
{
  "arn": "arn:local:workspace/abc123:artifact/spec-output",
  "execution_arn": "arn:local:workspace/abc123:execution/run-001",
  "stage_id": "spec",
  "name": "spec-output",
  "content": "# Specification\n\n...",
  "content_type": "markdown",
  "size": 12345,
  "created_at": "2025-05-17T10:30:00Z"
}
```

### List Execution Artifacts

```
GET /api/artifacts?execution_arn={execution_arn}
```

### Download Artifact (Large)

```
GET /api/artifacts/{artifact_arn}/download
```

Returns the raw file for large artifacts stored in filesystem.

---

## Insights

### Query Insights

```
GET /api/insights?execution_arn={execution_arn}&stage_id=explore
```

**Query Parameters:**
- `execution_arn` — Filter by execution
- `stage_id` — Filter by stage
- `insight_type` — Filter by type
- `from` — Start timestamp
- `to` — End timestamp

**Response:** `200 OK`
```json
{
  "insights": [
    {
      "id": 1,
      "execution_arn": "arn:local:workspace/abc123:execution/run-001",
      "stage_id": "explore",
      "insight_type": "stage:completed",
      "data": {
        "timestamp": "2025-05-17T10:30:00Z",
        "input": { "goal": "implement login" },
        "output": { "findings": ["...", "..."] },
        "duration_ms": 45000,
        "tokens_used": 15000
      },
      "created_at": "2025-05-17T10:30:00Z"
    }
  ]
}
```

---

## Metrics

### Get Execution Metrics

```
GET /api/metrics?execution_arn={execution_arn}
```

**Response:** `200 OK`
```json
{
  "execution_arn": "arn:local:workspace/abc123:execution/run-001",
  "metrics": [
    {
      "stage_id": "explore",
      "status": "completed",
      "tokens_used": 15000,
      "duration_ms": 45000,
      "started_at": "2025-05-17T10:00:00Z",
      "completed_at": "2025-05-17T10:00:45Z"
    },
    {
      "stage_id": "propose",
      "status": "running",
      "started_at": "2025-05-17T10:00:45Z"
    }
  ],
  "total_tokens": 15000,
  "total_duration_ms": 45000
}
```

---

## Server Configuration

### Health Check

```
GET /api/health
```

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime_seconds": 3600
}
```

### Get Configuration

```
GET /api/config
```

**Response:** `200 OK`
```json
{
  "default_workflow": "arn:local:global:workflow/sdd-full",
  "max_concurrent_executions": 10,
  "artifact_size_threshold_bytes": 1048576
}
```

### Update Configuration

```
PUT /api/config
```

```json
{
  "default_workflow": "arn:local:global:workflow/sdd-full"
}
```

---

## Error Responses

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Workflow not found",
    "details": {
      "arn": "arn:local:global:workflow/nonexistent"
    }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `RESOURCE_NOT_FOUND` | 404 | Resource doesn't exist |
| `ALREADY_EXISTS` | 409 | Resource already exists |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Comparison: REST API vs MCP API

| Aspect | REST API | MCP API |
|--------|----------|---------|
| **Client** | Studio (React UI) | IDE Orchestrator Agents |
| **Create/Edit** | ✅ Full support | ❌ Read-only |
| **Workflow Execution** | ❌ Not for execution | ✅ Rich orchestration tools |
| **State Management** | ❌ | ✅ Server-side state machine |
| **Metrics/Insights** | ✅ Query only | ✅ Log + query |
| **Workspaces** | ✅ CRUD | ❌ Query only |

The REST API and MCP API are two presentation layers over the same underlying functionality. Studio uses REST for operations that modify resources, while IDEs use MCP for workflow orchestration.
