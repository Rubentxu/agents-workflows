# ADR-0015: Cross-Resource Reference System

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Agentic Workflow System Design Team

## Context

ADR-0010 through ADR-0014 define individual resource data models. Each resource references other resources via ARN. This ADR consolidates the cross-resource reference rules, edge conventions, and `content_path` file management into a single reference document.

The goal: every editor can resolve dependencies, show relationships, and enforce referential integrity.

## Decision

### Rule 1: All Cross-Resource References Use ARNs

Resources reference other resources exclusively via ARN strings. No file paths, no URLs, no names without scope.

```yaml
# Agent references Prompt
prompt: "arn:local:global:prompt/sdd-orchestrator"

# Agent references Skills
skills:
  - "arn:local:global:skill/sdd-explore"
  - "arn:local:global:skill/sdd-apply"

# Prompt references Template
template: "arn:local:global:template/sdd-exploration-output"

# Skill references other Skills
references:
  - "arn:local:global:skill/_shared"

# Tool names in agent.tools and skill.required_tools use short names (not ARNs)
# because tools are identified by their MCP name, not by ARN
tools:
  bash: true
  chronos_debug_run: true
```

### Rule 2: Large Text Content Uses File References

Any content exceeding ~50 lines MUST be stored in a separate file and referenced by `content_path`. The YAML registry entry contains metadata only.

| Resource | `content_path` points to | Format |
|----------|-------------------------|--------|
| Agent | No content_path — instructions come from `prompt` (ARN reference) | — |
| Skill | `skills/{name}/SKILL.md` | Markdown with frontmatter |
| Prompt | `prompts/{name}.md` | Markdown with `{{variables}}` |
| Template | `templates/{name}.{ext}` where ext matches `format` | markdown, json, yaml, or text |
| Tool | No content_path — schemas are inline in the YAML | — |

File path resolution:
- Relative to `~/.workflows/{scope}/` directory
- Example: `scope=global`, `content_path=prompts/sdd-explore.md` → `~/.workflows/global/prompts/sdd-explore.md`

### Rule 3: Variables Are Always Inferred, Never Manually Declared

For Prompt and Template resources, input variables are extracted from the content file by scanning `{{variable}}` patterns. The editor performs this extraction in real-time.

The user NEVER manually declares variables. They are always derived from the content.

### Rule 4: Registry Edges Reflect ARN References

When a resource is saved, the registry creates edges (ADR-0003) for every ARN reference:

| Source Field | Edge Type | Direction |
|-------------|-----------|-----------|
| `Agent.prompt` | `uses` | Agent → Prompt |
| `Agent.skills[]` | `uses` | Agent → Skill |
| `Agent.tools` (keys) | `uses` | Agent → Tool (by name, resolved) |
| `Skill.references[]` | `references` | Skill → Skill |
| `Skill.required_tools[]` | `requires` | Skill → Tool (by name, resolved) |
| `Prompt.template` | `uses` | Prompt → Template |

### Edge Resolution Rules

1. **On save**: When a resource is created or updated, the registry resolves all ARN references and creates/replaces edges
2. **On delete**: When a resource is deleted, all edges pointing to/from it are removed
3. **Orphan detection**: The editor can query for broken references — edges where the target ARN doesn't exist

### Complete Reference Map

```
Agent ──uses──→ Prompt (ARN, single)
      ──uses──→ Skill[] (ARNs)
      ──uses──→ Tool[] (by name in tools map)

Skill ──references──→ Skill[] (ARNs)
      ──requires──→ Tool[] (by name in required_tools)
      ──has──→ content_path → SKILL.md file

Prompt ──uses──→ Template (ARN, single)
       ──has──→ content_path → prompt body file
       ──infers──→ input variables from {{var}} in content

Template ──has──→ content_path → template file (native format)
          ──infers──→ variables from {{var}} in content

Tool ──has──→ input_schema (inline JSON Schema)
     ──has──→ output_schema (inline JSON Schema)
     ──comes from──→ source (MCP server, builtin, or custom)
```

### Editor Integrity Rules

| Rule | Enforcement |
|------|-------------|
| Agent cannot reference a non-existent Prompt | Warning in editor, edge still created (may be created later) |
| Agent cannot reference a non-existent Skill | Warning in editor |
| Prompt cannot reference a non-existent Template | Warning in editor |
| Skill `required_tools` must be reflected in Agent `tools` | Auto-merge by editor on skill binding |
| Deleting a Skill referenced by an Agent | Show impacted agents, require confirmation |
| Deleting a Prompt referenced by an Agent | Show impacted agents, require confirmation |
| Deleting a Template referenced by a Prompt | Show impacted prompts, require confirmation |

### File Creation Conventions

When Studio creates a new resource:

| Resource | Files created |
|----------|--------------|
| Agent | `{scope}/agents/{name}.yaml` — registry entry only |
| Skill | `{scope}/skills/{name}/SKILL.md` — content file |
| | `{scope}/skills/{name}.yaml` — registry entry |
| Prompt | `{scope}/prompts/{name}.md` — content file |
| | `{scope}/prompts/{name}.yaml` — registry entry |
| Template | `{scope}/templates/{name}.{ext}` — content file in native format |
| | `{scope}/templates/{name}.yaml` — registry entry |
| Tool | `{scope}/tools/{name}.yaml` — registry entry only |

## Consequences

### Positive
- **Single source of truth** — all references are ARNs, all content is in files
- **Queryable graph** — edges enable dependency queries and impact analysis
- **Editor integrity** — editors can detect broken references before save
- **File management** — content files are editable outside Studio

### Negative
- **File management overhead** — creating a resource now involves creating files/directories
- **Edge maintenance** — every save/delete must update edges
- **Migration needed** — existing inline content must be migrated to files

## References

- ADR-0002: ARN Reference System
- ADR-0003: Graph Tables Schema (nodes + edges)
- ADR-0010: Agent Data Model
- ADR-0011: Skill Data Model
- ADR-0012: Prompt Data Model
- ADR-0013: Template Data Model
- ADR-0014: Tool Data Model
