# ADR-0013: Template Data Model

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Agentic Workflow System Design Team

## Context

Templates define reusable output format specifications. They tell agents and other resources HOW to structure their output — the shape of the response, not the content.

The current `TemplateEditorPage` is minimal: `name`, `targetKind`, `parameters` (JSON textarea), `exampleValues` (JSON textarea). There is no actual template format — just freeform JSON blobs.

The key insight from the grilling session: **a template for markdown output should BE a markdown file, not a YAML description of markdown.** Templates live in their native format with YAML frontmatter for metadata (like SKILL.md files).

## Decision

We adopt a **native-format template model** where each template is a file in its output format (markdown, JSON, YAML, or plain text) with YAML frontmatter for metadata. Variables use `{{variable}}` syntax for dynamic content.

### Template File Examples

#### Markdown Template (`templates/sdd-exploration-output.md`)

```markdown
---
name: sdd-exploration-output
description: "Structured output for SDD exploration phase"
format: markdown
target_kind: prompt
---

## Summary
{{summary}}

## Approach Comparison
{{approach_comparison}}

### Option A: {{option_a_name}}
- Pros: {{option_a_pros}}
- Cons: {{option_a_cons}}

### Option B: {{option_b_name}}
- Pros: {{option_b_pros}}
- Cons: {{option_b_cons}}

## Recommendation
{{recommendation}}

## Risks
{{risks}}

**Confidence:** {{confidence}}/10
```

#### JSON Template (`templates/api-analysis-output.json`)

```json
{
  "analysis": "{{analysis}}",
  "confidence": {{confidence}},
  "decisions": [{{decisions}}],
  "recommendation": "{{recommendation}}",
  "risks": [{{risks}}]
}
```

#### YAML Template (`templates/config-output.yaml`)

```yaml
phases:
{{#each phases}}
  - name: {{this.name}}
    steps:
    {{#each this.steps}}
      - {{this}}
    {{/each}}
{{/each}}
```

#### Plain Text Template (`templates/commit-message.txt`)

```
{{type}}({{scope}}): {{description}}

{{body}}

{{#if breaking_change}}
BREAKING CHANGE: {{breaking_change}}
{{/if}}
```

### Registry Entry

```yaml
# === Registry metadata ===
arn: arn:local:global:template/sdd-exploration-output
name: sdd-exploration-output
description: "Structured output for SDD exploration phase"
scope: global
namespace: global

# === Content ===
content_path: "templates/sdd-exploration-output.md"  # File in native format

# === Classification ===
format: "markdown"              # markdown | json | yaml | text
target_kind: "prompt"           # prompt | agent | skill | tool | any
```

### Frontmatter Fields

The YAML frontmatter in the template file contains:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | — | Template identifier, kebab-case |
| `description` | string | Yes | — | What this template produces |
| `format` | string | Yes | — | `markdown` \| `json` \| `yaml` \| `text` |
| `target_kind` | string | No | `"any"` | What resource type uses this template |

The frontmatter format mirrors SKILL.md frontmatter (ADR-0001) for consistency.

### `format` — Output Format

The format determines how the template content is interpreted:

| Format | File extension | Variable syntax | Structure |
|--------|---------------|-----------------|-----------|
| `markdown` | `.md` | `{{var}}` with handlebars blocks | Sections = headings |
| `json` | `.json` | `{{var}}` for strings, `{{var}}` (unquoted) for numbers | Schema = structure |
| `yaml` | `.yaml` / `.yml` | `{{var}}` inline | Schema = structure |
| `text` | `.txt` | `{{var}}` inline | Freeform |

### `target_kind` — Applicable Resource Types

| Value | Meaning |
|-------|---------|
| `prompt` | Used by Prompt resources as output format |
| `agent` | Used by Agent resources (e.g., agent capability description) |
| `skill` | Used by Skill resources (e.g., skill output format) |
| `tool` | Used by Tool resources (e.g., tool response format) |
| `any` | Can be used by any resource type |

### Variable System

Variables use handlebars-style syntax:

| Pattern | Meaning | Example |
|---------|---------|---------|
| `{{variable}}` | Simple substitution | `{{topic}}` → `"payments module"` |
| `{{#if variable}}...{{/if}}` | Conditional block | Show section only if variable is set |
| `{{#each variable}}...{{/each}}` | Iteration block | Render list items |
| `{{this}}` | Current item in `#each` | Current array element |

**Auto-detection:** The editor scans the template file for `{{variable}}` patterns and extracts the variable list, exactly like the Prompt editor does (ADR-0012).

### Template Reusability

Multiple resources can reference the same template:

```yaml
# Both prompts share the same output template
prompt/sdd-explore:
  template: arn:local:global:template/sdd-exploration-output

prompt/sdd-propose:
  template: arn:local:global:template/sdd-exploration-output
```

This avoids duplicating output format definitions.

### Field Specifications (Registry YAML)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `arn` | string | Yes | — | ARN identifier |
| `name` | string | Yes | — | Kebab-case, max 64 chars |
| `description` | string | Yes | — | Human-readable description |
| `scope` | string | Yes | — | `global` or `workspace/{id}` |
| `namespace` | string | Yes | — | Grouping within registry |
| `content_path` | string | Yes | — | Relative path to template file |
| `format` | string | Yes | — | `markdown` \| `json` \| `yaml` \| `text` |
| `target_kind` | string | No | `"any"` | Applicable resource type |

### No Inheritance

Templates do not extend other templates. If two templates share structure, they either:
1. Are the same template (shared by reference)
2. Are separate templates (duplicated sections)

This keeps the model simple and avoids the complexity of template inheritance resolution.

### What Was Removed from Current Frontend

| Field | Reason |
|-------|--------|
| `parameters` (JSON textarea) | Replaced by `content_path` file in native format |
| `exampleValues` (JSON textarea) | Replaced by preview panel with sample values |
| `targetKind` (select) | Kept as `target_kind` but now in frontmatter |

## Consequences

### Positive
- **Native format editing** — markdown templates ARE markdown, JSON templates ARE JSON
- **Immediate visual feedback** — what you see IS the output format
- **Reusable** — multiple prompts/resources share templates via ARN
- **Consistent with SKILL.md** — same frontmatter pattern
- **Simple** — no inheritance, no meta-description layer

### Negative
- **File management** — template creation involves a file, not just a YAML entry
- **Format-specific editors** — JSON templates need different highlighting than markdown
- **Variable extraction varies** — different patterns per format type

## Backend Changes Required

### `rest_types.rs` (new DTOs — no existing template DTOs)

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTemplateRequest {
    pub name: String,
    pub description: String,
    pub content_path: String,                   // File in native format
    pub format: String,                          // markdown | json | yaml | text
    pub target_kind: Option<String>,             // prompt | agent | skill | tool | any
    pub scope: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateTemplateRequest {
    pub description: Option<String>,
    pub content_path: Option<String>,
    pub format: Option<String>,
    pub target_kind: Option<String>,
}
```

## References

- ADR-0001: SKILL.md Format (frontmatter convention)
- ADR-0012: Prompt Data Model (template ARN reference)
- [Handlebars templating](https://handlebarsjs.com/)
