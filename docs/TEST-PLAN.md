# Test Plan

## Unit Tests

### Registry Crate
- ARN parsing: `cargo test -p registry -- --test-threads=1`
- Node CRUD operations
- Edge relationship management

### Workflow Crate
- DAG validation
- Topological sort
- State machine transitions
- Parallel stage detection

### Insights Crate
- Insight creation
- Query filtering
- Type validation

## Integration Tests

### MCP Server Tests
```bash
cargo test -p mcp-server
```

Tests:
- Health endpoint
- workflow_list
- workflow_get
- workflow_execute
- workflow_get_state
- insights_log
- Error handling

### REST API Tests
```bash
cargo test -p mcp-server --test rest_api
```

Tests:
- Workspace CRUD
- Resource CRUD
- Execution control

## E2E Tests

### Full Workflow Execution
```bash
./scripts/test-e2e.sh
```

Tests:
1. Server startup
2. MCP connection
3. Workflow execution
4. State transitions
5. Insights logging
6. Studio UI serving

### OpenCode Integration
```bash
# Start server
cargo run --release -- start --workspace ~/.workflows

# In another terminal, test OpenCode config
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "workflow_execute",
    "params": {
      "workflow_arn": "arn:local:global:workflow/sdd-full",
      "input": {"goal": "test goal"}
    },
    "id": 1
  }'
```

## Performance Tests

### Concurrent Executions
```bash
# Start server
cargo run --release -- start --workspace ~/.workflows

# Run 10 concurrent executions
for i in {1..10}; do
  curl -X POST http://localhost:8080/mcp \
    -H "Content-Type: application/json" \
    -d "..." &
done
wait
```

### Memory Usage
```bash
# Monitor memory during execution
/usr/bin/time -v cargo run --release -- start
```

## Smoke Tests

Quick validation after changes:

```bash
cargo build --release && cargo test && ./scripts/test-e2e.sh
```

## CI/CD

Add to `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-rust@v1
      - run: cargo build --release
      - run: cargo test
      - run: ./scripts/test-e2e.sh
```

## Test Results Template

| Test Suite | Passed | Failed | Skipped |
|-----------|--------|--------|---------|
| Unit Tests | X | X | X |
| Integration Tests | X | X | X |
| E2E Tests | X | X | X |
| Performance Tests | X | X | X |

## Known Issues

- None currently

## Coverage Goals

| Component | Target |
|-----------|--------|
| Registry | 80% |
| Workflow | 75% |
| MCP Server | 70% |
| Insights | 70% |