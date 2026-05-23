#!/bin/bash
# Run E2E tests with multiple server instances for true parallelism
#
# Usage: ./scripts/run-parallel-tests.sh [num_instances]
# Default: 3 instances

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
cd "${PROJECT_DIR}"

NUM_INSTANCES=${1:-3}
BASE_PORT=8081
BASE_MCP_PORT=9001
WORKSPACE_BASE="${PROJECT_DIR}/.workflows-parallel"

echo "=== Parallel E2E Test Setup ==="
echo "Instances: ${NUM_INSTANCES}"
echo "REST ports: ${BASE_PORT} - $((BASE_PORT + NUM_INSTANCES - 1))"
echo "MCP ports: ${BASE_MCP_PORT} - $((BASE_MCP_PORT + NUM_INSTANCES - 1))"

# Clean up old workspaces
rm -rf "${WORKSPACE_BASE}"

# Copy default workspace as base
DEFAULT_WORKSPACE="${HOME}/.workflows"
if [ ! -d "${DEFAULT_WORKSPACE}" ]; then
    echo "Error: Default workspace not found at ${DEFAULT_WORKSPACE}"
    exit 1
fi

# Kill any existing parallel instances
echo "Cleaning up old instances..."
pkill -f "workflow-mcp.*workflows-parallel" 2>/dev/null || true
sleep 2

# Start server instances
echo ""
echo "Starting ${NUM_INSTANCES} server instances..."
for i in $(seq 1 $NUM_INSTANCES); do
    WORKSPACE="${WORKSPACE_BASE}/instance${i}"
    REST_PORT=$((BASE_PORT + i - 1))
    MCP_PORT=$((BASE_MCP_PORT + i - 1))
    
    # Create workspace directory and copy default data
    mkdir -p "${WORKSPACE}"
    cp -r "${DEFAULT_WORKSPACE}/global" "${WORKSPACE}/" 2>/dev/null || true
    
    echo "  Instance ${i}: MCP=${MCP_PORT}, REST=${REST_PORT}, workspace=${WORKSPACE}"
    
    # Start server with REST port
    REST_PORT=${REST_PORT} "${PROJECT_DIR}/target/release/workflow-mcp" \
        start --workspace "${WORKSPACE}" --port ${MCP_PORT} \
        > "${WORKSPACE_BASE}/instance${i}.log" 2>&1 &
done

# Wait for servers to start
echo ""
echo "Waiting for instances to be ready..."
sleep 8

# Verify all instances are running
echo ""
echo "Verifying instances..."
ALL_OK=true
for i in $(seq 1 $NUM_INSTANCES); do
    REST_PORT=$((BASE_PORT + i - 1))
    if curl -s "http://localhost:${REST_PORT}/api/health" > /dev/null 2>&1; then
        echo "  ✓ Instance ${i} (REST :${REST_PORT}) ready"
    else
        echo "  ✗ Instance ${i} (REST :${REST_PORT}) NOT ready"
        ALL_OK=false
    fi
done

if [ "$ALL_OK" = false ]; then
    echo ""
    echo "Error: Not all instances started successfully"
    cat "${WORKSPACE_BASE}/instance1.log" | tail -20 2>/dev/null || true
    exit 1
fi

echo ""
echo "=== All instances ready ==="

# Function to run tests for a specific shard
run_shard() {
    local shard=$1
    local total=$2
    local rest_port=$((BASE_PORT + shard - 1))
    
    echo ""
    echo "Running shard ${shard}/${total} with REST_PORT=${rest_port}"
    REST_URL="http://localhost:${rest_port}" \
    npx playwright test --shard=${shard}/${total} --workers=1 --reporter=list 2>&1
}

# Export function and variables for use in subshells
export -f run_shard
export BASE_PORT NUM_INSTANCES PROJECT_DIR

# Run shards in parallel
echo ""
echo "Running test shards in parallel..."
for i in $(seq 1 $NUM_INSTANCES); do
    run_shard $i $NUM_INSTANCES &
done

# Wait for all shards
wait

echo ""
echo "=== All shards complete ==="

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up..."
    pkill -f "workflow-mcp.*workflows-parallel" 2>/dev/null || true
    echo "Done"
}

trap cleanup EXIT
