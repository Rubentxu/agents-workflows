# ADR-0002: ARN Reference System

**Status:** Accepted
**Date:** 2025-05-17
**Deciders:** Agentic Workflow System Design Team

## Context

We needed a unified reference system that allows:
- Unique identification of all resources (workflows, agents, skills, prompts, tools, artifacts)
- Clear ownership and registry for each resource
- Self-describing references that encode location and identity
- Cross-registry references (local, MCP, GitHub, marketplace)

Previous approaches considered:
- Simple UUIDs (no context, no registry)
- File paths (not unique, tied to filesystem)
- REST URLs (coupled to HTTP, not agent-native)

## Decision

We adopt **ARN (Amazon Resource Name) format** inspired by AWS ARN pattern, adapted for agentic resources.

### Format

```
{type}:arn://{registry}/{namespace}/{name}

Examples:
- workflow:arn://local/sdd-full
- agent:arn://local/sdd-explore-agent
- skill:arn://local/sdd-explore
- skill:arn://mcp/tdd
- skill:arn://github.com/mattpocock/skills/grill
- prompt:arn://local/sdd-explore
- tool:arn://mcp/cognicode_build_graph
- artifact:arn://local/sdd/demo/spec
- execution:arn://local/sdd-full/2025-05-17/run-001
```

### Components

| Component | Description | Allowed Values |
|-----------|-------------|----------------|
| `type` | Resource type | workflow, agent, skill, prompt, tool, artifact, execution |
| `arn://` | ARN prefix | Fixed prefix |
| `registry` | Owning registry | local, mcp, github.com/{user}, marketplace |
| `namespace` | Grouping within registry | Project or user namespace |
| `name` | Resource name | kebab-case, max 64 chars |

### Registry Types

| Registry | Description | Resolution |
|----------|-------------|------------|
| `local` | Locally defined in `~/.workflows/` | Filesystem + DB |
| `mcp` | Available via MCP tools | MCP tool registry |
| `github.com/{user}` | Remote skills from GitHub | GitHub API |
| `marketplace` | Official skill marketplace | Future marketplace API |

### Resolution Rules

1. **Local resolution:** Check `~/.workflows/{type}s/` directories
2. **MCP resolution:** Query MCP server for tool/skill registry
3. **GitHub resolution:** Fetch from GitHub API
4. **Eager resolution:** All ARNs resolved on workflow load and cached

### Self-Describing References

```yaml
# Reference with embedded type information
skill:arn://local/sdd-explore

# Versioned reference
skill:arn://local/sdd-explore@1.0.0

# Registry-only reference (latest version)
skill:arn://mcp/tdd
```

## Consequences

### Positive
- Globally unique identifiers for all resources
- Clear ownership and location in the identifier itself
- Supports cross-registry references seamlessly
- Familiar pattern (AWS users will recognize immediately)
- Self-documenting (registry + namespace + name tells you where it lives)

### Negative
- ARN strings can become long
- Requires resolver infrastructure for each registry type
- Versioning strategy needs separate ADR

### Migration Path

For existing SDD resources:
```
# Old format
skill: sdd-explore

# New format
skill:arn://local/sdd-explore
```

## References

- [AWS ARN Format](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference-arns.html)
- [Temporal Namespaces](https://docs.temporal.io/namespaces)
