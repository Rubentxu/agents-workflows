# ADR-0008: Rich MCP Orchestration API

**Status:** Accepted  
**Date:** 2025-05-17  
**Deciders:** Agentic Workflow System Design Team

## Context

We needed an MCP API that supports full workflow orchestration, not just "execute and forget". The orchestrator agent needs to:

- Query available workflows, agents, skills, prompts
- Get workflow DAG structure
- Get/set execution state
- Query execution history
- Create/retrieve artifacts
- Log structured insights
- Subscribe to metrics

Previous approaches:
- **Minimal API**: Just `execute` and `get_status`
  - Cons: Orchestrator must infer too much
- **Rich API**: Many tools for orchestration
  - Pros: Flexibility, clear contracts
  - Cons: More complex to implement

## Decision

We implement a **rich MCP API** with the following tool categories:

### Workflow Tools

| Tool | Purpose |
|------|---------|
| `workflow_list` | List workflows with filters |
| `workflow_get` | Get full workflow definition |
| `workflow_get_dag` | Get DAG for visualization |
| `workflow_execute` | Start execution |
| `workflow_get_state` | Get current execution state |
| `workflow_update_state` | Update state after stage |
| `workflow_get_next_stage` | Get suggested next stage |
| `workflow_abort` | Abort execution |

### Resource Tools

| Tool | Purpose |
|------|---------|
| `agent_list`, `agent_get`, `agent_query` | Query agents |
| `skill_list`, `skill_get`, `skill_query` | Query skills |
| `prompt_list`, `prompt_get` | Query prompts |

### Execution Tools

| Tool | Purpose |
|------|---------|
| `execution_list` | List executions with filters |
| `execution_get` | Get execution details |
| `execution_history` | Historical executions for analysis |

### Artifact Tools

| Tool | Purpose |
|------|---------|
| `artifact_create` | Create artifact |
| `artifact_get` | Get artifact content |
| `artifact_list` | List execution artifacts |

### Metrics & Insights Tools

| Tool | Purpose |
|------|---------|
| `metrics_query` | Query execution metrics |
| `metrics_subscribe` | Subscribe to SSE stream |
| `insights_log` | Log structured insight event |
| `insights_query` | Query insights for analysis |

## Design Principles

1. **Explicit over implicit**: State changes require explicit API calls
2. **Rich feedback**: Every tool returns meaningful data
3. **Discoverability**: List/query tools enable dynamic discovery
4. **Auditability**: All state changes are logged via insights

## Consequences

### Positive
- **Flexibility**: Orchestrator has many levers for control
- **Transparency**: All operations are explicit and logged
- **Debugging**: Rich API enables detailed tracing
- **Studio integration**: Same API powers both IDE and Studio

### Negative
- **Complexity**: Many tools to implement
- **Verbosity**: More round-trips for simple operations
- **Learning curve**: Orchestrator must understand API surface

## Example Flow

```
1. orchestrator: workflow_list(scope="global")
   → returns [sdd-full, sdd-explore-only, custom-ci]

2. orchestrator: workflow_get_dag(arn:local:global:workflow/sdd-full)
   → returns { nodes: [...], edges: [...] }

3. orchestrator: workflow_execute(arn, input={goal: "..."})
   → returns { execution_arn: "...", status: "pending" }

4. orchestrator: workflow_get_next_stage(execution_arn, completed_stage=null)
   → returns { suggested_stage: "explore" }

5. orchestrator: [delegate stage work to agent]

6. orchestrator: workflow_update_state(execution_arn, "explore", output)
   → returns { current_stage: "propose", completed_stages: ["explore"] }

7. orchestrator: insights_log(execution_arn, "explore", "stage:completed", data)
   → persisted for analysis

8. orchestrator: [repeat 4-7 for each stage]

9. orchestrator: workflow_get_state(execution_arn)
   → returns { status: "completed", completed_stages: [...] }
```

## References

- [MCP Protocol](https://modelcontextprotocol.io)
- [Anthropic Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
