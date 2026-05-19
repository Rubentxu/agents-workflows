# ADR-0007: Server-Side Execution State Machine

**Status:** Accepted  
**Date:** 2025-05-17  
**Deciders:** Agentic Workflow System Design Team

## Context

We needed to track workflow execution state. We evaluated:

- **Client-side state**: Orchestrator maintains state locally
  - Pros: Simple, no server dependency
  - Cons: State lost on crash, no visibility for Studio

- **Server-side state machine**: MCP maintains authoritative state
  - Pros: Persistent, shareable, Studio can observe
  - Cons: More complex, requires validation

- **Distributed state**: Consensus protocol across agents
  - Pros: Highly available
  - Cons: Overkill for single-user model

## Decision

The MCP server maintains a **server-side execution state machine**:

```
ExecutionState {
    execution_arn: string
    workflow_arn: string
    status: pending | running | completed | failed | aborted
    current_stage: string
    completed_stages: string[]
    pending_stages: string[]
    stage_outputs: Map<stage_id, StageOutput>
    stage_errors: Map<stage_id, Error>
    execution_context: JSON
    triggered_by: TriggerInfo
    created_at: timestamp
    updated_at: timestamp
}
```

### State Transitions

```
pending → running     (workflow_execute called)
running → running     (stage completes, more pending)
running → completed   (all stages done)
running → failed     (stage error, no recovery)
running → aborted    (workflow_abort called)
```

### Transition Rules

1. **Sequential**: A → B → C (simple chain)
2. **Parallel**: A → {B, C} → D (B and C can run concurrently)
3. **Conditional**: Based on workflow config and stage output
4. **Retry**: Failed stage can retry based on retry config

### Orchestrator Role

The orchestrator agent:
1. Calls `workflow_execute` → creates initial state
2. Calls `workflow_update_state` after each stage
3. Queries `workflow_get_state` to determine current position
4. Calls `workflow_get_next_stage` for suggestions

The server validates transitions and persists state.

## Consequences

### Positive
- **Persistence**: State survives orchestrator restarts
- **Visibility**: Studio can observe execution progress
- **Recovery**: Failed executions can be resumed
- **Audit**: Complete history of state changes

### Negative
- **Latency**: Extra round-trip for state updates
- **Complexity**: State machine must handle edge cases
- **Consistency**: Must handle concurrent updates

### API Surface

```rust
// Start execution
workflow_execute(workflow_arn, input) → ExecutionState

// Update state (orchestrator calls after stage)
workflow_update_state(execution_arn, completed_stage, output) → ExecutionState

// Get current state
workflow_get_state(execution_arn) → ExecutionState

// Get suggested next stage
workflow_get_next_stage(execution_arn, completed_stage) → NextStage

// Abort execution
workflow_abort(execution_arn) → ExecutionState
```

## References

- [Temporal Workflow State](https://docs.temporal.io/workflows)
- [AWS Step Functions State Machine](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-states.html)
