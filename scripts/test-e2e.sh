#!/bin/bash
set -e

echo "=== agents-workflows E2E Test ==="

# Start server in background
echo "Starting server..."
cargo run --release --bin workflow-mcp -- start &
SERVER_PID=$!
sleep 3

# Check server is running
echo "Checking server health..."
curl -s http://localhost:8080/health | grep -q "healthy" || { echo "Server not healthy"; kill $SERVER_PID; exit 1; }

# Test MCP
echo "Testing MCP workflow_list..."
curl -s -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"workflow_list","params":{"scope":"global"},"id":1}' \
  | grep -q "result" || { echo "workflow_list failed"; kill $SERVER_PID; exit 1; }

# Test REST
echo "Testing REST health..."
curl -s http://localhost:8081/health | grep -q "healthy" || { echo "REST not healthy"; kill $SERVER_PID; exit 1; }

# Test Studio
echo "Testing Studio UI..."
curl -s http://localhost:8080/studio/ | grep -q "html" || { echo "Studio not served"; kill $SERVER_PID; exit 1; }

# Stop server
echo "Stopping server..."
kill $SERVER_PID

echo "=== All E2E tests passed! ==="