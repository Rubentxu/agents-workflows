# ADR-0014: Tool Data Model

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Agentic Workflow System Design Team

## Context

Tools are the atomic capabilities that agents use to interact with the world — bash commands, file operations, MCP tools, etc. The current state:

| Layer | State |
|-------|-------|
| **Backend** | No CRUD endpoints for tools — no `CreateToolRequest`, no `list_tools`, no REST routes |
| **Frontend** (`ToolEditorPage`) | `name`, `description`, `schema` (JSON textarea) — non-functional, no backend connection |
| **Catalog** | `ToolsCatalog` uses `emptyFetch` — shows "not yet connected" notice |

Tools exist in two realities:
1. **MCP servers** expose tools at runtime — agents discover them dynamically
2. **Registry metadata** describes tools for catalog, search, and permission management

We need the registry to contain tool descriptions so that:
- The Studio catalog shows available tools
- Agent editors can browse and select tools by name
- Permission rules can reference tools by ARN
- Skills can declare `required_tools` by name (ADR-0011)

## Decision

We adopt a **dual-source tool model**: tools are either discovered from MCP servers (catalog) or defined as custom tools with implementation paths.

### Complete Field Reference

```yaml
# === Registry metadata ===
arn: arn:local:global:tool/chronos_debug_run
name: chronos_debug_run
description: "Run a program under Chronos instrumentation for time-travel debugging"
scope: global
namespace: global

# === Source ===
source: "mcp://chronos"                        # Where this tool comes from
source_type: "mcp"                              # mcp | builtin | custom

# === Input schema ===
input_schema:                                   # JSON Schema describing the tool's input
  type: object
  properties:
    program:
      type: string
      description: "Path to the target binary"
    args:
      type: array
      items:
        type: string
      description: "Command-line arguments"
    timeout:
      type: integer
      description: "Timeout in milliseconds"
      default: 120000
  required:
    - program

# === Output schema (optional) ===
output_schema:
  type: object
  properties:
    session_id:
      type: string
      description: "Session identifier for querying results"
    status:
      type: string
      enum: [completed, failed, timeout]

# === Classification ===
category: "debugging"                           # Grouping for catalog filtering
tags:
  - "chronos"
  - "debug"
  - "tracing"
  - "time-travel"

# === Custom tool implementation (only for source_type: custom) ===
# implementation_path: "tools/chronos-wrapper.sh"   # Path to script/binary
# runtime: "bash"                                     # bash | node | python
```

### `source_type` — Tool Origin

| Type | Description | `source` format | Example |
|------|-------------|-----------------|---------|
| `mcp` | Tool exposed by an MCP server | `mcp://{server-name}` | `mcp://chronos` |
| `builtin` | Built-in opencode tool | `builtin://{tool-name}` | `builtin://bash` |
| `custom` | User-defined tool with implementation | `custom://{name}` | `custom://my-script` |

#### MCP Tools

MCP tools are discovered from MCP servers configured in `opencode.json`. The tool name matches the MCP-exposed name. The registry entry is a **description** — the actual implementation lives in the MCP server.

When Studio starts, it can optionally sync tool descriptions from connected MCP servers into the registry.

#### Built-in Tools

These are the standard opencode tools that don't need MCP:

| Tool Name | Description |
|-----------|-------------|
| `bash` | Execute shell commands |
| `read` | Read file contents |
| `edit` | Edit files with string replacement |
| `write` | Write files |
| `glob` | Find files by pattern |
| `grep` | Search file contents |
| `list` | List directory contents |
| `task` | Launch sub-agent (synchronous) |
| `delegate` | Launch sub-agent (asynchronous) |
| `webfetch` | Fetch URL content |
| `websearch` | Search the web |
| `skill` | Load a skill |
| `question` | Ask the user a question |
| `todowrite` | Manage todo lists |
| `lsp` | LSP operations |

These are pre-seeded in the registry with descriptions and input schemas.

#### Custom Tools

Custom tools have an `implementation_path` pointing to a script or program. When invoked, opencode runs the script and captures output.

```yaml
arn: arn:local:global:tool/my-linter
name: my-linter
description: "Run project-specific linting rules"
source: "custom://my-linter"
source_type: "custom"
implementation_path: "tools/my-linter.sh"
runtime: "bash"
input_schema:
  type: object
  properties:
    path:
      type: string
      description: "File or directory to lint"
  required: [path]
category: "quality"
tags: ["linter", "custom"]
```

### `input_schema` — Input Validation

A JSON Schema object describing the tool's input parameters. This serves multiple purposes:

1. **Agent editor** — shows what parameters a tool accepts when configuring permissions
2. **Validation** — agents can validate inputs before calling the tool
3. **Documentation** — the Studio catalog displays parameter descriptions

The schema follows standard JSON Schema draft 2020-12.

### `output_schema` — Output Description (Optional)

A JSON Schema describing what the tool returns. Not all tools have structured output, so this is optional.

### `category` — Catalog Grouping

Categories provide high-level grouping in the Studio tool catalog:

| Category | Examples |
|----------|----------|
| `core` | bash, read, edit, write |
| `search` | glob, grep, semantic_search |
| `debugging` | chronos_debug_run, chronos_debug_find_crash |
| `quality` | cognicode_check_architecture, quality_analyze_file |
| `code-intelligence` | cognicode_build_graph, cognicode_get_call_hierarchy |
| `testing` | chronos_probe_start, smoke_check |
| `memory` | mem_save, mem_search, mem_context |
| `web` | webfetch, websearch |
| `mcp` | delegate, task |
| `custom` | user-defined tools |

### `tags` — Fine-Grained Filtering

Arbitrary string tags for search and filtering. Tags complement categories with more specific labels.

### Field Specifications

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `arn` | string | Yes | — | ARN identifier |
| `name` | string | Yes | — | Tool name (matches MCP/builtin name) |
| `description` | string | Yes | — | What the tool does |
| `scope` | string | Yes | — | `global` or `workspace/{id}` |
| `namespace` | string | Yes | — | Grouping within registry |
| `source` | string | Yes | — | Origin: `mcp://`, `builtin://`, `custom://` |
| `source_type` | string | Yes | — | `mcp` \| `builtin` \| `custom` |
| `input_schema` | object | No | `null` | JSON Schema for input parameters |
| `output_schema` | object | No | `null` | JSON Schema for output |
| `category` | string | No | `"custom"` | Catalog grouping |
| `tags` | string[] | No | `[]` | Search/filter labels |
| `implementation_path` | string | No | `null` | Script path (custom tools only) |
| `runtime` | string | No | `null` | `bash` \| `node` \| `python` (custom only) |

### What Was Removed from Current Frontend

| Field | Reason |
|-------|--------|
| `schema` (freeform JSON textarea) | Replaced by structured `input_schema` with JSON Schema validation |

## Consequences

### Positive
- **Complete tool catalog** — Studio shows all available tools with descriptions
- **MCP integration** — tools can be synced from MCP server manifests
- **Agent tool selection** — agent editor shows browsable tool list
- **Skill tool requirements** — skills declare required_tools that match tool names
- **Custom tools** — users can define project-specific tools

### Negative
- **New CRUD required** — backend has no tool endpoints at all
- **MCP sync complexity** — auto-discovering tools from MCP servers requires introspection
- **Seed data** — built-in tools must be pre-seeded in the registry

## Backend Changes Required

### New REST endpoints needed

```
POST   /api/tools              — Create tool
GET    /api/tools              — List tools (with category/tag filters)
GET    /api/tools/{arn}        — Get tool details
PUT    /api/tools/{arn}        — Update tool
DELETE /api/tools/{arn}        — Delete tool
```

### `rest_types.rs` (new DTOs)

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateToolRequest {
    pub name: String,
    pub description: String,
    pub source: String,                              // mcp:// | builtin:// | custom://
    pub source_type: String,                         // mcp | builtin | custom
    pub input_schema: Option<serde_json::Value>,     // JSON Schema
    pub output_schema: Option<serde_json::Value>,    // JSON Schema
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub implementation_path: Option<String>,         // custom only
    pub runtime: Option<String>,                     // custom only
    pub scope: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateToolRequest {
    pub description: Option<String>,
    pub input_schema: Option<serde_json::Value>,
    pub output_schema: Option<serde_json::Value>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub implementation_path: Option<String>,
    pub runtime: Option<String>,
}
```

### Seed Data

On first startup, the registry should seed built-in tools:

```yaml
arn: arn:local:global:tool/bash
name: bash
description: "Execute shell commands"
source: "builtin://bash"
source_type: "builtin"
category: "core"
input_schema:
  type: object
  properties:
    command: { type: string, description: "Shell command to execute" }
  required: [command]
```

## References

- ADR-0008: Rich MCP Orchestration API (tool_list, tool_get)
- ADR-0010: Unified Agent Data Model (tools Record, permission)
- ADR-0011: Skill Data Model (required_tools references tool names)
- [MCP Protocol Tool Schema](https://modelcontextprotocol.io/docs/concepts/tools)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-core)
