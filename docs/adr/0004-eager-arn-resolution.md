# ADR-0004: Eager ARN Resolution

**Status:** Accepted
**Date:** 2025-05-17
**Deciders:** Agentic Workflow System Design Team

## Context

When a workflow is loaded, its ARN references must be resolved to actual configurations. We evaluated:

- **Lazy resolution:** Resolve ARNs on-demand during execution
  - Pros: Faster initial load, only resolve what's needed
  - Cons: Runtime errors, no early validation, execution overhead

- **Eager resolution:** Resolve all ARNs when workflow is loaded, cache the resolved graph
  - Pros: Early validation, no runtime overhead, complete graph available
  - Cons: Slower initial load, cache invalidation needed

- **Resolution on-demand:** Resolve ARNs when a stage starts
  - Pros: Balance between eager and lazy
  - Cons: Still has runtime resolution overhead

## Decision

We use **Eager Resolution**: When a workflow is loaded, all ARN references are resolved immediately and the fully resolved configuration is cached in the database.

### Resolution Process

```
1. Load workflow YAML
2. Parse all ARN references
3. For each ARN:
   a. Check local cache
   b. If not cached:
      - Query DB for node
      - If not in DB: resolve from filesystem/MCP/GitHub
      - Store resolved node in DB with config_json
4. Build resolved config JSON (all ARNs expanded)
5. Store in edges table with resolved IDs
6. Mark workflow as "resolved" in metadata
```

### Cache Invalidation

| Event | Action |
|-------|--------|
| Source file modified | Recalculate checksum, update node if changed |
| Skill/agent definition updated | Invalidate all workflows that use it |
| Manual invalidate | User triggers rescan |
| On workflow load | Verify checksum matches, re-resolve if mismatch |

### Resolved Config JSON Example

```json
{
  "workflow_arn": "workflow:arn://local/sdd-full",
  "resolved_at": "2025-05-17T10:30:00Z",
  "checksum": "abc123...",
  "stages": [
    {
      "id": "explore",
      "agent": {
        "arn": "agent:arn://local/sdd-explore-agent",
        "name": "sdd-explore",
        "model": "glm-5.1",
        "skills": [
          {
            "arn": "skill:arn://local/sdd-explore",
            "name": "sdd-explore",
            "path": "/home/user/.workflows/skills/sdd-explore/SKILL.md"
          }
        ],
        "tools": [
          {
            "arn": "tool:arn://mcp/cognicode_build_graph",
            "name": "cognicode_build_graph",
            "mcp_server": "cognicode"
          }
        ]
      },
      "depends_on": [],
      "input": { "goal": "{user_goal}" },
      "output": { "artifacts": ["sdd/{change}/explore"] }
    }
  ]
}
```

## Consequences

### Positive
- **Early validation:** Broken ARNs caught at load time, not execution
- **No runtime overhead:** Execution uses pre-resolved config
- **Complete graph:** Full dependency graph available for Studio visualization
- **Offline execution:** Once resolved, workflow can run without registry access

### Negative
- **Slower workflow load:** Must resolve all references upfront
- **Cache invalidation complexity:** Must track what depends on what
- **Memory usage:** Resolved config can be large for complex workflows

### Performance Considerations

- Cache resolved workflows in SQLite with checksum validation
- Background thread for resolution to not block UI
- Incremental re-resolution when only parts change

## References

- [Prefect Flow Loading](https://docs.prefect.io/concepts/flows/)
- [Temporal Workflow Replay](https://docs.temporal.io/workflows#how-workflow-replay-works)
