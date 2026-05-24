# =============================================================================
# agents-workflows justfile
# =============================================================================
# Comprehensive automation for building, testing, and running the MCP server
#
# Usage: just <recipe>
# Show all recipes: just --list

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

# Project root directory
ROOT := justfile_directory()

# Binary name and paths
BINARY_NAME := "workflow-mcp"
TARGET_BINARY := ROOT / "target" / "release" / BINARY_NAME
DEBUG_BINARY := ROOT / "target" / "debug" / BINARY_NAME

# Installation paths
USER_INSTALL_DIR := "$HOME/.local/bin"
SYSTEM_INSTALL_DIR := "/usr/local/bin"

# Systemd paths
USER_SYSTEMD_DIR := "$HOME/.config/systemd/user"
SYSTEM_SYSTEMD_DIR := "/etc/systemd/system"

# Ports
MCP_PORT := "8080"
REST_PORT := "8081"

# Workspace directory for workflows data
WORKSPACE_DIR := "$HOME/.workflows"

# -----------------------------------------------------------------------------
# Default recipe - show help
# -----------------------------------------------------------------------------

default:
    @echo "agents-workflows - Available commands:"
    @echo ""
    @echo "=== PRODUCTION (Container + Quadlet) ==="
    @echo "  just container-build     Build container image"
    @echo "  just container-run       Run container (manual)"
    @echo "  just container-rebuild   Full rebuild + restart"
    @echo "  just quadlet-install     Install quadlet (user)"
    @echo "  just quadlet-install-system Install quadlet (system, needs sudo)"
    @echo "  just quadlet-start       Start service"
    @echo "  just quadlet-stop        Stop service"
    @echo "  just quadlet-status      Show status"
    @echo ""
    @echo "=== DEVELOPMENT (Fast iteration) ==="
    @echo "  just dev-start           Run binary directly (foreground)"
    @echo "  just dev-run             Run with cargo (no binary copy)"
    @echo "  just dev-watch           Watch mode (rebuild on changes)"
    @echo ""
    @echo "=== DEVELOPMENT + QUADLET (Best of both) ==="
    @echo "  just dev-quadlet-enable  Install quadlet for AUTO-START at boot"
    @echo "  just dev-quadlet-user    Install quadlet at user level"
    @echo "  just dev-rebuild         Rebuild container + restart service"
    @echo "  just dev-restart         Quick restart (existing image)"
    @echo "  just dev-status          Show all running instances"
    @echo ""
    @echo "=== HEALTH ==="
    @echo "  just health              Check server health"
    @echo "  just studio              Open Studio UI"
    @echo ""
    @echo "=== FULL LIST ==="
    @echo "  just --list             Show all recipes"

# =============================================================================
# Binary Build & Install
# =============================================================================

# Build release binary
build:
    cargo build --release
    @echo "Built: {{ TARGET_BINARY }}"

# Install to ~/.local/bin/
install:
    @mkdir -p {{ USER_INSTALL_DIR }}
    cp {{ TARGET_BINARY }} {{ USER_INSTALL_DIR }}/{{ BINARY_NAME }}
    chmod +x {{ USER_INSTALL_DIR }}/{{ BINARY_NAME }}
    @echo "Installed to {{ USER_INSTALL_DIR }}/{{ BINARY_NAME }}"

# Install to /usr/local/bin/ (requires sudo)
install-system:
    @echo "Installing to {{ SYSTEM_INSTALL_DIR }}/{{ BINARY_NAME }}..."
    sudo cp {{ TARGET_BINARY }} {{ SYSTEM_INSTALL_DIR }}/{{ BINARY_NAME }}
    sudo chmod +x {{ SYSTEM_INSTALL_DIR }}/{{ BINARY_NAME }}
    @echo "Installed to {{ SYSTEM_INSTALL_DIR }}/{{ BINARY_NAME }}"

# =============================================================================
# Systemd Service Setup
# =============================================================================

# Create user systemd service files
setup-user-service:
    @echo "Setting up user systemd service..."
    @mkdir -p {{ USER_SYSTEMD_DIR }}
    sed -e 's|__USER_INSTALL_DIR__|{{ USER_INSTALL_DIR }}|g' \
        {{ ROOT }}/systemd/user-service.template > {{ USER_SYSTEMD_DIR }}/agents-workflows.service
    cp {{ ROOT }}/systemd/user-socket.template {{ USER_SYSTEMD_DIR }}/agents-workflows.socket
    chmod 600 {{ USER_SYSTEMD_DIR }}/agents-workflows.service
    chmod 600 {{ USER_SYSTEMD_DIR }}/agents-workflows.socket
    @echo "User systemd files created in {{ USER_SYSTEMD_DIR }}/"
    @echo "Enable with: just enable"

# Create system systemd service files
setup-system-service:
    @echo "Setting up system systemd service..."
    @sudo mkdir -p {{ SYSTEM_SYSTEMD_DIR }}
    sed -e 's|__SYSTEM_INSTALL_DIR__|{{ SYSTEM_INSTALL_DIR }}|g' \
        {{ ROOT }}/systemd/system-service.template | sudo tee {{ SYSTEM_SYSTEMD_DIR }}/agents-workflows.service > /dev/null
    cp {{ ROOT }}/systemd/system-socket.template {{ SYSTEM_SYSTEMD_DIR }}/agents-workflows.socket
    sudo chmod 644 {{ SYSTEM_SYSTEMD_DIR }}/agents-workflows.socket
    sudo chmod 644 {{ SYSTEM_SYSTEMD_DIR }}/agents-workflows.service
    @echo "System systemd files created in {{ SYSTEM_SYSTEMD_DIR }}/"
    @echo "Enable with: just enable-system"

# =============================================================================
# Service Management (User)
# =============================================================================

# Enable and start user socket
enable:
    systemctl --user daemon-reload
    systemctl --user enable --now agents-workflows.socket
    @echo "User socket enabled and started"

# Disable and stop user socket
disable:
    systemctl --user disable --now agents-workflows.socket || true
    @echo "User socket disabled and stopped"

# Start the service
start:
    systemctl --user start agents-workflows.service
    @echo "Service started"

# Stop the service
stop:
    systemctl --user stop agents-workflows.service || true
    @echo "Service stopped"

# Restart the service
restart:
    systemctl --user restart agents-workflows.service
    @echo "Service restarted"

# Show service status
status:
    systemctl --user status agents-workflows.service || true

# Follow service logs
logs:
    journalctl --user -u agents-workflows -f

# =============================================================================
# Service Management (System)
# =============================================================================

# Enable and start system socket
enable-system:
    sudo systemctl daemon-reload
    sudo systemctl enable --now agents-workflows.socket
    @echo "System socket enabled and started"

# Disable and stop system socket
disable-system:
    sudo systemctl disable --now agents-workflows.socket || true
    @echo "System socket disabled and stopped"

# Start system service
start-system:
    sudo systemctl start agents-workflows.service
    @echo "System service started"

# Stop system service
stop-system:
    sudo systemctl stop agents-workflows.service || true
    @echo "System service stopped"

# Restart system service
restart-system:
    sudo systemctl restart agents-workflows.service
    @echo "System service restarted"

# Show system service status
status-system:
    sudo systemctl status agents-workflows.service || true

# Follow system service logs
logs-system:
    sudo journalctl -u agents-workflows -f

# =============================================================================
# Server Commands
# =============================================================================

# Run workflow-mcp init
init:
    {{ TARGET_BINARY }} init

# Run server directly (foreground)
run:
    cd {{ WORKSPACE_DIR }} && STUDIO_PATH="{{ ROOT }}/studio/dist" {{ TARGET_BINARY }} start --workspace {{ WORKSPACE_DIR }}

# Start server in background (daemon)
start-server:
    cd {{ WORKSPACE_DIR }} && STUDIO_PATH="{{ ROOT }}/studio/dist" nohup {{ TARGET_BINARY }} start --workspace {{ WORKSPACE_DIR }} > ~/.workflows/server.log 2>&1 &
    sleep 1
    curl -s http://localhost:8081/health && echo " Server running" || echo " Server failed"

# Stop server process
stop-server:
    pkill {{ BINARY_NAME }} || true

# Check server status
server-status:
    @curl -s http://localhost:8081/health 2>/dev/null || echo "Server not running"

# Show server logs
server-logs:
    tail -20 ~/.workflows/server.log

# Run with cargo (development)
run-dev:
    cargo run --bin workflow-mcp -- start

# =============================================================================
# Testing
# =============================================================================

# Run cargo test
test:
    cargo test

# Run end-to-end tests
test-e2e:
    bash {{ ROOT }}/scripts/test-e2e.sh

# Run performance benchmarks
benchmark:
    bash {{ ROOT }}/scripts/benchmark.sh

# =============================================================================
# Development
# =============================================================================

# Clean build artifacts
clean:
    cargo clean

# Format code
fmt:
    cargo fmt

# Run clippy linter
clippy:
    cargo clippy -- -D warnings

# =============================================================================
# Health Checks
# =============================================================================

# Check server health
health:
    @curl -s http://localhost:{{ MCP_PORT }}/health || echo "Server not responding"
    @curl -s http://localhost:{{ REST_PORT }}/health || echo "REST not responding"

# Test MCP endpoint
mcptest:
    @curl -s -X POST http://localhost:{{ MCP_PORT }}/mcp \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"workflow_list","params":{},"id":1}' | head -c 500 || echo "MCP not responding"

# Open Studio UI
studio:
    @echo "Opening Studio at http://localhost:{{ MCP_PORT }}/studio"
    @which xdg-open > /dev/null && xdg-open http://localhost:{{ MCP_PORT }}/studio || \
    which open > /dev/null && open http://localhost:{{ MCP_PORT }}/studio || \
    echo "Open http://localhost:{{ MCP_PORT }}/studio manually"

# =============================================================================
# Utility recipes
# =============================================================================

# Reload systemd user configuration
reload:
    systemctl --user daemon-reload

# Reload system systemd configuration
reload-system:
    sudo systemctl daemon-reload

# Check if service is active
is-active:
    @systemctl --user is-active agents-workflows.service

# Check if service is enabled
is-enabled:
    @systemctl --user is-enabled agents-workflows.service

# =============================================================================
# Container (Podman) Management
# =============================================================================

# Build container image
container-build:
    podman build -t agents-workflows:latest .

# Run container with podman
container-run:
    podman run -d \
        --name agents-workflows \
        -p {{ MCP_PORT }}:{{ MCP_PORT }}/tcp \
        -p {{ REST_PORT }}:{{ REST_PORT }}/tcp \
        -v agents-workflows-data:/home/appuser/.workflows \
        -e RUST_LOG=info \
        --restart=always \
        agents-workflows:latest

# Stop container
container-stop:
    -podman stop agents-workflows

# Remove container and volume
container-remove:
    -podman rm agents-workflows
    -podman volume rm agents-workflows-data

# Show container status
container-status:
    @echo "=== Container Status ==="
    @podman ps -a --filter "name=agents-workflows" || true
    @echo ""
    @echo "=== Volumes ==="
    @podman volume ls --filter "name=agents-workflows" 2>/dev/null || true

# Show container logs
container-logs:
    podman logs --tail 100 -f agents-workflows

# =============================================================================
# Podman Quadlet (systemd) Management
# =============================================================================

# Quadlet paths
QUADLET_USER_DIR := "$HOME/.config/containers/systemd"
QUADLET_SYSTEM_DIR := "/etc/containers/systemd"
QUADLET_FILE := ROOT / "containers" / "agents-workflows.container"

# Install quadlet (user-level)
quadlet-install:
    @mkdir -p {{ QUADLET_USER_DIR }}
    cp {{ QUADLET_FILE }} {{ QUADLET_USER_DIR }}/
    @echo "Installed to {{ QUADLET_USER_DIR }}/agents-workflows.container"
    @echo "Run: systemctl --user daemon-reload && just quadlet-start"

# Install quadlet system-wide (requires sudo)
quadlet-install-system:
    sudo mkdir -p {{ QUADLET_SYSTEM_DIR }}
    sudo cp {{ QUADLET_FILE }} {{ QUADLET_SYSTEM_DIR }}/
    @echo "Installed to {{ QUADLET_SYSTEM_DIR }}/agents-workflows.container"

# Start quadlet service (user)
quadlet-start:
    systemctl --user daemon-reload
    systemctl --user start agents-workflows

# Stop quadlet service (user)
quadlet-stop:
    -systemctl --user stop agents-workflows

# Restart quadlet service (user)
quadlet-restart:
    systemctl --user restart agents-workflows

# Status quadlet service (user)
quadlet-status:
    @echo "=== Container ==="
    @podman ps -a --filter "name=agents-workflows"
    @echo ""
    @echo "=== Service ==="
    -systemctl --user status agents-workflows || true

# Remove quadlet (user)
quadlet-remove:
    -rm -f {{ QUADLET_USER_DIR }}/agents-workflows.container
    -podman stop agents-workflows 2>/dev/null || true
    -podman rm agents-workflows 2>/dev/null || true
    systemctl --user daemon-reload

# Full rebuild with container
container-rebuild: container-remove container-build quadlet-install quadlet-start quadlet-status

# =============================================================================
# Development Workflow with Quadlet
# =============================================================================
# Use this for iterative development with auto-start on boot
# -----------------------------------------------------------------------------

# Install quadlet to start automatically at boot (system-wide)
dev-quadlet-enable:
    @echo "Installing system-wide quadlet for auto-start at boot..."
    sudo mkdir -p {{ QUADLET_SYSTEM_DIR }}
    sudo cp {{ QUADLET_FILE }} {{ QUADLET_SYSTEM_DIR }}/
    sudo systemctl daemon-reload
    sudo systemctl enable --now agents-workflows.service
    @echo ""
    @echo "✓ Service enabled! Will start automatically at boot."
    @echo "  Manage with: sudo systemctl start|stop|restart agents-workflows"

# Install quadlet at user level (no sudo needed)
dev-quadlet-user:
    @echo "Installing user-level quadlet..."
    mkdir -p {{ QUADLET_USER_DIR }}
    cp {{ QUADLET_FILE }} {{ QUADLET_USER_DIR }}/
    systemctl --user daemon-reload
    systemctl --user enable --now agents-workflows.service
    @echo ""
    @echo "✓ Service enabled for user! Will start at login."

# Stop quadlet (when you want to use dev mode instead)
dev-quadlet-disable:
    sudo systemctl disable --now agents-workflows.service 2>/dev/null || \
    systemctl --user disable --now agents-workflows.service 2>/dev/null || true
    @echo "Quadlet disabled. Use 'just dev-start' for development mode."

# Development mode: run binary directly (faster iteration than container)
dev-start: kill-server
    @echo "Starting development server (binary directly)..."
    @echo "Press Ctrl+C to stop"
    cargo build --release -p mcp-server
    cd {{ WORKSPACE_DIR }} && \
        STUDIO_PATH="{{ ROOT }}/studio/dist" \
        RUST_LOG=debug \
        {{ TARGET_BINARY }} start --workspace {{ WORKSPACE_DIR }} --port {{ MCP_PORT }}

# Kill any existing process on the server ports
kill-server:
    @echo "Killing existing server processes..."
    -pkill -f "workflow-mcp" || true
    -fuser -k {{ MCP_PORT }}/tcp 2>/dev/null || true
    -fuser -k {{ REST_PORT }}/tcp 2>/dev/null || true
    sleep 1
    @echo "Ports cleared"

# Development mode: build Studio + backend and run the compiled binary - non-blocking
dev-run: kill-server
    @echo "Preparing Studio frontend..."
    @if [ ! -d "{{ ROOT }}/studio/node_modules" ]; then \
        echo "Installing Studio dependencies..."; \
        cd {{ ROOT }}/studio && npm install; \
    fi
    @echo "Building Studio..."
    cd {{ ROOT }}/studio && npm run build
    @mkdir -p {{ WORKSPACE_DIR }}
    @echo "Building backend binary..."
    cargo build --release -p mcp-server
    @echo "Starting dev server with compiled binary (background)..."
    @echo "Logs: ~/.workflows/server.log"
    cd {{ ROOT }} && \
        STUDIO_PATH="{{ ROOT }}/studio/dist" \
        RUST_LOG=debug \
        nohup ./target/release/workflow-mcp start --workspace {{ WORKSPACE_DIR }} --port {{ MCP_PORT }} > ~/.workflows/server.log 2>&1 &
    sleep 3
    @if curl -sf http://localhost:{{ REST_PORT }}/health > /dev/null 2>&1; then \
        echo "✓ Server running at http://localhost:{{ MCP_PORT }}/studio"; \
        echo "✓ Health: http://localhost:{{ REST_PORT }}/health"; \
        echo "✓ Studio ready for manual testing"; \
    else \
        echo "✗ Server failed to start. Check logs:"; \
        tail -20 ~/.workflows/server.log; \
        exit 1; \
    fi

# Rebuild container image and restart service (after code changes)
dev-rebuild:
    @echo "Rebuilding container and restarting service..."
    cargo build --release -p mcp-server
    podman build -t agents-workflows:latest .
    sudo systemctl restart agents-workflows.service
    @echo "✓ Image rebuilt and service restarted"

# Quick restart (just restart the service with existing image)
dev-restart:
    sudo systemctl restart agents-workflows.service
    @echo "✓ Service restarted"

# Watch mode: rebuild on file changes (requires cargo-watch)
dev-watch:
    @echo "Starting watch mode (requires: cargo install cargo-watch)..."
    cargo build --release -p mcp-server && \
        STUDIO_PATH="{{ ROOT }}/studio/dist" \
        cargo run --release -p mcp-server -- start --workspace {{ WORKSPACE_DIR }}

# Show development status
dev-status:
    @echo "=== Development Status ==="
    @echo ""
    @echo "Quadlet service:"
    -sudo systemctl status agents-workflows.service --no-pager 2>/dev/null || true
    -systemctl --user status agents-workflows.service --no-pager 2>/dev/null || true
    @echo ""
    @echo "Binary running:"
    @ps aux | grep "workflow-mcp" | grep -v grep || echo "  No binary running"
    @echo ""
    @echo "Ports in use:"
    @ss -tlnp | grep -E "{{ MCP_PORT }}|{{ REST_PORT }}" || echo "  No ports in use"
    @echo ""
    @echo "Container:"
    @podman ps --filter "name=agents-workflows" 2>/dev/null || echo "  No container running"

# =============================================================================
# E2E Tests (TypeScript/Playwright)
# =============================================================================

# Install test dependencies
test_install:
    cd tests && npm install

# Start test container
test_container_up:
    bash tests/containers/start-container.sh

# Stop test container
test_container_down:
    bash tests/containers/stop-container.sh

# Restart test container
test_container_restart: test_container_down test_container_up

# Run all E2E tests
test_e2e: test_container_up
    cd tests && npx playwright test
    @echo "Reports at: tests/playwright-report/"

# Run all E2E tests against an existing local server
test_e2e_local:
    cd tests && E2E_MODE=attach SKIP_CONTAINER_CHECK=1 npx playwright test

# Run API tests only
test_api: test_container_up
    cd tests && npx playwright test --project=api

# Run MCP tests only
test_mcp: test_container_up
    cd tests && npx playwright test --project=mcp

# Run workflow tests only
test_workflows: test_container_up
    cd tests && npx playwright test --project=workflows

# Run UI (Playwright browser) tests only
test_ui: test_container_up
    cd tests && npx playwright test --project=chromium

# Run UI tests against an existing local server
test_ui_local:
    cd tests && E2E_MODE=attach SKIP_CONTAINER_CHECK=1 npx playwright test --project=chromium

# Run visual regression baselines against an existing local server
test_visual_local:
    cd tests && E2E_MODE=attach SKIP_CONTAINER_CHECK=1 npx playwright test e2e/visual-regression.spec.ts --project=chromium-visual-regression

# Update visual regression baselines against an existing local server
test_visual_update_local:
    cd tests && E2E_MODE=attach SKIP_CONTAINER_CHECK=1 npx playwright test e2e/visual-regression.spec.ts --project=chromium-visual-regression --update-snapshots

# Run functional screenshot audit against an existing local server
test_functional_audit_local:
    cd tests && E2E_MODE=attach SKIP_CONTAINER_CHECK=1 npx playwright test e2e/functional-audit-captures.spec.ts --project=chromium-functional-audit

# Run accessibility suite against an existing local server
test_accessibility_local:
    cd tests && E2E_MODE=attach SKIP_CONTAINER_CHECK=1 npx playwright test e2e/studio-accessibility.spec.ts --project=chromium-accessibility

# Run performance suite against an existing local server
test_performance_local:
    cd tests && E2E_MODE=attach SKIP_CONTAINER_CHECK=1 npx playwright test e2e/performance.spec.ts --project=chromium-performance

# Run tests in debug mode
test_debug: test_container_up
    cd tests && npx playwright test --debug

# Run tests with visible browser
test_headed: test_container_up
    cd tests && npx playwright test --headed

# Show test report
test_report:
    cd tests && npx playwright show-report

# Container logs during tests
test_logs:
    podman logs -f agents-workflows-tests

# Full test suite with cleanup
test_all: test_container_up
    cd tests && npx playwright test
    just test_container_down

# CI-style: run specific test tags
test_ci test_tag="":
    @echo "Running CI tests..."
    @if [[ "{{test_tag}}" == "" ]]; then \
        echo "Usage: just test_ci test_tag=test_unit"; \
        echo "Available tags: test_unit, test_e2e, test_ui"; \
        exit 1; \
    fi
    just {{test_tag}}
