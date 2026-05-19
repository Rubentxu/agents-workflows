# Linux Service Installation Guide

**Version:** 1.0.0
**Date:** 2025-05-17
**Status:** Production Ready

---

## Overview

This guide covers installing and running the agents-workflows binary as a systemd service on Linux. The service supports **socket activation**, which starts the server only when a client connects—providing fast startup and efficient resource usage.

**Key benefits of socket activation:**
- Service starts on-demand when a client connects
- Faster cold starts (no waiting for binary initialization)
- Lower resource usage when idle
- Automatic restart on unexpected termination

---

## Binary Installation

### Build from Source

Requires Rust toolchain (rustc, cargo):

```bash
# Clone or navigate to the project directory
cd /path/to/agents-workflows

# Build release binary
cargo build --release

# Binary location: target/release/agents-workflows-server
```

### Install Binary

Choose one of the following installation methods:

**Option A: User-level installation (recommended for development)**

```bash
# Create bin directory if it doesn't exist
mkdir -p ~/.local/bin

# Copy binary
cp target/release/agents-workflows-server ~/.local/bin/

# Add to PATH (add to ~/.bashrc or ~/.zshrc if needed)
export PATH="$HOME/.local/bin:$PATH"
```

**Option B: System-wide installation**

```bash
# Requires root privileges
sudo cp target/release/agents-workflows-server /usr/local/bin/

# Verify
agents-workflows-server --version
```

### Verify Installation

```bash
# Check binary is executable
ls -la ~/.local/bin/agents-workflows-server
# or
ls -la /usr/local/bin/agents-workflows-server

# Test binary runs
agents-workflows-server --help
```

---

## Workspace Initialization

Before running the service, initialize the workspace directory:

```bash
# Initialize default workspace structure
agents-workflows-server init

# Creates ~/.workflows/ with:
#   global/registry.db          SQLite database
#   global/workflows/           Workflow definitions
#   global/agents/              Agent definitions
#   global/skills/              Skills
#   global/prompts/             Prompts
```

**Note:** The systemd services below include `ExecStartPre` to run initialization automatically on first start.

---

## Systemd User Service

Run the service under your user account. Suitable for single-user development machines.

### Service File

Create `~/.config/systemd/user/agents-workflows.service`:

```ini
[Unit]
Description=Agents Workflows Server (User Service)
Documentation=https://github.com/your-org/agents-workflows/docs/INSTALL.md
After=network.target

[Service]
Type=simple
ExecStartPre=/home/YOUR_USERNAME/.local/bin/agents-workflows-server init
ExecStart=/home/YOUR_USERNAME/.local/bin/agents-workflows-server
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

# Environment
Environment="RUST_LOG=info"

# Working directory
WorkingDirectory=/home/YOUR_USERNAME

[Install]
WantedBy=default.target
```

**Adjust paths:**
- Replace `YOUR_USERNAME` with your actual username
- Or use `$HOME` if your shell expands it correctly in systemd unit files

### Socket Unit (for on-demand activation)

Create `~/.config/systemd/user/agents-workflows.socket`:

```ini
[Unit]
Description=Agents Workflows Server Socket (User)
PartOf=agents-workflows.service

[Socket]
ListenStream=127.0.0.1:8080
ListenStream=127.0.0.1:8081

# Socket activation port configuration
# Port 8080: MCP HTTP Stream
# Port 8081: REST API
# Port 8082: Studio UI

[Install]
WantedBy=sockets.target
```

### Enable and Start

```bash
# Reload systemd to recognize new unit files
systemctl --user daemon-reload

# Enable socket activation (starts on first connection)
systemctl --user enable --now agents-workflows.socket

# Or start service directly (for testing)
systemctl --user enable --now agents-workflows.service

# Check status
systemctl --user status agents-workflows.service
```

### Enable Lingering (for headless operation)

If running without a graphical session, enable lingering so the service starts at boot:

```bash
loginctl enable-linger $USER
```

---

## Systemd System Service

Run the service system-wide. Suitable for servers and multi-user environments.

### Service File

Create `/etc/systemd/system/agents-workflows.service`:

```ini
[Unit]
Description=Agents Workflows Server (System Service)
Documentation=https://github.com/your-org/agents-workflows/docs/INSTALL.md
After=network.target
Wants=network.target

[Service]
Type=simple
ExecStartPre=/usr/local/bin/agents-workflows-server init
ExecStart=/usr/local/bin/agents-workflows-server
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

# Run as dedicated user (recommended)
User=agents-workflows
Group=agents-workflows

# Environment
Environment="RUST_LOG=info"

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/agents-workflows
RuntimeDirectory=agents-workflows
RuntimeDirectoryMode=0755

[Install]
WantedBy=multi-user.target
```

### Socket Unit (system-wide)

Create `/etc/systemd/system/agents-workflows.socket`:

```ini
[Unit]
Description=Agents Workflows Server Socket (System)
PartOf=agents-workflows.service

[Socket]
ListenStream=0.0.0.0:8080
ListenStream=0.0.0.0:8081

# Socket activation ports
# Port 8080: MCP HTTP Stream (JSON-RPC)
# Port 8081: REST API
# Port 8082: Studio UI (optional, add if needed)

# Accept from any interface
BindIPv6Only=both

[Install]
WantedBy=sockets.target
```

### Create Service User

```bash
# Create dedicated service account
sudo useradd --system --no-create-home --shell=/usr/sbin/nologin agents-workflows

# Create runtime directory
sudo mkdir -p /var/lib/agents-workflows
sudo chown agents-workflows:agents-workflows /var/lib/agents-workflows
```

### Enable and Start

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable socket activation
sudo systemctl enable --now agents-workflows.socket

# Or enable service directly
sudo systemctl enable --now agents-workflows.service

# Check status
sudo systemctl status agents-workflows.service
```

---

## Socket Activation

Socket activation allows systemd to start the service only when a connection request arrives.

### How It Works

```
1. System boots with agents-workflows.socket active, listening on ports
2. Client (IDE, curl, etc.) connects to port 8080, 8081, or 8082
3. systemd accepts the connection and passes socket to the service
4. agents-workflows-server inherits the socket and starts handling requests
5. Service stays running for subsequent connections (idles when done)
```

### Port Configuration

| Port | Protocol | Purpose |
|------|----------|---------|
| 8080 | TCP | MCP HTTP Stream (JSON-RPC) |
| 8081 | TCP | REST API |
| 8082 | TCP | Studio UI (embedded React) |

**Customizing ports:**

Edit the socket unit file:

```ini
[Socket]
# Use different ports
ListenStream=127.0.0.1:9090  # MCP
ListenStream=127.0.0.1:9091  # REST API
```

### Benefits

- **On-demand startup**: Service starts only when needed
- **Fast response**: No cold-start latency for idle services
- **Resource efficiency**: Zero memory/CPU when no clients connected
- **Graceful degradation**: If service crashes, socket remains—systemd restarts it on next connection

---

## Backend Configuration

### SQLite (Default)

By default, agents-workflows uses SQLite for the registry:

```
~/.workflows/global/registry.db
```

The database is created automatically on first run (`agents-workflows-server init`).

### PostgreSQL (Production)

For production deployments, configure PostgreSQL:

```bash
# Set connection string via environment variable
export DATABASE_URL="postgresql://user:password@localhost:5432/agents_workflows"

# Or in systemd service file:
Environment="DATABASE_URL=postgresql://user:password@localhost:5432/agents_workflows"
```

### Workspace Directory

Custom workspace location:

```bash
export WORKSPACE_DIR="/opt/agents-workflows/workspaces"
```

---

## Commands Reference

### Systemd User Commands

```bash
# Reload unit files after changes
systemctl --user daemon-reload

# Start service
systemctl --user start agents-workflows.service

# Stop service
systemctl --user stop agents-workflows.service

# Restart service
systemctl --user restart agents-workflows.service

# Enable at boot
systemctl --user enable agents-workflows.service

# Disable at boot
systemctl --user disable agents-workflows.service

# Check status
systemctl --user status agents-workflows.service

# Check if running
systemctl --user is-active agents-workflows.service
```

### Systemd System Commands

```bash
# Same as user commands, but with sudo and without --user flag
sudo systemctl daemon-reload
sudo systemctl start agents-workflows.service
sudo systemctl stop agents-workflows.service
sudo systemctl restart agents-workflows.service
sudo systemctl enable agents-workflows.service
sudo systemctl disable agents-workflows.service
sudo systemctl status agents-workflows.service
```

### Journal (Logs)

```bash
# User service logs
journalctl --user -u agents-workflows.service -f

# System service logs
sudo journalctl -u agents-workflows.service -f

# Follow logs in real-time
journalctl --user -u agents-workflows.service --since "1 hour ago" -f

# Check for errors only
journalctl --user -u agents-workflows.service -p err

# View specific log entries
journalctl --user -u agents-workflows.service -n 100
```

### Verification Steps

```bash
# 1. Check service is running
systemctl --user status agents-workflows.service
# or
sudo systemctl status agents-workflows.service

# 2. Check listening ports
ss -tlnp | grep agents-workflows
# or
netstat -tlnp | grep agents-workflows

# 3. Test MCP endpoint
curl -X POST http://127.0.0.1:8080/mcp/v1/tools \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# 4. Test REST API
curl http://127.0.0.1:8081/api/health

# 5. Check logs
journalctl --user -u agents-workflows.service -n 50 --no-pager
```

---

## Troubleshooting

### Service Fails to Start

```bash
# Check detailed logs
journalctl --user -u agents-workflows.service -xe

# Verify binary path in unit file
which agents-workflows-server

# Test binary directly
~/.local/bin/agents-workflows-server
```

### Socket Activation Not Working

```bash
# Check socket status
systemctl --user status agents-workflows.socket

# Verify socket is listening
ss -tlnp | grep 8080

# Check systemd socket assignment
systemctl --user show agents-workflows.socket | grep Listen
```

### Permission Denied Errors

```bash
# For user service, check lingering is enabled
loginctl show-session $XDG_SESSION_ID

# For system service, verify user/group exists
id agents-workflows

# Check file permissions
ls -la ~/.local/bin/agents-workflows-server
# or
ls -la /usr/local/bin/agents-workflows-server
```

### Database Locked Errors

```bash
# Ensure only one instance is running
pgrep -f agents-workflows-server
# Kill extra processes if found
pkill -f agents-workflows-server

# Restart service
systemctl --user restart agents-workflows.service
```

---

## Security Considerations

1. **Run as dedicated user**: Create a service user instead of running as root
2. **Restrict socket binding**: Bind to `127.0.0.1` for local-only access, or use firewall for external
3. **Enable firewall**: Only allow access from trusted networks

```bash
# UFW example
sudo ufw allow from 192.168.1.0/24 to any port 8080,8081,8082
```

4. **Keep binary updated**: Subscribe to security advisories

---

## Next Steps

- [REST API Reference](REST-API.md) — API endpoints for automation
- [MCP API Reference](MCP-API.md) — Model Context Protocol tools
- [Architecture Overview](ARCHITECTURE.md) — System design details
- [Workspace Structure](WORKSPACES.md) — Resource organization
