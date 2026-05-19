# Quickstart Guide — agents-workflows

Get up and running with the agents-workflows system in under 10 minutes.

**Goal**: Run your first workflow from OpenCode IDE.

---

## Prerequisites

- **Rust** (stable) — [Install via rustup](https://rustup.rs)
- **Git**
- **OpenCode** or **Claude Code**
- **Linux** — This guide assumes Linux

---

## Step 1: Build & Install (5 min)

```bash
$ git clone https://github.com/your-org/agents-workflows.git
$ cd agents-workflows
$ just build
$ just install
```

Expected output:
```
Built: target/release/workflow-mcp
Installed to ~/.local/bin/workflow-mcp
```

### Verify Installation

```bash
$ workflow-mcp --version
```

---

## Step 2: Initialize Workspace (1 min)

```bash
$ workflow-mcp init
```

This creates `~/.workflows/global/` with:

```
~/.workflows/global/
├── registry.db          # SQLite database
├── workflows/           # Workflow definitions
├── agents/              # Agent definitions
├── skills/              # Skills
└── prompts/             # Prompts
```

---

## Step 3: Start Server

Choose one option:

### Option A: Manual (foreground)

For development and testing:

```bash
$ just run
```

The server starts on ports:
- `8080` — MCP HTTP Stream
- `8081` — REST API
- `8082` — Studio UI (embedded React)

### Option B: Systemd Socket (background, on-demand)

For persistent setup with socket activation:

```bash
$ just setup-user-service
$ just enable
```

**Socket activation**: Server starts automatically when a client connects.

To check status:
```bash
$ just status
```

To view logs:
```bash
$ just logs
```

---

## Step 4: Configure OpenCode

### 4.1 Copy Orchestrator Prompt

```bash
$ mkdir -p ~/.workflows/global/prompts
$ cp docs/orchestrator-prompt.md ~/.workflows/global/prompts/orchestrator.md
```

### 4.2 Create OpenCode Configuration

```bash
$ mkdir -p ~/.opencode
$ cat > ~/.opencode/opencode.json << 'EOF'
{
  "agent": {
    "orchestrator": {
      "description": "Workflow orchestrator",
      "mode": "primary",
      "model": "minimax-coding-plan/MiniMax-M2.7-highspeed",
      "prompt": "{file:$HOME/.workflows/global/prompts/orchestrator.md}",
      "tools": {
        "bash": true,
        "read": true,
        "write": true,
        "edit": true,
        "delegate": true
      }
    }
  },
  "mcp": {
    "agents-workflows": {
      "type": "remote",
      "url": "http://localhost:8080/mcp"
    }
  }
}
EOF
```

### 4.3 Restart OpenCode

Close and reopen OpenCode to load the new configuration.

---

## Step 5: First Workflow

### 5.1 List Available Workflows

From OpenCode, ask the orchestrator:

> "What workflows are available?"

The orchestrator will query the MCP and return a list.

### 5.2 Execute the SDD Workflow

> "Run the SDD workflow"

The orchestrator will:
1. Find the default workflow (`arn:local:global:workflow/sdd-full`)
2. Execute it via MCP
3. Return an execution ARN

### 5.3 What Happens During Execution

```
┌─────────────────────────────────────────────────────┐
│  Workflow Execution Flow                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  explore → propose → spec → design → tasks →      │
│  apply → verify → archive                         │
│                                                     │
│  Each stage:                                       │
│  1. Orchestrator queries workflow_get_next_stage   │
│  2. Delegates work via IDE                         │
│  3. Receives result                                │
│  4. Updates state via workflow_update_state        │
│  5. Logs insight via insights_log                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.4 Monitor Execution

Ask the orchestrator:

> "What's the status of my execution?"

Or check via Studio UI (see Step 6).

---

## Step 6: Visual Monitoring

Open your browser to:

```
http://localhost:8080/studio
```

### Dashboard Features

- **Workflows** — View and manage workflow definitions
- **Executions** — Monitor running and completed executions
- **Artifacts** — Browse outputs from each stage
- **Insights** — View structured logs for debugging

---

## Troubleshooting

### Server Won't Start

```bash
# Check if port is already in use
$ ss -tlnp | grep 8080

# Kill existing process if needed
$ pkill -f workflow-mcp

# Try running manually to see errors
$ just run
```

### MCP Connection Failed

1. Verify server is running:
   ```bash
   $ curl http://localhost:8080/health
   ```

2. Check URL in `~/.opencode/opencode.json`:
   ```json
   "url": "http://localhost:8080/mcp"
   ```

3. Restart server and try again

### Workflow Not Found

```bash
# Re-initialize workspace
$ workflow-mcp init

# List workflows via API
$ curl http://localhost:8081/api/workflows
```

### State Not Updating

- Server maintains state in memory during execution
- Executions are persisted to SQLite for recovery
- Restart the server if state seems stuck

---

## Next Steps

### Explore Available Skills

The system includes SDD (Spec-Driven Development) skills:

- **sdd-explore** — Investigate codebase before changes
- **sdd-propose** — Create change proposals
- **sdd-spec** — Write specifications
- **sdd-design** — Create technical designs
- **sdd-tasks** — Break down into implementation tasks
- **sdd-apply** — Implement changes
- **sdd-verify** — Validate implementation

### Create Custom Workflow

1. Define workflow in `~/.workflows/global/workflows/`
2. Use the ARN format: `arn:local:global:workflow/{name}`
3. Register in the SQLite registry

### Set Up Claude Code

See [IDE-CONFIG.md](IDE-CONFIG.md) for Claude Code configuration.

### Read More Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design overview |
| [REST-API.md](REST-API.md) | REST API reference |
| [MCP-API.md](MCP-API.md) | MCP tools reference |
| [INSTALL.md](INSTALL.md) | Full installation guide |
| [WORKSPACES.md](WORKSPACES.md) | Workspace structure |

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `just build` | Build release binary |
| `just install` | Install to ~/.local/bin |
| `just init` | Initialize workspace |
| `just run` | Start server (foreground) |
| `just enable` | Enable systemd socket |
| `just status` | Check service status |
| `just logs` | View service logs |
| `just health` | Check server health |

### Key Paths

- Binary: `~/.local/bin/workflow-mcp`
- Workspace: `~/.workflows/global/`
- Config: `~/.opencode/opencode.json`
- Logs: `journalctl --user -u agents-workflows -f`
