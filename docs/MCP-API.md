# MCP API Reference

**Version:** 1.0  
**Date:** 2025-05-17

---

## Overview

The MCP server exposes a rich API for workflow orchestration. The orchestrator agent (running in the IDE) uses these tools to coordinate workflow execution.

**Transport:** HTTP Stream (JSON-RPC over HTTP)  
**Endpoint:** `POST /mcp`  
**Content-Type:** `application/json`  
**Accept:** `application/json, text/event-stream`

---

## Resources

### Workflow Resources

```
workflow:arn:local:global:workflow/*
workflow:arn:local:workspace/{id}:workflow/*
```

### Agent Resources

```
agent:arn:local:global:agent/*
agent:arn:local:workspace/{id}:agent/*
```

### Skill Resources

```
skill:arn:local:global:skill/*
```

### Prompt Resources

```
prompt:arn:local:global:prompt/*
```

### Artifact Resources

```
artifact:arn:local:workspace/{id}:artifact/*
```

### Execution Resources

```
execution:arn:local:workspace/{id}:execution/*
```

---

## Tools

### Workflow Tools

#### `workflow_list`

List workflows matching filters.

```json
{
  "method": "workflow_list",
  "params": {
    "scope": "global",           // optional: global | workspace/{id}
    "type": "all"                // optional: all | default | custom
  }
}
```

#### `workflow_get`

Get full workflow definition with DAG.

```json
{
  "method": "workflow_get",
  "params": {
    "workflow_arn": "arn:local:global:workflow/sdd-full"
  }
}
```

**Response:**
```json
{
  "arn": "arn:local:global:workflow/sdd-full",
  "name": "sdd-full",
  "version": "1.0",
  "description": "Spec-Driven Development complete workflow",
  "stages": [...],
  "execution": {
    "mode": "sequential",
    "onFailure": "interactive"
  }
}
```

#### `workflow_get_dag`

Get workflow DAG structure for visualization.

```json
{
  "method": "workflow_get_dag",
  "params": {
    "workflow_arn": "arn:local:global:workflow/sdd-full"
  }
}
```

**Response:**
```json
{
  "workflow_arn": "arn:local:global:workflow/sdd-full",
  "nodes": [
    { "id": "explore", "type": "stage", "depends_on": [] },
    { "id": "propose", "type": "stage", "depends_on": ["explore"] },
    { "id": "spec", "type": "stage", "depends_on": ["propose"] }
  ],
  "edges": [
    { "from": "explore", "to": "propose" },
    { "from": "propose", "to": "spec" }
  ]
}
```

#### `workflow_execute`

Start a workflow execution.

```json
{
  "method": "workflow_execute",
  "params": {
    "workflow_arn": "arn:local:global:workflow/sdd-full",
    "input": { "goal": "implement login feature" },
    "workspace_id": "abc123"      // optional
  }
}
```

**Response:**
```json
{
  "execution_arn": "arn:local:workspace/abc123:execution/run-001",
  "workflow_arn": "arn:local:global:workflow/sdd-full",
  "status": "pending",
  "started_at": "2025-05-17T10:00:00Z"
}
```

#### `workflow_get_state`

Get current execution state.

```json
{
  "method": "workflow_get_state",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001"
  }
}
```

**Response:**
```json
{
  "execution_arn": "arn:local:workspace/abc123:execution/run-001",
  "workflow_arn": "arn:local:global:workflow/sdd-full",
  "status": "running",
  "current_stage": "propose",
  "completed_stages": ["explore"],
  "pending_stages": ["spec", "design", "tasks", "apply", "verify"],
  "stage_outputs": {
    "explore": { "artifacts": ["artifact:..."], "status": "completed" }
  },
  "execution_context": { "goal": "implement login feature" },
  "triggered_by": { "type": "manual", "input": { "goal": "..." } }
}
```

#### `workflow_update_state`

Update execution state (called by orchestrator).

```json
{
  "method": "workflow_update_state",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001",
    "completed_stage": "propose",
    "stage_output": {
      "status": "completed",
      "artifacts": ["arn:local:workspace/abc123:artifact/propose-output"],
      "next_recommended": "spec"
    },
    "execution_context": { /* updated context */ }
  }
}
```

#### `workflow_get_next_stage`

Get suggested next stage based on DAG and conditions.

```json
{
  "method": "workflow_get_next_stage",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001",
    "completed_stage": "propose"
  }
}
```

**Response:**
```json
{
  "suggested_stage": "spec",
  "conditions_met": true,
  "alternatives": [
    { "stage": "design", "condition": "fast_mode=true" }
  ]
}
```

#### `workflow_abort`

Abort a running execution.

```json
{
  "method": "workflow_abort",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001"
  }
}
```

---

### Agent Tools

#### `agent_list`

List agents.

```json
{
  "method": "agent_list",
  "params": {
    "scope": "global"
  }
}
```

#### `agent_get`

Get agent definition.

```json
{
  "method": "agent_get",
  "params": {
    "agent_arn": "arn:local:global:agent/orchestrator"
  }
}
```

**Response:**
```json
{
  "arn": "arn:local:global:agent/orchestrator",
  "name": "orchestrator",
  "description": "Workflow orchestrator agent",
  "model": "glm-4.7",
  "skills": ["arn:local:global:skill/sdd-explore"],
  "tools": ["workflow_execute", "workflow_update_state", "insights_log"]
}
```

#### `agent_query`

Query agents matching criteria.

```json
{
  "method": "agent_query",
  "params": {
    "capabilities": ["code-analysis", "refactoring"],
    "scope": "global"
  }
}
```

---

### Skill Tools

#### `skill_list`

List skills.

```json
{
  "method": "skill_list",
  "params": {
    "scope": "global"
  }
}
```

#### `skill_get`

Get skill definition (SKILL.md content).

```json
{
  "method": "skill_get",
  "params": {
    "skill_arn": "arn:local:global:skill/sdd-explore"
  }
}
```

**Response:**
```json
{
  "arn": "arn:local:global:skill/sdd-explore",
  "name": "sdd-explore",
  "description": "Investigate codebase and think through ideas...",
  "content": "# Skill Name\n\n## Quick start\n\n...",
  "triggers": ["explore", "investigate", "research"]
}
```

#### `skill_query`

Query skills matching triggers or criteria.

```json
{
  "method": "skill_query",
  "params": {
    "triggers": ["pdf", "document"],
    "scope": "global"
  }
}
```

---

### Prompt Tools

#### `prompt_list`

List prompts.

```json
{
  "method": "prompt_list",
  "params": {
    "scope": "global"
  }
}
```

#### `prompt_get`

Get prompt template.

```json
{
  "method": "prompt_get",
  "params": {
    "prompt_arn": "arn:local:global:prompt/sdd-orchestrator"
  }
}
```

---

### Execution Tools

#### `execution_list`

List executions with filters.

```json
{
  "method": "execution_list",
  "params": {
    "workspace_id": "abc123",
    "workflow_arn": "arn:local:global:workflow/sdd-full",  // optional
    "status": "completed",                                 // optional
    "limit": 20,
    "offset": 0
  }
}
```

#### `execution_get`

Get execution details.

```json
{
  "method": "execution_get",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001"
  }
}
```

#### `execution_history`

Get execution history for a workspace or project.

```json
{
  "method": "execution_history",
  "params": {
    "workspace_id": "abc123",
    "workflow_arn": "arn:local:global:workflow/sdd-full",
    "from": "2025-05-01T00:00:00Z",
    "to": "2025-05-17T23:59:59Z"
  }
}
```

---

### Artifact Tools

#### `artifact_create`

Create an artifact.

```json
{
  "method": "artifact_create",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001",
    "stage_id": "explore",
    "name": "explore-report",
    "content": "# Exploration Report\n\n...",
    "content_type": "markdown"
  }
}
```

**Response:**
```json
{
  "arn": "arn:local:workspace/abc123:artifact/explore-report",
  "storage_type": "sqlite",
  "size": 12345
}
```

#### `artifact_get`

Get artifact content.

```json
{
  "method": "artifact_get",
  "params": {
    "artifact_arn": "arn:local:workspace/abc123:artifact/explore-report"
  }
}
```

#### `artifact_list`

List artifacts for an execution.

```json
{
  "method": "artifact_list",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001"
  }
}
```

---

### Metrics Tools

#### `metrics_query`

Query metrics for an execution.

```json
{
  "method": "metrics_query",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001",
    "stage_id": "explore"          // optional
  }
}
```

**Response:**
```json
{
  "execution_arn": "arn:local:workspace/abc123:execution/run-001",
  "metrics": [
    {
      "stage_id": "explore",
      "tokens_used": 15000,
      "duration_ms": 45000,
      "started_at": "2025-05-17T10:00:00Z",
      "completed_at": "2025-05-17T10:00:45Z"
    }
  ]
}
```

#### `metrics_subscribe`

Subscribe to metrics stream for an execution.

```json
{
  "method": "metrics_subscribe",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001"
  }
}
```

Returns SSE stream at `/metrics/sse?execution={execution_arn}`.

---

### Insights Tools

#### `insights_log`

Log an insight event.

```json
{
  "method": "insights_log",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001",
    "stage_id": "explore",
    "insight_type": "agent:output",
    "data": {
      "timestamp": "2025-05-17T10:00:30Z",
      "input": { "goal": "implement login" },
      "output": { "findings": ["...", "..."] },
      "metadata": { "model": "glm-4.7", "tokens": 15000 }
    }
  }
}
```

**Insight Types:**
- `workflow:started`, `workflow:completed`, `workflow:failed`
- `stage:started`, `stage:completed`, `stage:failed`, `stage:skipped`
- `stage:condition_evaluated`
- `agent:output`, `agent:error`
- `metrics:token_usage`, `metrics:duration`, `metrics:quality_score`

#### `insights_query`

Query insights for analysis.

```json
{
  "method": "insights_query",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001",
    "stage_id": "explore",            // optional
    "insight_type": "agent:output",  // optional
    "from": "2025-05-01T00:00:00Z",
    "to": "2025-05-17T23:59:59Z"
  }
}
```

#### `insights_aggregate`

Aggregate insights for analytics. Returns aggregated metrics including token usage totals, duration summaries, quality scores, and insight counts by type and stage.

```json
{
  "method": "insights_aggregate",
  "params": {
    "execution_arn": "arn:local:workspace/abc123:execution/run-001",
    "stage_id": "propose"  // optional - if omitted, returns execution-level aggregation
  }
}
```

**Response (execution-level):**
```json
{
  "type": "Execution",
  "analytics": {
    "execution_id": "arn:local:workspace/abc123:execution/run-001",
    "total_insights": 15,
    "insights_by_type": { "stage_completed": 5, "agent_output": 8, "metrics_token_usage": 2 },
    "insights_by_stage": { "explore": 5, "propose": 5, "design": 5 },
    "total_tokens": 45000,
    "total_duration_ms": 120000,
    "avg_quality_score": 0.85
  },
  "summary": {
    "execution_id": "arn:local:workspace/abc123:execution/run-001",
    "workflow_started": true,
    "workflow_completed": true,
    "workflow_failed": false,
    "stage_count": 3,
    "completed_stages": ["explore", "propose", "design"],
    "failed_stages": [],
    "skipped_stages": [],
    "total_token_usage": 45000,
    "total_duration_ms": 120000,
    "last_insight_at": "2025-05-17T10:30:00Z"
  }
}
```

**Response (stage-level):**
```json
{
  "type": "Stage",
  "analytics": {
    "execution_id": "arn:local:workspace/abc123:execution/run-001",
    "stage_id": "propose",
    "total_insights": 5,
    "insights_by_type": { "stage_completed": 1, "agent_output": 3, "metrics_token_usage": 1 },
    "total_tokens": 15000,
    "total_duration_ms": 40000,
    "avg_quality_score": 0.82
  }
}
```

---

## Error Responses

```json
{
  "jsonrpc": "2.0",
  "id": 123,
  "error": {
    "code": -32600,
    "message": "Invalid ARN format",
    "data": { "arn": "invalid" }
  }
}
```

### Error Codes

| Code | Meaning |
|------|---------|
| -32600 | Invalid Request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32000 | Resource not found |
| -32001 | Execution not found |
| -32002 | Invalid state transition |
| -32003 | Workflow validation error |
