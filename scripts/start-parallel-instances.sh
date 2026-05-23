#!/bin/bash
# Start multiple server instances for parallel test execution
# Each instance has its own workspace and REST port

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="${SCRIPT_DIR}/target/release/workflow-mcp"
STUDIO_PATH="${SCRIPT_DIR}/studio/dist"
WORKSPACE_BASE="${SCRIPT_DIR}/.workflows-parallel"

# Clean up old parallel workspaces
rm -rf "${WORKSPACE_BASE}"

# Start 3 instances
for i in 1 2 3; do
    WORKSPACE="${WORKSPACE_BASE}/instance${i}"
    REST_PORT=$((8080 + i))  # 8081, 8082, 8083

    # Initialize workspace from default
    mkdir -p "${WORKSPACE}"
    cp -r "${SCRIPT_DIR}/.workflows/global" "${WORKSPACE}/" 2>/dev/null || true

    echo "Starting instance ${i} on REST port ${REST_PORT} with workspace ${WORKSPACE}"

    REST_PORT=${REST_PORT} nohup "${SERVER}" start --workspace "${WORKSPACE}" --port $((9000 + i)) > "${SCRIPT_DIR}/.workflows-parallel/instance${i}.log" 2>&1 &
done

echo "Started 3 instances. Waiting for them to be ready..."
sleep 5

# Verify they're running
for i in 1 2 3; do
    REST_PORT=$((8080 + i))
    if curl -s "http://localhost:${REST_PORT}/api/health" > /dev/null 2>&1 || curl -s "http://localhost:$((9000 + i))/health" > /dev/null 2>&1; then
        echo "Instance ${i} is running"
    else
        echo "Instance ${i} may not be ready yet"
    fi
done

echo ""
echo "Available instances:"
echo "  Instance 1: MCP=9001, REST=8081, Workspace=${WORKSPACE_BASE}/instance1"
echo "  Instance 2: MCP=9002, REST=8082, Workspace=${WORKSPACE_BASE}/instance2"
echo "  Instance 3: MCP=9003, REST=8083, Workspace=${WORKSPACE_BASE}/instance3"
echo ""
echo "To stop all instances: pkill -f 'workflow-mcp.*workflows-parallel'"
