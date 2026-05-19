# ADR-0001: SKILL.md Format — Mattpocock Standard

**Status:** Accepted
**Date:** 2025-05-17
**Deciders:** Agentic Workflow System Design Team

## Context

We needed a standardized format for defining agent skills that is:
- Portable across AI coding tools (OpenCode, Claude Code, Codex, Cursor)
- Simple enough for AI agents to parse and understand
- Extensible for complex skills with multiple modules
- Aligned with the emerging industry standard

We evaluated:
- Custom YAML-based format with extensive metadata (gentleman-programming/SDD)
- Mattpocock's SKILL.md format (GitHub: mattpocock/skills)
- TypeScript-based skill definitions
- JSON Schema for skill definitions

## Decision

We adopt the **Mattpocock SKILL.md format** as the standard for portable skills, with extensions for our specific needs.

### Standard Format (mattpocock)

```yaml
---
name: skill-name
description: Brief description of capability. Use when [specific triggers].
---

# Skill Name

## Quick start

[Minimal working example]

## Workflows

[Step-by-step processes with checklists]

## Advanced features

[Link to separate files if needed]
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Skill identifier (lowercase, hyphens) |
| `description` | string | One-line description + "Use when..." triggers (max 1024 chars) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Semantic version (for external skills) |
| `author` | string | Author identifier |
| `modules/` | directory | Additional reference files |

### Directory Structure

```
skill-name/
├── SKILL.md           # Main instructions (required)
├── REFERENCE.md       # Detailed docs (if content > 100 lines)
├── EXAMPLES.md       # Usage examples (if needed)
└── modules/          # Optional sub-modules
    └── strict-tdd.md
```

### Description Requirements

The description is **the only thing the AI agent sees** when deciding which skill to load. Format:
- Max 1024 characters
- First sentence: what the skill does
- Second sentence: "Use when [specific triggers]"

**Good:**
```
Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when user mentions PDFs, forms, or document extraction.
```

**Bad:**
```
Helps with documents.
```

### When to Split Files

Split into separate files when:
- SKILL.md exceeds 100 lines
- Content has distinct domains
- Advanced features are rarely needed

## Consequences

### Positive
- Skills become truly portable across AI coding tools
- AI agents can easily determine when to load a skill based on triggers
- Industry adoption (mattpocock/skills has ~60k newsletter subscribers)
- Simple enough that AI can generate new skills following the format

### Negative
- Loss of some SDD-specific metadata (license, version in frontmatter)
- Less verbose than previous SDD format

### Mitigation
- SDD-specific skills maintain dual format:
  - mattpocock for portability
  - Extended SDD format for opencode-specific features (persistence contracts, MCP tool integrations)
- Skill registry generates compact rules automatically from SKILL.md

## References

- [mattpocock/skills](https://github.com/mattpocock/skills)
- [Mattpocock Skill Writing Guide](https://github.com/mattpocock/skills/tree/main/skills/productivity/write-a-skill)
