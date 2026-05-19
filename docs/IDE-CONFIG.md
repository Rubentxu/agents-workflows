# IDE Configuration Guide

## OpenCode

### Prerequisites
- OpenCode installed
- agents-workflows-server running on localhost:8080

### Configuration

1. Create or edit `~/.opencode/opencode.json`:

```json
{
  "agent": {
    "orchestrator": {
      "description": "Workflow orchestrator - coordinates via MCP",
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
```

2. Copy orchestrator prompt:
```bash
mkdir -p ~/.workflows/global/prompts
cp /path/to/agents-workflows/docs/orchestrator-prompt.md ~/.workflows/global/prompts/orchestrator.md
```

3. Start the server:
```bash
agents-workflows-server start --workspace ~/.workflows
```

4. Restart OpenCode to load the new configuration.

### Testing

```bash
# Verify MCP connection
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"workflow_list","params":{"scope":"global"},"id":1}'

# Check server logs
journalctl -u agents-workflows -f
```

## Claude Code

(WIP - configuration depends on Claude Code's MCP support)

## Codex

(WIP - API-based configuration)

## Troubleshooting

### MCP Connection Failed
- Verify server is running: `curl http://localhost:8080/health`
- Check URL in IDE config matches server port
- Ensure CORS is enabled on server

### Workflow Not Found
- Run `agents-workflows-server init` to create default resources
- Check workflow ARN matches exactly

### State Not Updating
- Server maintains state in memory - restart clears state
- Executions are persisted to SQLite for recovery

## Next Steps

1. Run `agents-workflows-server init` to bootstrap default resources
2. Configure your IDE using the guide above
3. Try: "Run the SDD workflow"
4. Check Studio at http://localhost:8080/studio for visual monitoring
