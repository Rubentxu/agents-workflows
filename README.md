# agents-workflows

Federated agentic workflow system with centralized MCP backend, portable skills, and visual Studio.

## Quick Start

```bash
# Install
cargo install --path crates/mcp-server

# Initialize workspace
agents-workflows-server init

# Start server
agents-workflows-server start

# Open Studio
open http://localhost:8080/studio
```

## Architecture

- **Single Binary**: Everything in one executable
- **MCP Server**: Rich orchestration API on port 8080
- **REST API**: Admin CRUD on port 8081
- **Studio**: Visual workflow builder embedded

## Documentation

- [SPEC.md](SPEC.md) - Full specification
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Architecture overview
- [MCP-API.md](docs/MCP-API.md) - MCP API reference
- [REST-API.md](docs/REST-API.md) - REST API reference
- [ORCHESTRATOR.md](docs/ORCHESTRATOR.md) - Orchestrator agent design
- [IDE-CONFIG.md](docs/IDE-CONFIG.md) - IDE setup guide
- [ROADMAP.md](docs/ROADMAP.md) - Implementation roadmap

## Development

```bash
# Build
cargo build

# Test
cargo test

# E2E test
./scripts/test-e2e.sh

# Benchmark
./scripts/benchmark.sh
```

## License

MIT