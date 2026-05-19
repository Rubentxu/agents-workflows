# Orchestrator Agent Configuration Guide

## Overview

The Orchestrator Agent is deployed to IDEs (OpenCode, Claude Code, Cursor, Windsurf) to coordinate workflow execution via the MCP server. This guide covers configuration for each supported IDE.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  IDE (OpenCode / Claude Code / Cursor / Windsurf)                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Orchestrator Agent                                        │  │
│  │  - Coordinates workflow execution via MCP                 │  │
│  │  - Delegates to sub-agents for specialized work          │  │
│  │  - Reports state, insights, artifacts, metrics            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                      │
│                           │ HTTP Stream (JSON-RPC)               │
│                           ▼                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  MCP Server (agents-workflows-server)                      │  │
│  │  - workflow_list, workflow_execute, workflow_update_state │  │
│  │  - insights_log, artifact_create, metrics_subscribe       │  │
│  │  - ...26 tools total                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Environment Setup

### Start the Server

```bash
# Initialize workspace (one-time setup)
agents-workflows-server init

# Start the MCP server
agents-workflows-server start

# Start on custom port
agents-workflows-server start --port 8080

# Start with custom workspace
agents-workflows-server start --workspace ~/.workflows
```

### Default Endpoints

| Endpoint | URL | Description |
|----------|-----|-------------|
| MCP Server | http://localhost:8080/mcp | HTTP Stream JSON-RPC |
| REST API | http://localhost:8081/api | REST API for Studio |
| Metrics SSE | http://localhost:8080/metrics/sse | Real-time metrics stream |
| Studio UI | http://localhost:8080/studio | Web UI |

### Server Requirements

- Workspace initialized at `~/.workflows` (or custom path)
- SQLite database at `~/.workflows/global/registry.db`
- Workflow YAML files in `~/.workflows/global/workflows/`

## OpenCode Configuration (Primary)

OpenCode is the primary IDE for orchestrator deployment.

### Configuration File

Edit `~/.opencode/opencode.json` or `~/.opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/schema.json",
  "agent": {
    "orchestrator": {
      "description": "Workflow orchestrator - coordinates via MCP",
      "mode": "primary",
      "model": "minimax-coding-plan/MiniMax-M2.7-highspeed",
      "prompt": "{file:$HOME/.workflows/global/prompts/orchestrator-agent.md}",
      "tools": {
        "bash": true,
        "read": true,
        "write": true,
        "edit": true,
        "glob": true,
        "grep": true,
        "delegate": true,
        "webfetch": true
      }
    }
  },
  "mcp": {
    "agents-workflows": {
      "type": "remote",
      "url": "http://localhost:8080/mcp",
      "transport": "streamable-http"
    }
  }
}
```

### MCP Server Connection

```jsonc
{
  "mcp": {
    "agents-workflows": {
      "type": "remote",
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

### Complete OpenCode Example

```jsonc
{
  "$schema": "https://opencode.ai/schema.json",
  "agent": {
    "orchestrator": {
      "description": "Workflow orchestrator - coordinates SDD workflow execution",
      "mode": "primary",
      "model": "minimax-coding-plan/MiniMax-M2.7-highspeed",
      "prompt": "{file:$HOME/.workflows/global/prompts/orchestrator-agent.md}",
      "tools": {
        "bash": true,
        "read": true,
        "write": true,
        "edit": true,
        "glob": true,
        "grep": true,
        "delegate": true,
        "webfetch": true
      },
      "mcp": {
        "agents-workflows": {
          "enabled": true,
          "tools": [
            "workflow_list",
            "workflow_get",
            "workflow_get_dag",
            "workflow_execute",
            "workflow_get_state",
            "workflow_update_state",
            "workflow_get_next_stage",
            "workflow_abort",
            "agent_list",
            "agent_get",
            "skill_list",
            "skill_get",
            "prompt_list",
            "prompt_get",
            "execution_list",
            "execution_get",
            "execution_history",
            "artifact_create",
            "artifact_get",
            "artifact_list",
            "insights_log",
            "insights_query",
            "insights_aggregate",
            "metrics_query",
            "metrics_subscribe",
            "analyze_impact"
          ]
        }
      }
    }
  },
  "mcp": {
    "agents-workflows": {
      "type": "remote",
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

## Claude Code Configuration

Claude Code uses a similar MCP HTTP Stream configuration.

### Configuration File

Edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "agents-workflows": {
      "type": "http",
      "url": "http://localhost:8080/mcp",
      "stream": true
    }
  },
  "agents": {
    "orchestrator": {
      "description": "Workflow orchestrator via MCP",
      "model": "claude-sonnet-4-20250514",
      "tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch"]
    }
  }
}
```

### Alternative: Claude Code with Prompt Reference

```json
{
  "mcpServers": {
    "agents-workflows": {
      "type": "http",
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

Then reference the orchestrator prompt in your project configuration or session.

## Cursor Configuration

Cursor supports MCP HTTP Stream connections.

### Configuration File

Edit `~/.cursor/mcp.json` or `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agents-workflows": {
      "url": "http://localhost:8080/mcp",
      "transport": "streamable-http"
    }
  }
}
```

### Cursor Agent Configuration

In Cursor settings, configure the agent:

1. Go to Settings → Agents
2. Add new agent "Orchestrator"
3. Set model and tools
4. Reference prompt: `~/.workflows/global/prompts/orchestrator-agent.md`

## Windsurf Configuration

Windsurf (Codeium) supports MCP connections.

### Configuration File

Edit `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "agents-workflows": {
      "url": "http://localhost:8080/mcp",
      "transport": "streamable-http"
    }
  }
}
```

### Windsurf Agent Setup

In Windsurf settings:
1. Go to Settings → AI Agents
2. Enable MCP server
3. Configure endpoint: `http://localhost:8080/mcp`

## Agent Delegation Pattern

The orchestrator delegates specialized work to sub-agents for each workflow stage.

### Delegation Flow

```
┌──────────────────────────────────────────────────────────────────┐
│  Orchestrator Agent                                               │
│                                                                   │
│  1. workflow_get_next_stage(execution_arn, completed_stage)       │
│     → Returns suggested_stage                                    │
│                                                                   │
│  2. Query available agents: agent_list()                         │
│     → Select agent matching stage requirements                   │
│                                                                   │
│  3. Delegate stage work via IDE's delegate tool                  │
│     → Pass stage context, inputs, skills                          │
│                                                                   │
│  4. Receive result from sub-agent                                 │
│     → Stage output, artifacts, findings                          │
│                                                                   │
│  5. workflow_update_state(execution_arn, completed_stage, output) │
│     → Sync state to MCP server                                   │
│                                                                   │
│  6. insights_log(execution_arn, stage_id, "stage:completed", ...)│
│     → Record stage completion                                    │
│                                                                   │
│  7. Repeat for next stage                                        │
└──────────────────────────────────────────────────────────────────┘
```

### Delegation Example

```python
# Orchestrator delegates explore stage to sub-agent
async def execute_stage(execution_arn, stage_id, context):
    # Get stage details
    state = await workflow_get_state(execution_arn)
    stage_input = state.execution_context

    # Delegate to appropriate agent
    result = await delegate(
        agent="sdd-explore-agent",
        context={
            "goal": stage_input.goal,
            "execution_arn": execution_arn,
            "stage_id": stage_id
        },
        skills=["sdd-explore"]
    )

    # Update MCP state
    await workflow_update_state(
        execution_arn=execution_arn,
        completed_stage=stage_id,
        stage_output={
            "status": "completed",
            "artifacts": result.artifacts,
            "findings": result.findings
        }
    )

    # Log insight
    await insights_log(
        execution_arn=execution_arn,
        stage_id=stage_id,
        insight_type="stage:completed",
        data={
            "duration_ms": result.duration_ms,
            "tokens_used": result.tokens,
            "quality_score": result.quality_score,
            "output": result.findings
        }
    )
```

### Sub-Agent Selection

For each stage, select the appropriate sub-agent:

| Stage | Agent | Skills |
|-------|-------|--------|
| explore | sdd-explore-agent | sdd-explore, cognicode-sdd |
| propose | sdd-propose-agent | sdd-propose |
| spec | sdd-spec-agent | sdd-spec, docs-writer |
| design | sdd-design-agent | sdd-design, entropy-sdd |
| tasks | sdd-tasks-agent | sdd-tasks |
| apply | sdd-apply-agent | sdd-apply, cognicode-sdd |
| verify | sdd-verify-agent | sdd-verify, smoke-check |
| archive | sdd-archive-agent | sdd-archive |

## Insights Logging Integration

Agents should log insights for each stage to enable analysis and debugging.

### Recommended Insight Types

| Insight Type | When to Log | Data to Include |
|--------------|-------------|-----------------|
| `workflow:started` | Workflow execution begins | goal, workflow_arn, timestamp |
| `workflow:completed` | Workflow finishes | summary, total_metrics |
| `workflow:failed` | Workflow fails | error, failed_stage |
| `stage:started` | Stage begins | stage_id, input |
| `stage:completed` | Stage completes | stage_id, output, duration_ms, tokens_used |
| `stage:failed` | Stage fails | stage_id, error, partial_output |
| `agent:output` | Agent produces output | stage_id, findings, artifacts |
| `agent:error` | Agent encounters error | stage_id, error_message |
| `metrics:token_usage` | Token usage recorded | stage_id, tokens |
| `metrics:duration` | Duration recorded | stage_id, duration_ms |
| `metrics:quality_score` | Quality assessed | stage_id, score (0.0-1.0) |

### Logging Pattern

```python
# Log stage start
await insights_log(
    execution_arn=execution_arn,
    stage_id="explore",
    insight_type="stage:started",
    data={
        "timestamp": "2025-05-17T10:00:00Z",
        "input": {"goal": "implement login"},
        "metadata": {"model": "glm-4.7"}
    }
)

# ... execute stage work ...

# Log stage completion
await insights_log(
    execution_arn=execution_arn,
    stage_id="explore",
    insight_type="stage:completed",
    data={
        "timestamp": "2025-05-17T10:00:45Z",
        "input": {"goal": "implement login"},
        "output": {
            "findings": ["auth.go: JWT implementation", "patterns: OAuth2"],
            "artifacts": ["arn:local:workspace/default:artifact/explore-001"]
        },
        "duration_ms": 45000,
        "tokens_used": 15000,
        "quality_score": 0.87,
        "metadata": {"model": "glm-4.7"}
    }
)
```

### Querying Insights

```python
# Query all insights for an execution
insights = await insights_query(
    execution_arn="arn:local:workspace/default:execution/123",
    from="2025-05-01T00:00:00Z",
    to="2025-05-17T23:59:59Z"
)

# Query specific stage insights
stage_insights = await insights_query(
    execution_arn="arn:local:workspace/default:execution/123",
    stage_id="explore",
    insight_type="stage:completed"
)

# Get aggregated analytics
analytics = await insights_aggregate(
    execution_arn="arn:local:workspace/default:execution/123"
)
# Returns: total_insights, tokens, duration, quality scores by stage
```

## Metrics Subscription

Subscribe to real-time metrics via Server-Sent Events (SSE).

### Subscribe to Metrics

```python
# Get SSE URL
result = await metrics_subscribe(
    execution_arn="arn:local:workspace/default:execution/123"
)
# Returns: { "sse_url": "/metrics/sse?execution=arn:local:..." }

# Connect to SSE endpoint
# GET http://localhost:8080/metrics/sse?execution=arn:local:workspace/default:execution/123
```

### SSE Event Format

```
event: stage_metrics
data: {"stage_id":"explore","tokens_used":15000,"duration_ms":45000,"started_at":"...","completed_at":"..."}

event: workflow_progress
data: {"status":"running","current_stage":"propose","completed_stages":["explore"]}

event: final_metrics
data: {"execution_arn":"...","total_tokens":120000,"total_duration_ms":900000}
```

## IDE Configuration Summary

| IDE | Config Location | MCP Transport | Prompt Format |
|-----|----------------|---------------|---------------|
| OpenCode | `~/.opencode/opencode.json` | HTTP Stream | `{file:/path/to/prompt.md}` |
| Claude Code | `~/.claude/settings.json` | HTTP Stream | Inline or `{file:}` |
| Cursor | `~/.cursor/mcp.json` | HTTP Stream | Settings UI or `{file:}` |
| Windsurf | `~/.windsurf/mcp.json` | HTTP Stream | Settings UI |

## Troubleshooting

### MCP Connection Issues

```bash
# Verify server is running
curl http://localhost:8080/mcp -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Check server logs
agents-workflows-server start --log-level debug
```

### Common Errors

| Error | Solution |
|-------|----------|
| Connection refused | Ensure server is running: `agents-workflows-server start` |
| Invalid ARN | Check ARN format: `arn:local:{scope}:{type}/{name}` |
| State mismatch | Query `workflow_get_state` before updating |
| Workflow not found | Check `workflow_list` for available workflows |

### Health Check

```bash
# Test MCP connection
curl -s http://localhost:8080/mcp -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | jq

# Expected response: {"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}
```
