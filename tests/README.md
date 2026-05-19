# E2E Tests for agents-workflows

## Overview

TypeScript/Playwright E2E tests covering:
- **REST API** - All REST endpoints
- **MCP Protocol** - All 26 MCP tools
- **Workflow Execution** - Complete execution scenarios
- **Studio UI** - Browser automation with Playwright

## Structure

```
tests/
├── package.json           # Node dependencies
├── playwright.config.ts   # Playwright configuration
├── tsconfig.json         # TypeScript config
├── e2e/
│   ├── rest-api.spec.ts  # REST API tests
│   ├── mcp.spec.ts      # MCP protocol tests (26 tools)
│   ├── workflows.spec.ts # Workflow execution tests
│   └── studio.spec.ts     # Studio UI browser tests
├── ui/                   # UI-specific tests
├── containers/
│   ├── start-container.sh
│   └── stop-container.sh
└── helpers/
    ├── global-setup.ts
    ├── global-teardown.ts
    └── mcp-client.ts
```

## Quick Start

### 1. Install dependencies
```bash
just test:install
```

### 2. Start container
```bash
just test:container:up
```

### 3. Run all tests
```bash
just test:e2e
```

### 4. Stop container
```bash
just test:container:down
```

## Available Commands

| Command | Description |
|---------|-------------|
| `just test:install` | Install npm dependencies |
| `just test:container:up` | Start test container |
| `just test:container:down` | Stop test container |
| `just test:container:restart` | Restart container |
| `just test:e2e` | Run all E2E tests |
| `just test:api` | Run REST API tests only |
| `just test:mcp` | Run MCP protocol tests only |
| `just test:workflows` | Run workflow tests only |
| `just test:ui` | Run UI browser tests only |
| `just test:headed` | Run with visible browser |
| `just test:debug` | Run in debug mode |
| `just test:report` | Show HTML report |
| `just test:logs` | Show container logs |

## Test Projects

Playwright is configured with multiple projects:

- **api** - Fast API tests (no browser)
- **mcp** - MCP protocol tests
- **workflows** - Workflow execution tests
- **chromium** - UI tests with Chrome
- **firefox** - UI tests with Firefox

Run specific project:
```bash
cd tests && npx playwright test --project=api
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTS_WORKFLOWS_URL` | http://localhost:8080 | Base URL for MCP |
| `AGENTS_WORKFLOWS_REST_URL` | http://localhost:8081 | Base URL for REST API |
| `TEST_WORKSPACE_ID` | auto-generated | Isolated workspace per session |

## Artifacts

- **Test results**: `tests/test-results/`
- **HTML Report**: `tests/playwright-report/`
- **Workspace data**: `~/.workflows/workspaces/test-{timestamp}/`

Artifacts are **always preserved** per decision to allow post-test inspection.

## CI Integration

Tests can be triggered with specific tags:

```bash
# In GitHub Actions or locally
just test:ci test-tag=test:e2e
just test:ci test-tag=test:ui
```

## Architecture Decisions

| Decision | Choice |
|----------|--------|
| Language | TypeScript + Playwright |
| Container management | Shell scripts + just |
| Test isolation | Suite unique with shared container |
| Workspace strategy | `test-{timestamp}/` per session |
| Artifact preservation | Always keep |
