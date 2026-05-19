# ADR-0006: Multi-Workspace ARN System

**Status:** Accepted  
**Date:** 2025-05-17  
**Deciders:** Agentic Workflow System Design Team

## Context

We needed a unified reference system that supports:
- Multiple isolated workspaces within a single deployment
- Global resources shared across all workspaces
- Future policy/permission system (like AWS IAM)
- Clear ownership and registry for each resource

Previous approaches considered:
- Single flat namespace (all resources equal)
- Workspace prefixes (workspace-abc/workflow-name)
- Separate registries per workspace (complex to manage)

## Decision

We adopt **AWS-inspired ARN format** with explicit scope:

```
arn:local:{scope}:{type}/{name}

Scopes:
- global                    → Shared across all workspaces
- workspace/{workspace-id}  → Isolated to a workspace

Examples:
arn:local:global:workflow/sdd-full
arn:local:global:skill/sdd-explore
arn:local:workspace/abc123:workflow/custom-ci
arn:local:workspace/abc123:artifact/execution-456/spec
```

### Scope Semantics

| Scope | Resources | Visibility |
|-------|-----------|------------|
| `global` | skills, agents, prompts, workflows | All workspaces share |
| `workspace/{id}` | artifacts, executions, custom workflows | Workspace-isolated |

### Components

| Component | Description | Allowed Values |
|-----------|-------------|----------------|
| `arn:` | ARN prefix | Fixed prefix |
| `local` | Registry type | Fixed (extensible) |
| `scope` | Resource scope | `global`, `workspace/{id}` |
| `type` | Resource type | workflow, agent, skill, prompt, tool, artifact, execution |
| `name` | Resource name | kebab-case, max 64 chars |

## Consequences

### Positive
- **Future-proof for policies**: ARN format supports IAM-like policies
- **Clear separation**: Global vs workspace-scoped resources are explicit
- **Scalable**: Multiple workspaces without registry conflicts
- **Queryable**: Scope in ARN enables efficient filtering

### Negative
- **Longer identifiers**: More verbose than simple names
- **Migration needed**: Existing "local" ARNs need scope added

## References

- [AWS ARN Format](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html)
- [Temporal Namespaces](https://docs.temporal.io/namespaces)
