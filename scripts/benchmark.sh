#!/bin/bash
set -e

echo "=== Performance Benchmark ==="

# Start server
cargo run --release --bin workflow-mcp -- start &
sleep 3

# Benchmark 1: Concurrent workflow_list
echo "Benchmark: 100 concurrent workflow_list calls..."
time (
  for i in {1..100}; do
    curl -s -X POST http://localhost:8080/mcp \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"workflow_list","params":{},"id":1}' \
      > /dev/null &
  done
  wait
)

# Benchmark 2: Workflow execution startup
echo "Benchmark: 10 workflow_execute calls..."
time (
  for i in {1..10}; do
    curl -s -X POST http://localhost:8080/mcp \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"workflow_execute","params":{"workflow_arn":"arn:local:global:workflow/sdd-full"},"id":1}' \
      > /dev/null &
  done
  wait
)

# Stop server
pkill -f workflow-mcp

echo "=== Benchmark complete ==="