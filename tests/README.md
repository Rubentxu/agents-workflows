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
│   ├── api.spec.ts       # REST API tests
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
just test_install
```

### 2. Start container (canonical / CI)
```bash
just test_container_up
```

### 3. Run all tests
```bash
just test_e2e
```

### Local attach mode
If the server is already running on `localhost:8080/8081`:

```bash
cd tests && npm run test:local
```

### 4. Stop container
```bash
just test_container_down
```

## Available Commands

| Command | Description |
|---------|-------------|
| `just test_install` | Install npm dependencies |
| `just test_container_up` | Start test container |
| `just test_container_down` | Stop test container |
| `just test_container_restart` | Restart container |
| `just test_e2e` | Run all E2E tests in container mode |
| `just test_e2e_local` | Run all E2E tests against an existing local server |
| `just test_api` | Run REST API tests only |
| `just test_mcp` | Run MCP protocol tests only |
| `just test_workflows` | Run workflow tests only |
| `just test_ui` | Run UI browser tests only |
| `just test_headed` | Run with visible browser |
| `just test_debug` | Run in debug mode |
| `just test_report` | Show HTML report |
| `just test_logs` | Show container logs |

## Test Projects

Playwright is configured with multiple projects:

- **api** - Fast API tests (no browser)
- **mcp** - MCP protocol tests
- **workflows** - Workflow execution tests
- **chromium** - UI tests with Chrome

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

Evidence policy:

- **Default**: screenshot on failure, trace on first retry locally, trace retained on failure in CI, video on failure
- **Workflow/system flows**: stronger retention to aid diagnosis of MCP and state regressions

## Execution modes

- **container** — canonical mode for CI and official suite runs
- **attach** — local developer mode against an already running server

Use `E2E_MODE=attach SKIP_CONTAINER_CHECK=1` for local runs.

## CI Integration

Tests can be triggered with specific tags:

```bash
# In GitHub Actions or locally
just test_ci test_tag=test_e2e
just test_ci test_tag=test_ui
```

## Architecture Decisions

| Decision | Choice |
|----------|--------|
| Language | TypeScript + Playwright |
| Container management | Shell scripts + just |
| Test isolation | Hybrid: suite seed for readonly flows, isolated resources for destructive flows |
| Workspace strategy | `test-{timestamp}/` per session |
| Artifact preservation | Always keep |
| Runtime mode | Container in CI, attach mode for local development |
