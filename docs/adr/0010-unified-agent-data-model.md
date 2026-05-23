# ADR-0010: Unified Agent Data Model

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Agentic Workflow System Design Team

## Context

We need a professional Agent editor in Studio that covers all aspects of agent configuration. The current Agent data model is misaligned across three layers:

| Layer | Model | Fields |
|-------|-------|--------|
| **opencode `AgentConfig`** (source of truth for runtime) | `provider/model`, `prompt` (single string), `tools` (Record), `permission`, `temperature`, `top_p`, `steps`, `mode`, `hidden`, `color`, `options`, `variant` | 14 fields |
| **Backend REST DTO** (`CreateAgentRequest`) | `scope`, `name`, `description`, `model`, `skills[]`, `tools[]` | 6 fields |
| **Frontend editor** (`AgentEditorPage`) | `name`, `description`, `model`, `provider`, `skills[]`, `prompts[]`, `tools[]`, `timeout_ms` | 8 fields |

Problems:
1. Frontend has `provider` as separate field — opencode uses `provider/model` format
2. Frontend has `prompts[]` (list) — backend doesn't accept it, opencode uses single `prompt` string
3. Frontend has `timeout_ms` — doesn't exist in opencode (timeout is provider-level)
4. Backend `tools` is `Vec<String>` — opencode uses `Record<string, boolean>`
5. Missing fields: `variant`, `temperature`, `top_p`, `steps`, `mode`, `hidden`, `color`, `permission`, `options`
6. `permission` is a full granular system with glob patterns — completely absent from backend and frontend

## Decision

We adopt the **opencode `AgentConfig` schema as the base** and extend it with our registry-specific fields. The Agent YAML in our registry is a **strict superset** of opencode's `AgentConfig`.

### Complete Field Reference

```yaml
# === Registry metadata (our extensions) ===
arn: arn:local:global:agent/orchestrator       # Required. ARN identifier.
name: orchestrator                              # Required. Kebab-case, max 64 chars.
description: "Workflow orchestrator agent..."    # Required. Human-readable.
scope: global                                   # Required. global | workspace/{id}
namespace: global                               # Required. Grouping within registry.

# === opencode AgentConfig fields ===
model: "minimax-coding-plan/MiniMax-M2.7-highspeed"  # provider/model-id format.
variant: null                                         # Optional. Model variant.
temperature: null                                     # Optional. 0.0-2.0. Sampling randomness.
top_p: null                                           # Optional. 0.0-1.0. Nucleus sampling.
prompt: "arn:local:global:prompt/sdd-orchestrator"    # ARN of Prompt resource. Single reference.
mode: "primary"                                       # primary | subagent | all
hidden: false                                         # Hide from autocomplete (subagent only).
steps: 50                                             # Max agentic iterations.
color: "primary"                                      # Hex (#FF5733) or theme color.
options: {}                                           # Arbitrary passthrough to provider.

# === Tools (deprecated in opencode but still functional) ===
tools:                                                # Record<string, boolean>
  bash: true
  edit: true
  read: true
  delegate: true
  workflow_execute: true
  workflow_update_state: true

# === Permissions (modern replacement for tools) ===
permission:
  task:
    "*": "deny"
    "sdd-*": "allow"
  edit: "allow"
  bash:
    "*": "ask"
    "git *": "allow"

# === Skills (our extension — opencode loads skills dynamically) ===
skills:
  - arn:local:global:skill/sdd-explore
  - arn:local:global:skill/sdd-apply
```

### Field Specifications

#### `model` — Provider/Model Identifier

Format: `{provider-id}/{model-id}`

The provider is inferred from the prefix. No separate `provider` field exists.

Examples:
- `minimax-coding-plan/MiniMax-M2.7-highspeed`
- `anthropic/claude-sonnet-4-20250514`
- `openai/gpt-4o`
- `deepseek/deepseek-v4-pro`
- `ollama/llama3`

#### `prompt` — System Prompt Reference

A single ARN reference to a Prompt resource in the registry. NOT a list. NOT a file path.

The Prompt resource contains the actual instructions. This separation allows:
- Editing the prompt independently via PromptEditorPage
- Multiple agents sharing the same prompt
- The agent editor to show prompt metadata without loading full content

#### `tools` — Tool Enable/Disable Map

Type: `Record<string, boolean>` — a map of tool names to enabled state.

Tool names are:
- Built-in tools: `bash`, `read`, `edit`, `write`, `glob`, `grep`, `list`, `task`, `delegate`, `webfetch`, `websearch`, `skill`, `question`, `todowrite`, `lsp`
- MCP tools: `chronos_debug_run`, `cognicode_build_graph`, etc.
- Wildcards supported: `"chronos_*": true`

This is **deprecated in opencode** in favor of `permission` but still functional. Our editor supports both.

#### `permission` — Granular Permission Control

Type: `PermissionConfig` — either a shorthand string or a granular object.

Shorthand: `"allow"` | `"ask"` | `"deny"` applied to all tools.

Object form with glob patterns (last matching rule wins):

| Key | Tools Gated | Granular? |
|-----|-------------|-----------|
| `read` | `read` | Yes (file path) |
| `edit` | `write`, `edit`, `apply_patch` | Yes (file path) |
| `glob` | `glob` | Yes (pattern) |
| `grep` | `grep` | Yes (regex) |
| `bash` | `bash` | Yes (command) |
| `task` | `task` (subagent invocation) | Yes (agent name glob) |
| `external_directory` | Any tool outside project | Yes (path) |
| `todowrite` | `todowrite`, `todoread` | No |
| `webfetch` | `webfetch` | No |
| `websearch` | `websearch` | No |
| `lsp` | `lsp` | Yes |
| `skill` | `skill` | Yes (skill name) |

#### `steps` — Maximum Agentic Iterations

Replaces `timeout_ms`. An agent performs at most N iterations (tool calls) before being forced into text-only summary mode. This is more predictable than wall-clock timeouts.

There is NO per-agent timeout field. Timeout is configured at the provider level.

#### `skills` — Skill ARN References

Our extension. Opencode loads skills dynamically via the `skill` tool. Our system registers skills as first-class resources with ARNs.

When an agent binds a skill via ARN, the agent's effective `tools` list MUST include the skill's `required_tools`. The editor enforces this automatically.

#### `mode` — Agent Type

| Mode | Meaning |
|------|---------|
| `primary` | User-facing agent (switch with Tab). Can invoke subagents. |
| `subagent` | Invoked by primary agents via Task tool or `@mention`. |
| `all` | Both primary and subagent. |

#### `hidden` — Visibility

Only meaningful for `mode: subagent`. Hidden agents don't appear in `@` autocomplete but can still be invoked programmatically.

#### `color` — Visual Identity

Either a hex color (`#FF5733`) or a theme color: `primary`, `secondary`, `accent`, `success`, `warning`, `error`, `info`.

#### `options` — Provider Passthrough

Arbitrary key-value pairs passed directly to the AI provider as model options. Examples:
- `reasoningEffort: "high"` (OpenAI)
- `textVerbosity: "low"` (OpenAI)

### What Was Removed from Current Frontend

| Field | Reason |
|-------|--------|
| `provider` (separate) | Merged into `model` as `provider/model` format |
| `prompts[]` (list) | Replaced by single `prompt` ARN reference |
| `timeout_ms` | Replaced by `steps` (iteration limit) |

## Consequences

### Positive
- **Full alignment with opencode** — configs generated by Studio work directly in opencode
- **Richer agent configuration** — temperature, permissions, steps, mode, etc.
- **Proper ARN references** — prompt is a reference, not embedded content
- **Granular permissions** — production-grade control over tool access

### Negative
- **Backend migration required** — `CreateAgentRequest` and `UpdateAgentRequest` must expand significantly
- **Frontend rewrite** — AgentEditorPage goes from 224 lines to ~600+ lines with full form
- **`tools` type change** — `Vec<String>` → `HashMap<String, bool>` in Rust DTOs

## Backend Changes Required

### `rest_types.rs`

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateAgentRequest {
    pub scope: String,
    pub name: String,
    pub description: String,
    pub model: String,                                     // provider/model format
    pub prompt: Option<String>,                            // ARN reference
    pub skills: Vec<String>,                               // ARN references
    pub tools: std::collections::HashMap<String, bool>,    // Record<string, boolean>
    pub permission: Option<serde_json::Value>,             // PermissionConfig
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub steps: Option<u32>,
    pub mode: Option<String>,                              // primary | subagent | all
    pub hidden: Option<bool>,
    pub color: Option<String>,
    pub variant: Option<String>,
    pub options: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateAgentRequest {
    pub description: Option<String>,
    pub model: Option<String>,
    pub prompt: Option<String>,
    pub skills: Option<Vec<String>>,
    pub tools: Option<std::collections::HashMap<String, bool>>,
    pub permission: Option<serde_json::Value>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub steps: Option<u32>,
    pub mode: Option<String>,
    pub hidden: Option<bool>,
    pub color: Option<String>,
    pub variant: Option<String>,
    pub options: Option<serde_json::Value>,
}
```

## References

- [opencode AgentConfig JSON Schema](https://opencode.ai/config.json) — `$defs/AgentConfig`
- [opencode Agent Documentation](https://opencode.ai/docs/agents)
- ADR-0002: ARN Reference System
- ADR-0003: Graph Tables Schema
- ADR-0006: Multi-Workspace ARN System
