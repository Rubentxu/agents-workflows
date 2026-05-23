#!/bin/bash
# Run E2E tests with 2 parallel instances for faster execution
# Usage: ./scripts/run-parallel.sh

set -e

cd /home/rubentxu/Proyectos/agentesIA/agents-workflows

# Kill existing servers
pkill -f "workflow-mcp.*8082" 2>/dev/null || true

# Create workspace for instance 2
mkdir -p /tmp/ws-instance2
cp -r ~/.workflows/global /tmp/ws-instance2/ 2>/dev/null || true

echo "Starting instance 2 on port 8082..."
REST_PORT=8082 ./target/release/workflow-mcp start --workspace /tmp/ws-instance2 --port 9002 > /tmp/instance2.log 2>&1 &
sleep 6

# Check if ready
if curl -s http://localhost:8082/api/health > /dev/null 2>&1; then
    echo "Instance 2 ready on port 8082"
else
    echo "Instance 2 failed to start"
    cat /tmp/instance2.log | tail -5
fi

echo ""
echo "Running tests - shard 1 (port 8081) and shard 2 (port 8082) in parallel..."

# Run shard 1 with worker 0 (will use port 8081 via REST_URL)
REST_URL=http://localhost:8081 npx playwright test --shard=1/2 --workers=3 --reporter=list 2>&1 | grep -E "passed|failed" | tail -3 &
PID1=$!

# Run shard 2 with worker 0 (will use port 8082 via REST_URL)
REST_URL=http://localhost:8082 npx playwright test --shard=2/2 --workers=3 --reporter=list 2>&1 | grep -E "passed|failed" | tail -3 &
PID2=$!

# Wait for both
wait $PID1
wait $PID2

echo ""
echo "Done. Killing instance 2..."
pkill -f "workflow-mcp.*8082" 2>/dev/null || true
