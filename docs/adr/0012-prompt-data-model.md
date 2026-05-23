# ADR-0012: Prompt Data Model

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Agentic Workflow System Design Team

## Context

Prompts are the system instructions that drive agent behavior. The current model is minimal:

| Layer | Fields |
|-------|--------|
| **Backend** (`CreatePromptRequest`) | `name`, `description`, `content` (string), `scope` |
| **Frontend** (`PromptEditorPage`) | `name`, `content` (textarea), `variables[]` (comma-separated) |
| **opencode** | `prompt` field in agent config — a plain string or `{file:/path}` reference |

Problems:
1. No typed input parameters — variables are a flat string list without types
2. No output format specification — agents don't know what structure to produce
3. No template rendering — `{{variable}}` placeholders have no processing
4. No connection to Templates — output format is entirely implicit
5. No `kind` classification — system prompts, user templates, and message templates are all the same

Research into industry best practices (DSPy Signatures, LangChain Structured Output, Semantic Kernel InputVariables) shows a clear pattern: **prompts as typed functions with inputs and optional structured outputs**.

## Decision

We adopt a **prompt-as-function model** where:

1. **Inputs** are inferred automatically from `{{variable}}` placeholders in the content file
2. **Output format** is delegated to a separate Template resource referenced by ARN
3. **Content** lives in a separate file referenced by `content_path`
4. **Kind** classifies the prompt's role

### Complete Field Reference

```yaml
# === Registry metadata ===
arn: arn:local:global:prompt/sdd-explore
name: sdd-explore
description: "System prompt for SDD exploration phase — instructs the agent to investigate codebase and produce structured analysis"
scope: global
namespace: global

# === Classification ===
kind: "system"                                  # system | user | template

# === Content ===
content_path: "prompts/sdd-explore.md"          # File with prompt body and {{variables}}

# === Output format ===
template: "arn:local:global:template/sdd-exploration-output"   # ARN of Template resource (optional)

# === Inputs (inferred from content file) ===
# NOT declared manually. The editor parses the content file for {{variable}}
# patterns and extracts the input list automatically. Shown here for documentation:
#
# inputs: (auto-detected)
#   - name: topic
#     type: string
#     required: true
#   - name: change_name
#     type: string
#     required: false
```

### `content_path` — Prompt Body File

The prompt content lives in a separate markdown file. This file contains:
- The actual prompt text (instructions for the agent)
- `{{variable}}` placeholders for dynamic values
- Standard markdown formatting

Example (`prompts/sdd-explore.md`):

```markdown
You are an SDD executor for the explore phase. Investigate the following topic thoroughly.

## Topic
{{topic}}

{{#if change_name}}
## Change: {{change_name}}
This exploration is tied to change `{{change_name}}`. Create an exploration artifact.
{{/if}}

## Instructions
1. Use CogniCode tools to understand the codebase structure
2. Compare at least 2 approaches
3. Document trade-offs
4. Produce your analysis following the output template
```

**Variable extraction:** The editor scans the file for patterns matching:
- `{{variable_name}}` — simple variable
- `{{#if variable_name}}` — conditional block
- `{{#each variable_name}}` — iteration block

Each unique variable name becomes an input parameter. The editor displays them with type `string` by default, with the option to change to `number`, `boolean`, or `array`.

### `kind` — Prompt Classification

| Kind | Description | Used by |
|------|-------------|---------|
| `system` | Agent system prompt — defines behavior and capabilities | Agent.prompt |
| `user` | User message template — formats user input | Commands, workflows |
| `template` | Generic reusable template — any purpose | Any resource |

### `template` — Output Format Reference

An ARN reference to a Template resource that defines the expected output format. This is optional — not all prompts need structured output.

When present, the agent is instructed to produce output matching the template's format. The Template resource (see ADR-0013) contains the actual format definition in its native file format (markdown, JSON, YAML).

**Example relationship:**

```
Prompt: sdd-explore
  content_path: "prompts/sdd-explore.md"
  template: arn:local:global:template/sdd-exploration-output

Template: sdd-exploration-output
  content_path: "templates/sdd-exploration-output.md"
  format: markdown
  (file contains the output markdown structure with sections)
```

The prompt instructions tell the agent WHAT to do. The template tells it HOW to format the output.

### Auto-Detection of Input Variables

The editor performs real-time variable extraction from the content file:

1. **Parse** — Scan for `{{variable}}`, `{{#if variable}}`, `{{#each variable}}` patterns
2. **Extract** — Collect unique variable names
3. **Infer types** — Default to `string`. User can override to `number`, `boolean`, `array`.
4. **Determine required** — Variables used in `{{variable}}` (not in `{{#if}}`) are required by default.
5. **Display** — Show as an editable table in the editor

The user NEVER manually declares variables. They are always derived from the content.

### Preview

The editor provides a **rendered preview** panel:

1. Left panel: raw content file with syntax highlighting
2. Right panel: rendered preview with sample values filled in
3. Sample values can be edited by the user for testing

### Field Specifications

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `arn` | string | Yes | — | ARN identifier |
| `name` | string | Yes | — | Kebab-case, max 64 chars |
| `description` | string | Yes | — | Human-readable description |
| `scope` | string | Yes | — | `global` or `workspace/{id}` |
| `namespace` | string | Yes | — | Grouping within registry |
| `kind` | string | Yes | `"system"` | `system` \| `user` \| `template` |
| `content_path` | string | Yes | — | Relative path to prompt body file |
| `template` | string | No | `null` | ARN of Template resource for output format |

### What Was Removed from Current Frontend

| Field | Reason |
|-------|--------|
| `content` (inline textarea) | Replaced by `content_path` file reference |
| `variables[]` (manual comma-separated) | Replaced by auto-detection from `{{variable}}` in content |

## Consequences

### Positive
- **Prompt-as-function** — typed inputs with auto-detection
- **Separation of concerns** — prompt instructions separate from output format (Template)
- **Reusable templates** — multiple prompts can share the same output template
- **Preview capability** — rendered preview with sample values
- **File-based editing** — content editable with any markdown editor

### Negative
- **File management** — prompt creation now involves a file, not just a YAML entry
- **Template dependency** — prompts depend on templates existing in the registry
- **Variable extraction complexity** — must handle handlebars-style conditionals and loops

## Backend Changes Required

### `rest_types.rs`

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePromptRequest {
    pub name: String,
    pub description: String,
    pub content_path: Option<String>,           // NEW: file reference
    pub content: Option<String>,                // LEGACY: inline (deprecated)
    pub scope: String,
    pub kind: Option<String>,                   // NEW: system | user | template
    pub template: Option<String>,               // NEW: ARN reference to Template
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdatePromptRequest {
    pub description: Option<String>,
    pub content_path: Option<String>,
    pub content: Option<String>,
    pub kind: Option<String>,
    pub template: Option<String>,
}
```

## References

- ADR-0010: Unified Agent Data Model (agent.prompt references a Prompt)
- ADR-0013: Template Data Model (output format definition)
- [DSPy Signatures](https://dspy.ai/) — typed prompt inputs/outputs
- [LangChain Structured Output](https://python.langchain.com/docs/concepts/structured_outputs/)
- [Semantic Kernel PromptTemplateConfig](https://learn.microsoft.com/en-us/semantic-kernel/)
