# ADR-0011: Skill Data Model

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Agentic Workflow System Design Team

## Context

Skills are the primary mechanism for giving agents domain-specific capabilities. ADR-0001 adopted the Mattpocock SKILL.md format. However, the current Skill data model is minimal:

| Layer | Fields |
|-------|--------|
| **Backend** (`CreateSkillRequest`) | `name`, `description`, `content`, `triggers[]`, `scope` |
| **Frontend** (`SkillEditorPage`) | `name`, `instructions` (textarea), `triggers[]` (comma-separated) |
| **Mattpocock format** (ADR-0001) | `name`, `description`, `version`, `author`, modules/ |

Problems:
1. Large skill content stored inline in YAML — unwieldy to edit
2. No declaration of tool dependencies — agents don't know what tools a skill needs
3. No cross-skill references — skills can't declare dependencies on other skills
4. Missing metadata: `version`, `author`, `license`
5. `triggers` is a flat string array — no structured discovery metadata
6. No `content_path` — content should be in a separate SKILL.md file

## Decision

We adopt a **file-referenced skill model** where the skill content lives in a separate SKILL.md file and the YAML registry entry holds metadata, references, and tool requirements.

### Complete Field Reference

```yaml
# === Registry metadata ===
arn: arn:local:global:skill/sdd-explore
name: sdd-explore                              # Kebab-case, max 64 chars.
description: >                                 # Max 1024 chars. Follows Mattpocock format:
  Explore and investigate ideas before           First sentence: what the skill does.
  committing to a change. Use when starting      Second sentence: "Use when [triggers]".
  a new feature or investigating a bug.
scope: global                                  # global | workspace/{id}
namespace: global

# === Content ===
content_path: "skills/sdd-explore/SKILL.md"    # Path to SKILL.md file.

# === Metadata (Mattpocock extensions) ===
version: "2.0.0"                               # Semantic versioning.
author: "gentleman-programming"                 # Author identifier.
license: "MIT"                                  # License identifier.

# === Triggers (for agent discovery) ===
triggers:
  - "explore codebase"
  - "investigate feature"
  - "think through ideas"

# === Cross-skill references ===
references:
  - arn:local:global:skill/_shared             # Shared modules this skill uses.

# === Tool dependencies ===
required_tools:                                 # Tools this skill NEEDS to function.
  - bash                                        # Agents binding this skill MUST
  - read                                        # include these in their tools map.
  - cognicode_build_graph
  - cognicode_semantic_search
```

### `content_path` — File Reference Convention

The skill content lives in a separate file, NOT inline in the YAML.

**Convention:**
```
~/.workflows/global/skills/
  sdd-explore/
    SKILL.md              # Main instructions (required)
    REFERENCE.md          # Detailed docs (if > 100 lines)
    EXAMPLES.md           # Usage examples (optional)
    modules/              # Sub-modules (optional)
      strict-tdd.md
```

The `content_path` is relative to the registry root (`~/.workflows/{scope}/`).

**Why file reference instead of inline:**
- Skills routinely exceed 200 lines of markdown — unwieldy in YAML
- SKILL.md can be edited with any markdown editor
- Aligns with Mattpocock directory structure convention
- Enables `REFERENCE.md` and `EXAMPLES.md` for large skills

### `required_tools` — Tool Dependency Declaration

A skill declares the tools it needs to function. This is critical for the Agent editor:

**Rule:** When an agent binds a skill via ARN, the agent's effective `tools` map MUST include all of the skill's `required_tools`. The editor enforces this by:

1. When a skill is added to an agent → merge `required_tools` into the agent's `tools` map
2. When a skill is removed from an agent → show warning if other skills still need those tools
3. In the agent editor → display which tools come from which skill (provenance)

**Example interaction:**

Agent has `tools: { bash: true, read: true }`. User adds skill `sdd-explore` which requires `[bash, read, cognicode_build_graph]`. The editor automatically adds `cognicode_build_graph: true` to the agent's tools and shows:

```
✓ bash          (from agent)
✓ read          (from agent)  
✓ cognicode_build_graph   (auto-added from skill: sdd-explore)
```

### `references` — Cross-Skill Dependencies

Skills can reference other skills via ARN. This enables:

1. **Shared modules** — `_shared` skill with common instructions
2. **Skill composition** — a meta-skill that orchestrates multiple sub-skills
3. **Graph resolution** — the registry builds edges from these references

**Dual resolution:** References are resolved two ways:
- **Explicit:** The `references` list in the YAML
- **Graph edges:** The registry creates `references` edges (ADR-0003) from the ARN list

If a referenced skill is deleted, the editor shows a validation warning.

### `triggers` — Discovery Metadata

Triggers are used by agents to decide when to load a skill. The format follows Mattpocock convention:

1. First sentence: what the skill does
2. Second sentence: "Use when [specific triggers]"

The `triggers` array provides the machine-readable version for programmatic matching.

### Field Specifications

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `arn` | string | Yes | — | ARN identifier |
| `name` | string | Yes | — | Kebab-case, max 64 chars |
| `description` | string | Yes | — | Max 1024 chars, Mattpocock format |
| `scope` | string | Yes | — | `global` or `workspace/{id}` |
| `namespace` | string | Yes | — | Grouping within registry |
| `content_path` | string | Yes | — | Relative path to SKILL.md |
| `version` | string | No | `"1.0.0"` | Semantic version |
| `author` | string | No | `null` | Author identifier |
| `license` | string | No | `null` | License identifier |
| `triggers` | string[] | No | `[]` | Trigger phrases for agent discovery |
| `references` | string[] | No | `[]` | ARNs of referenced skills |
| `required_tools` | string[] | No | `[]` | Tool names this skill requires |

### What Was Removed from Current Frontend

| Field | Reason |
|-------|--------|
| `instructions` (inline textarea) | Replaced by `content_path` file reference |
| `triggers` (comma-separated input) | Replaced by structured tag editor |

## Consequences

### Positive
- **Professional skill editing** — SKILL.md files editable with any markdown editor
- **Tool dependency tracking** — agents auto-acquire required tools from skills
- **Cross-skill references** — enables shared modules and composition
- **Mattpocock alignment** — directory structure matches industry standard
- **Graph edges** — references create queryable edges in the registry

### Negative
- **File management** — creating a skill now creates a directory + file, not just a YAML entry
- **More complex editor** — SkillEditorPage must handle file preview, trigger tags, tool badges
- **Tool merge logic** — Agent editor must implement required_tools merge

## Backend Changes Required

### `rest_types.rs`

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSkillRequest {
    pub name: String,
    pub description: String,
    pub content_path: Option<String>,           // NEW: file reference
    pub content: Option<String>,                // LEGACY: inline content (deprecated)
    pub triggers: Vec<String>,
    pub scope: String,
    pub version: Option<String>,                // NEW
    pub author: Option<String>,                 // NEW
    pub license: Option<String>,                // NEW
    pub references: Vec<String>,                // NEW: ARN references
    pub required_tools: Vec<String>,            // NEW: tool dependencies
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateSkillRequest {
    pub description: Option<String>,
    pub content_path: Option<String>,
    pub content: Option<String>,
    pub triggers: Option<Vec<String>>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub references: Option<Vec<String>>,
    pub required_tools: Option<Vec<String>>,
}
```

## References

- ADR-0001: SKILL.md Format — Mattpocock Standard
- ADR-0003: Graph Tables Schema (edges for references)
- ADR-0010: Unified Agent Data Model (required_tools merge)
- [mattpocock/skills](https://github.com/mattpocock/skills)
