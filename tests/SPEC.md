# E2E Test Plan — Comprehensive Coverage Guide

> **Purpose**: This document augments the high-level [TEST-PLAN.md](./TEST-PLAN.md) with concrete
> Playwright standards, a full feature coverage matrix, and implementation guidance for the
> agents-workflows E2E suite. It is the authoritative reference for writing, reviewing,
> and maintaining E2E tests in this repository.

---

## 1. Philosophy and Principles

### 1.1 The Testing Pyramid for This Project

```
          ┌──────────────────┐
          │      E2E        │  ← 112 tests (Playwright, browser)
          │   Studio + MCP  │    Canonical full-system confidence
          ├──────────────────┤
          │  Integration     │  ← Cargo tests (handlers, adapters,
          │   Rust Crates    │    repositories)
          ├──────────────────┤
          │     Unit         │  ← Rust domain tests (aggregates,
          │   Rust Crates    │    state machines, parsers)
          └──────────────────┘
```

**Rule**: E2E tests validate **user-visible behavior**, not implementation details.
Unit and integration tests handle internal correctness.

### 1.2 What E2E Tests Must Verify

- Pages render without crash
- Navigation between pages works
- Data created via MCP/REST appears in Studio
- Layout is structurally correct (sidebar left, content right)
- Critical UI elements are accessible via keyboard
- Error states render when API fails
- CRUD operations survive a page refresh

### 1.3 What E2E Tests Must NOT Verify

- Internal Rust state machine logic (use unit tests)
- Database schema details (use integration tests)
- CSS pixel-perfect positioning (use visual regression + manual QA)
- Performance benchmarks (use dedicated benchmark tooling)
- Edge cases in domain logic (use unit tests)

### 1.4 Core Principle: Deterministic Over Fast

Tests must produce the same result on every run. Avoid:
- Fixed `waitForTimeout()` without documented reason
- Tests that skip when data is absent (`if (items.length === 0) return`)
- Tests that depend on execution timing (polling for terminal states without timeout)

---

## 2. Test Organization

### 2.1 File Structure

```
tests/
├── e2e/
│   ├── studio.spec.ts              # Shell, navigation, workspace selector
│   ├── studio-dashboard.spec.ts    # Dashboard page (Page Object)
│   ├── studio-design-workflows.spec.ts  # Workflow catalog + editor
│   ├── studio-design-agents.spec.ts     # Agent catalog + editor
│   ├── studio-design-skills.spec.ts     # Skill catalog + editor
│   ├── studio-design-prompts.spec.ts    # Prompt catalog + editor
│   ├── studio-design-tools.spec.ts      # Tools catalog + editor
│   ├── studio-design-templates.spec.ts   # Templates catalog + editor
│   ├── studio-observe-executions.spec.ts  # Execution list + detail
│   ├── studio-observe-insights.spec.ts  # Insights page
│   ├── studio-observe-artifacts.spec.ts # Artifacts page
│   ├── studio-observe-metrics.spec.ts   # Metrics page
│   ├── studio-observe-alerts.spec.ts    # Alerts page
│   ├── studio-registry.spec.ts          # Registry resources/overrides/deps
│   ├── studio-admin.spec.ts             # Admin workspaces/settings/integrations
│   ├── studio-command-palette.spec.ts   # Command palette UX
│   ├── studio-theme.spec.ts             # Light/dark theme toggle
│   ├── studio-responsive.spec.ts         # Mobile/tablet/desktop breakpoints
│   ├── agent-execution-flow.spec.ts     # Canonical E2E: seed→execute→observe
│   ├── mcp.spec.ts                     # All 26 MCP tools
│   ├── api.spec.ts                     # REST API CRUD
│   └── workflows.spec.ts                # Workflow execution + state
│
├── helpers/
│   ├── e2e-fixtures.ts             # Fixtures: mcp, rest, seedRegistry
│   ├── mcp-client.ts               # MCP client wrapper
│   ├── page-objects/
│   │   ├── index.ts                # All Page Objects exports
│   │   ├── DashboardPage.ts
│   │   ├── DesignCatalogPage.ts    # Generic: workflows/agents/skills/prompts/tools/templates
│   │   ├── WorkflowEditorPage.ts
│   │   ├── AgentEditorPage.ts
│   │   ├── SkillEditorPage.ts
│   │   ├── PromptEditorPage.ts
│   │   ├── ToolEditorPage.ts
│   │   ├── TemplateEditorPage.ts
│   │   ├── ExecutionListPage.ts
│   │   ├── ExecutionDetailPage.ts
│   │   ├── InsightsPage.ts
│   │   ├── ArtifactsPage.ts
│   │   ├── MetricsPage.ts
│   │   ├── AlertsPage.ts
│   │   ├── RegistryPage.ts
│   │   ├── AdminPage.ts
│   │   └── StudioShell.ts          # Sidebar, TopBar, navigation
│   ├── visual-helpers.ts           # Screenshot, layout assertion helpers
│   └── accessibility-helpers.ts      # Axe-core integration, keyboard nav helpers
│
├── playwright.config.ts
└── SPEC.md                        # This document
```

### 2.2 Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Spec file | `studio-<section>-<page>.spec.ts` | `studio-design-workflows.spec.ts` |
| Page Object class | `<PageName>Page` | `WorkflowEditorPage` |
| Test describe block | `<Section> — <Page>` | `Studio Design — Workflow Editor` |
| Test name | lowercase, hyphenated | `create workflow persists yaml` |
| Fixture | camelCase | `mcp`, `rest`, `seedRegistry` |
| `data-testid` | kebab-case | `sidebar-nav-workflows` |

---

## 3. Playwright Standards

### 3.1 Selectors (Priority Order)

```typescript
// 1. PRIMARY: data-testid for stable, explicit anchors
await page.getByTestId('workflow-catalog-row-sdd-full');

// 2. SECONDARY: Semantic role + accessible name
await page.getByRole('button', { name: 'Create Workflow' });
await page.getByRole('link', { name: 'Dashboard' });

// 3. TERTIARY: Label + form associations
await page.getByLabel('Workflow name');
await page.getByPlaceholder('Search workflows...');

// 4. LAST RESORT: Text content
await page.getByText('Agent Executions');

// NEVER: CSS classes, nth-child, XPath
```

**Rationale**: `data-testid` is explicit and stable. Semantic roles reflect real accessibility contracts. Text content is fragile (changes with localization). CSS classes change with refactors.

### 3.2 Waits — Use Auto-Waiting, Not Fixed Timeouts

```typescript
// ✅ CORRECT: Auto-waiting with assertions
await expect(page.getByTestId('workflow-catalog')).toBeVisible();

// ✅ CORRECT: Wait for network idle after explicit action
await page.getByTestId('create-button').click();
await page.waitForLoadState('networkidle');

// ✅ CORRECT: Explicit wait for API response
const responsePromise = page.waitForResponse(
  r => r.url().includes('/api/workflows') && r.status() === 200
);
await page.getByTestId('refresh-button').click();
await responsePromise;

// ✅ CORRECT: Wait for URL change
await page.waitForURL(/\/workflows\/new\/editor/);

// ❌ WRONG: Fixed timeout — flaky and non-deterministic
await page.waitForTimeout(3000);

// ❌ WRONG: waitForSelector without state
await page.waitForSelector('[data-testid="workflow-catalog"]'); // uses 'visible' by default — OK
// But prefer:
await expect(page.getByTestId('workflow-catalog')).toBeVisible();
```

### 3.3 Assertions — Be Specific

```typescript
// ❌ WRONG: Too vague
await expect(page.locator('main')).toBeVisible();

// ✅ CORRECT: Specific element with specific state
await expect(page.getByTestId('workflow-catalog')).toBeVisible();
await expect(page.getByRole('heading', { name: 'Workflows' })).toHaveText('Workflows');

// ✅ CORRECT: Verify content, not just existence
await expect(page.getByTestId('workflow-catalog-row-sdd-full')).toContainText('SDD Full Pipeline');

// ✅ CORRECT: Verify state transitions
await expect(page.getByTestId('filter-running')).toHaveAttribute('aria-pressed', 'true');

// ✅ CORRECT: Verify URL
await expect(page).toHaveURL(/\/design\/workflows$/);
```

### 3.4 Network Mocking — When to Use

Use `page.route()` to mock flaky or slow external dependencies:

```typescript
// Example: Mock a slow insight computation
test('insights page renders with mock data', async ({ page }) => {
  await page.route('**/api/insights**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ insights: [{ type: 'stage_completed', data: {} }] }),
    });
  });

  await page.goto('/studio/projects/test/observe/insights');
  await expect(page.getByTestId('insights-list')).toBeVisible();
});
```

**Rule**: Mock only for: third-party services, known-flaky endpoints, or creating deterministic test data. Do NOT mock the core MCP/REST endpoints being tested — those must use real integration.

### 3.5 test.step() for Readable Reporting

```typescript
test('create workflow through full flow', async ({ page, rest }) => {
  await test.step('1. Create workflow via REST', async () => {
    const wf = await rest.createWorkflow('e2e-test-wf');
    workflowArn = wf.arn;
  });

  await test.step('2. Verify appears in catalog', async () => {
    await page.goto('/studio/projects/test/design/workflows');
    await expect(page.getByTestId('workflow-catalog-row-e2e-test-wf')).toBeVisible();
  });

  await test.step('3. Open editor and save', async () => {
    await page.getByTestId('workflow-catalog-row-e2e-test-wf').click();
    await expect(page).toHaveURL(/\/workflows\/.*\/editor/);

    // Edit and save
    await page.getByRole('textbox', { name: 'Description' }).fill('Updated via E2E');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved successfully')).toBeVisible();
  });

  await test.step('4. Verify persisted after refresh', async () => {
    await page.reload();
    await expect(page.getByText('Updated via E2E')).toBeVisible();
  });
});
```

---

## 4. Feature Coverage Matrix

### 4.1 Studio Shell

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Shell loads with sidebar, topbar | `studio.spec.ts` | 1 | ✅ |
| Sidebar nav reaches all sections | `studio.spec.ts` | 1 | ✅ |
| Active nav item has `aria-current` | `studio.spec.ts` | 1 | ✅ |
| Sidebar toggle collapses shell | `studio.spec.ts` | 1 | ✅ |
| Workspace selector dropdown | `studio.spec.ts` | 2 | ✅ |
| Theme toggle (light/dark) | `studio.spec.ts` | 1 | ✅ |
| Command palette opens (Ctrl+K) | `studio.spec.ts` | 1 | ✅ |
| Command palette closes (Escape) | `studio.spec.ts` | 1 | ✅ |
| Command palette navigation items | `studio-command-palette.spec.ts` | **missing** | ❌ |
| Command palette executes command | `studio-command-palette.spec.ts` | **missing** | ❌ |
| Invalid route → 404 page | `studio.spec.ts` | 1 | ✅ |
| **Layout: sidebar is left of content** | `studio-responsive.spec.ts` | **missing** | ❌ |
| **Layout: no content clipping** | `studio-responsive.spec.ts` | **missing** | ❌ |
| **Visual: sidebar + content at correct viewport** | `studio-responsive.spec.ts` | **missing** | ❌ |

### 4.2 Dashboard

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Dashboard header renders | `studio-dashboard.spec.ts` | 1 | ✅ |
| KPI strip renders | `studio-dashboard.spec.ts` | 1 | ✅ |
| KPI values are non-zero or zero/empty | `studio-dashboard.spec.ts` | **missing** | ❌ |
| Refresh button reloads data | `studio-dashboard.spec.ts` | 1 | ✅ |
| Executions panel shows table or empty | `studio-dashboard.spec.ts` | 2 | ✅ |
| View All navigates to executions page | `studio-dashboard.spec.ts` | 1 | ✅ |
| Workspaces panel shows cards or empty | `studio-dashboard.spec.ts` | 1 | ✅ |
| Workflows panel shows cards or empty | `studio-dashboard.spec.ts` | 1 | ✅ |
| Create Workflow button navigates | `studio-dashboard.spec.ts` | 1 | ✅ |
| Workspace CRUD appears after REST create | `studio-dashboard.spec.ts` | 1 | ✅ |
| Execution from MCP appears in dashboard | `studio-dashboard.spec.ts` | 1 | ✅ |

### 4.3 Design — Workflows

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Workflow catalog loads | `studio-design-workflows.spec.ts` | 1 | ✅ |
| Seeded workflows appear | `studio-design-workflows.spec.ts` | 1 | ✅ |
| Refresh reloads catalog | `studio-design-workflows.spec.ts` | 1 | ✅ |
| Create button navigates to editor | `studio-design-workflows.spec.ts` | 1 | ✅ |
| Click row opens existing editor | `studio-design-workflows.spec.ts` | 1 | ✅ |
| **New workflow editor renders** | `studio-design-workflows.spec.ts` | 1 | ✅ |
| **Save workflow persists YAML** | `studio-design-workflows.spec.ts` | **missing** | ❌ |
| **YAML editor is editable** | `studio-design-workflows.spec.ts` | **missing** | ❌ |
| **Validation: empty name shows error** | `studio-design-workflows.spec.ts` | **missing** | ❌ |
| **Delete workflow via catalog** | `studio-design-workflows.spec.ts` | **missing** | ❌ |
| **Filter/search workflows** | `studio-design-workflows.spec.ts` | **missing** | ❌ |
| CRUD via REST appears in catalog | `studio-design-workflows.spec.ts` | 1 | ✅ |

### 4.4 Design — Agents

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Agent catalog loads | `studio-design-agents.spec.ts` | 1 | ✅ |
| Seeded agents appear | `studio-design-agents.spec.ts` | 1 | ✅ |
| Create button → editor | `studio-design-agents.spec.ts` | **missing** | ❌ |
| Agent editor renders | `studio-design-agents.spec.ts` | **missing** | ❌ |
| **Agent editor saves model/skills** | `studio-design-agents.spec.ts` | **missing** | ❌ |
| Delete agent via catalog | `studio-design-agents.spec.ts` | **missing** | ❌ |
| CRUD via REST appears | `studio-design-agents.spec.ts` | **missing** | ❌ |

### 4.5 Design — Skills

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Skill catalog loads | `studio-design-skills.spec.ts` | 1 | ✅ |
| Skill editor renders | `studio-design-skills.spec.ts` | **missing** | ❌ |
| **Skill editor saves content/triggers** | `studio-design-skills.spec.ts` | **missing** | ❌ |
| Delete skill | `studio-design-skills.spec.ts` | **missing** | ❌ |
| CRUD via REST appears | `studio-design-skills.spec.ts` | **missing** | ❌ |

### 4.6 Design — Prompts

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Prompt catalog loads | `studio-design-prompts.spec.ts` | 1 | ✅ |
| Prompt editor renders | `studio-design-prompts.spec.ts` | **missing** | ❌ |
| **Prompt editor saves content** | `studio-design-prompts.spec.ts` | **missing** | ❌ |
| Delete prompt | `studio-design-prompts.spec.ts` | **missing** | ❌ |
| CRUD via REST appears | `studio-design-prompts.spec.ts` | **missing** | ❌ |

### 4.7 Design — Tools

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Tools catalog loads | `studio-design-tools.spec.ts` | **missing** | ❌ |
| Tools editor renders | `studio-design-tools.spec.ts` | **missing** | ❌ |
| CRUD via REST appears | `studio-design-tools.spec.ts` | **missing** | ❌ |

### 4.8 Design — Templates

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Templates catalog loads | `studio-design-templates.spec.ts` | **missing** | ❌ |
| Templates editor renders | `studio-design-templates.spec.ts` | **missing** | ❌ |
| CRUD via REST appears | `studio-design-templates.spec.ts` | **missing** | ❌ |

### 4.9 Observe — Agent Executions

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Execution list renders | `studio-observe-executions.spec.ts` | 1 | ✅ |
| Execution from MCP appears | `studio-observe-executions.spec.ts` | 1 | ✅ |
| Status filter buttons toggle | `studio-observe-executions.spec.ts` | 1 | ✅ |
| Click row → detail page | `studio-observe-executions.spec.ts` | **missing** | ❌ |
| Execution detail page renders | `studio-observe-executions.spec.ts` | 1 | ✅ |
| Detail header shows execution ARN | `studio-observe-executions.spec.ts` | 1 | ✅ |
| Tabs: overview, timeline, logs, graph | `studio-observe-executions.spec.ts` | 1 | ✅ |
| Tab switching renders content | `studio-observe-executions.spec.ts` | 1 | ✅ |
| Back button → list | `studio-observe-executions.spec.ts` | 1 | ✅ |
| **Timeline tab shows stage events** | `studio-observe-executions.spec.ts` | **missing** | ❌ |
| **Graph tab renders ReactFlow canvas** | `studio-observe-executions.spec.ts` | **missing** | ❌ |
| **Logs tab shows console output** | `studio-observe-executions.spec.ts` | **missing** | ❌ |

### 4.10 Observe — Insights

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Insights page loads without crash | `studio-observe-insights.spec.ts` | 1 | ✅ |
| **Insights list renders entries** | `studio-observe-insights.spec.ts` | **missing** | ❌ |
| **Insight entry has type + timestamp** | `studio-observe-insights.spec.ts` | **missing** | ❌ |

### 4.11 Observe — Artifacts

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Artifacts page loads without crash | `studio-observe-artifacts.spec.ts` | 1 | ✅ |
| **Artifact list renders entries** | `studio-observe-artifacts.spec.ts` | **missing** | ❌ |
| **Download artifact** | `studio-observe-artifacts.spec.ts` | **missing** | ❌ |

### 4.12 Observe — Metrics

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Metrics page loads without crash | `studio-observe-metrics.spec.ts` | 1 | ✅ |
| **Metrics charts render** | `studio-observe-metrics.spec.ts` | **missing** | ❌ |
| **Token/cost data visible** | `studio-observe-metrics.spec.ts` | **missing** | ❌ |

### 4.13 Observe — Alerts

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Alerts page loads without crash | `studio-observe-alerts.spec.ts` | 1 | ✅ |
| **Alerts list renders** | `studio-observe-alerts.spec.ts` | **missing** | ❌ |
| **Alert severity indicators** | `studio-observe-alerts.spec.ts` | **missing** | ❌ |

### 4.14 Registry

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Registry resources page loads | `studio-registry.spec.ts` | **missing** | ❌ |
| **Resources list renders** | `studio-registry.spec.ts` | **missing** | ❌ |
| **Resource detail view** | `studio-registry.spec.ts` | **missing** | ❌ |
| Registry overrides page loads | `studio-registry.spec.ts` | **missing** | ❌ |
| **Override creation** | `studio-registry.spec.ts` | **missing** | ❌ |
| Registry dependencies page loads | `studio-registry.spec.ts` | **missing** | ❌ |
| **Dependency graph** | `studio-registry.spec.ts` | **missing** | ❌ |

### 4.15 Admin

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Admin workspaces tab loads | `studio-admin.spec.ts` | 1 | ✅ |
| **Workspace detail/edit** | `studio-admin.spec.ts` | **missing** | ❌ |
| Admin settings tab loads | `studio-admin.spec.ts` | **missing** | ❌ |
| **Settings form saves** | `studio-admin.spec.ts` | **missing** | ❌ |
| Admin integrations tab loads | `studio-admin.spec.ts` | **missing** | ❌ |
| **Integrations setup** | `studio-admin.spec.ts` | **missing** | ❌ |

### 4.16 Responsive Design

| Feature | Test File | Test Cases | Status |
|---------|-----------|------------|--------|
| Desktop (1440px): sidebar visible | `studio-responsive.spec.ts` | 1 | ✅ |
| Mobile (375px): menu toggle visible | `studio-responsive.spec.ts` | 1 | ✅ |
| **Mobile: sidebar opens as overlay** | `studio-responsive.spec.ts` | **missing** | ❌ |
| **Mobile: sidebar closes on link click** | `studio-responsive.spec.ts` | **missing** | ❌ |
| **Tablet (768px): sidebar or toggle** | `studio-responsive.spec.ts` | **missing** | ❌ |
| **Layout: sidebar is NOT below content** | `studio-responsive.spec.ts` | **missing** | ❌ |

---

## 5. MCP Tool Coverage (26 Tools)

All tools are tested in `mcp.spec.ts`. Coverage map:

| # | Tool | Has Test | Verifies Real Behavior | Notes |
|---|------|----------|------------------------|-------|
| 1 | `workflow_list` | ✅ | ✅ | Returns array |
| 2 | `workflow_get` | ✅ | ✅ | Returns workflow details |
| 3 | `workflow_get_dag` | ✅ | ✅ | Returns nodes + edges |
| 4 | `workflow_execute` | ✅ | ✅ | Returns arn + status |
| 5 | `workflow_get_state` | ✅ | ✅ | Returns status field |
| 6 | `workflow_update_state` | ✅ | ⚠️ | No verification of persisted change |
| 7 | `workflow_get_next_stage` | ✅ | ⚠️ | Returns suggestion; not verified actionable |
| 8 | `workflow_abort` | ✅ | ✅ | Status becomes 'aborted' |
| 9 | `agent_list` | ✅ | ✅ | Returns array |
| 10 | `agent_get` | ✅ | ✅ | Returns agent details |
| 11 | `agent_query` | ✅ | ✅ | Returns matching agents |
| 12 | `skill_list` | ✅ | ✅ | Returns array |
| 13 | `skill_get` | ✅ | ✅ | Returns skill details |
| 14 | `skill_query` | ✅ | ✅ | Returns matching skills |
| 15 | `prompt_list` | ✅ | ✅ | Returns array |
| 16 | `prompt_get` | ✅ | ✅ | Returns prompt details |
| 17 | `execution_list` | ✅ | ✅ | Returns executions |
| 18 | `execution_get` | ❌ | ❌ | **Missing** |
| 19 | `execution_history` | ✅ | ✅ | Returns history entries |
| 20 | `artifact_create` | ✅ | ✅ | Returns arn + name |
| 21 | `artifact_get` | ✅ | ✅ | Returns artifact content |
| 22 | `artifact_list` | ✅ | ✅ | Returns artifact list |
| 23 | `insights_log` | ✅ | ✅ | Returns id |
| 24 | `insights_query` | ✅ | ✅ | Returns insights |
| 25 | `metrics_query` | ✅ | ✅ | Returns metrics + total_tokens |
| 26 | `metrics_subscribe` | ✅ | ✅ | Returns SSE URL |

### 5.1 MCP Test Pattern: Full CRUD Cycle

Each CRUD tool (create → get → update → delete) must verify the **change persisted**:

```typescript
test('workflow CRUD: create → get → update → verify → delete', async () => {
  const client = new MCPClient(BASE_URL);

  // 1. Create
  const raw = await client.request('workflow_create', {
    name: 'e2e-crud-test',
    scope: 'project/test',
    stages: [{ id: 'explore', name: 'Explore' }],
  });
  const created = client.parseToolResult(raw) as { arn: string };
  expect(created.arn).toContain('workflow/e2e-crud-test');

  // 2. Get — verify data matches what we created
  const rawGet = await client.request('workflow_get', { arn: created.arn });
  const fetched = client.parseToolResult(rawGet) as { arn: string; name: string; stages: unknown[] };
  expect(fetched.arn).toBe(created.arn);
  expect(fetched.name).toBe('e2e-crud-test');
  expect(fetched.stages).toHaveLength(1);

  // 3. Update
  const rawUpdate = await client.request('workflow_update', {
    arn: created.arn,
    description: 'Updated description',
  });
  const updated = client.parseToolResult(rawUpdate) as { arn: string; description: string };
  expect(updated.description).toBe('Updated description');

  // 4. Verify persisted via GET
  const rawVerify = await client.request('workflow_get', { arn: created.arn });
  const verified = client.parseToolResult(rawVerify) as { description: string };
  expect(verified.description).toBe('Updated description');

  // 5. Delete
  await client.request('workflow_delete', { arn: created.arn });

  // 6. Verify deleted (404 or similar)
  const rawDeleted = await client.request('workflow_get', { arn: created.arn });
  const deletedResult = client.parseToolResult(rawDeleted);
  expect(deletedResult).toBeNull();
});
```

**Current gap**: Most CRUD tools are tested in `api.spec.ts` with REST, but `mcp.spec.ts` only tests one direction (usually create). The full cycle above should be added for each tool.

---

## 6. Visual Regression Strategy

### 6.1 Approach

Use Playwright's built-in `toHaveScreenshot()` for critical pages. Screenshots catch layout regressions that no amount of DOM assertion can catch.

### 6.2 Implementation

```typescript
// Install: npx playwright install --with-deps
// Baselines stored in: tests/.screenshots/

test('dashboard matches baseline screenshot', async ({ page }) => {
  await page.goto('/studio/projects/test');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('dashboard.png', {
    fullPage: true,
    maxDiffPixels: 50,   // allow tiny rendering differences
    maxDiffPixelRatio: 0.01, // 1% pixel difference threshold
  });
});

test('workflow editor matches baseline', async ({ page }) => {
  await page.goto('/studio/projects/test/design/workflows/sdd-full/editor');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('workflow-editor.png', {
    fullPage: false,     // only viewport, not full scroll
    animations: 'disabled', // disable CSS animations for consistency
  });
});

// Test key page states
test('workflow editor — validation error state', async ({ page }) => {
  await page.goto('/studio/projects/test/design/workflows/new/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Save' }).click();
  // Wait for validation error to appear
  await expect(page.getByText('Name is required')).toBeVisible();
  await expect(page).toHaveScreenshot('workflow-editor-validation-error.png');
});
```

### 6.3 CI Integration

```typescript
// In playwright.config.ts:
{
  use: {
    screenshot: 'only-on-failure',  // default: capture on failure
  },
  // For baseline generation (run once before release):
  // npx playwright test --update-snapshots
}

// In CI (GitHub Actions):
// - name: Run visual regression
//   run: npx playwright test --update-snapshots --project=chromium
// - name: Upload baseline
//   if: github.event_name == 'push'
//   uses: actions/upload-artifact@v4
//   with:
//     name: screenshots-baseline
//     path: tests/.screenshots/
```

### 6.4 Pages to screenshot-baseline immediately

1. Dashboard (`/studio/projects/test`)
2. Workflow catalog (`/studio/projects/test/design/workflows`)
3. Workflow editor with content (`/studio/projects/test/design/workflows/sdd-full/editor`)
4. Agent executions list (`/studio/projects/test/observe/agent-executions`)
5. Execution detail with tabs (`/studio/projects/test/observe/agent-executions/:id`)

---

## 7. Accessibility Strategy

### 7.1 axe-core Integration

```typescript
// helpers/accessibility-helpers.ts
import AxeBuilder from '@axe-core/playwright';

export async function runAccessibilityScan(page: Page, context: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('#third-party-widget')  // if any
    .analyze();

  if (results.violations.length > 0) {
    console.error(`Accessibility violations in ${context}:`);
    for (const v of results.violations) {
      console.error(`  - ${v.id}: ${v.description} (${v.nodes.length} nodes)`);
    }
  }

  return results;
}

// Usage in test:
test('dashboard has no accessibility violations', async ({ page }) => {
  await page.goto('/studio/projects/test');
  const results = await runAccessibilityScan(page, 'Dashboard');
  expect(results.violations).toEqual([]);
});
```

### 7.2 Keyboard Navigation

```typescript
test('sidebar nav is keyboard accessible', async ({ page }) => {
  await page.goto('/studio/projects/test');
  await page.keyboard.press('Tab'); // Focus first element

  // Tab through navigation items
  await page.keyboard.press('Tab'); // Should reach sidebar toggle
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  // Verify focused element is interactable and has visible focus indicator

  // Enter activates
  await page.keyboard.press('Enter');
});

// Command palette keyboard nav
test('command palette keyboard navigation', async ({ page }) => {
  await page.goto('/studio/projects/test');
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette-dialog')).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  // Should navigate to selected item
});
```

### 7.3 Required Accessibility Tests

| Page | WCAG Target | Test |
|------|------------|------|
| Dashboard | AA | No axe violations |
| All catalogs | AA | Tab navigation reaches all actions |
| Forms (editors) | AA | Labels associated with inputs |
| Command palette | AA | Arrow keys navigate, Enter activates |
| Error/empty states | AA | Screen reader announces state |

---

## 8. Layout Testing Strategy

Layout bugs (sidebar rendering below content) were undetected because tests only checked `toBeVisible()`. We need explicit geometry assertions:

### 8.1 Sidebar + Content Position Tests

```typescript
// helpers/visual-helpers.ts

export async function assertSidebarLeftOfContent(page: Page) {
  const sidebar = page.getByTestId('sidebar-navigation');
  const content = page.getByTestId('project-dashboard'); // or whatever main content

  const sidebarBox = await sidebar.boundingBox();
  const contentBox = await content.boundingBox();

  if (!sidebarBox || !contentBox) {
    throw new Error('Sidebar or content not found in DOM');
  }

  // Sidebar should be to the LEFT of content
  expect(sidebarBox.x + sidebarBox.width).toBeLessThan(contentBox.x + 10);
  // Allow 10px tolerance for rounding

  // Sidebar and content should OVERLAP in vertical axis (same row)
  expect(sidebarBox.y).toBeLessThan(contentBox.y + contentBox.height);
  expect(contentBox.y).toBeLessThan(sidebarBox.y + sidebarBox.height);
}

export async function assertNoVerticalOverflow(page: Page, testId: string) {
  const element = page.getByTestId(testId);
  const box = await element.boundingBox();
  const viewport = page.viewportSize();

  if (!box || !viewport) return;

  // Element should not extend beyond viewport
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}
```

### 8.2 Layout Test in Responsive Spec

```typescript
test('desktop: sidebar is left of content, not above or below', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studio/projects/test');

  await assertSidebarLeftOfContent(page);
  await assertNoVerticalOverflow(page, 'sidebar-navigation');
});

test('dashboard cards are not clipped by overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/studio/projects/test');
  await page.waitForLoadState('networkidle');

  const kpiSection = page.getByTestId('dashboard-kpi-section');
  const kpiBox = await kpiSection.boundingBox();
  const viewport = page.viewportSize();

  expect(kpiBox.y + kpiBox.height).toBeLessThanOrEqual(viewport.height);
});
```

---

## 9. Page Object Model Standards

### 9.1 When to Create a Page Object

Create a Page Object when:
- A page is used in 3+ tests
- A page has complex interactions (tabs, multi-step forms)
- A page is a critical path (dashboard, execution detail)

Do NOT create a Page Object for:
- One-off pages tested in a single spec
- Pages with only simple `goto()` + assertions

### 9.2 Page Object Template

```typescript
// helpers/page-objects/WorkflowEditorPage.ts
import type { Page, Locator } from '@playwright/test';

export class WorkflowEditorPage {
  readonly page: Page;

  // READ ONLY: Locators (no-op getters)
  readonly root: Locator;
  readonly header: Locator;
  readonly nameInput: Locator;
  readonly yamlEditor: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;
  readonly validationError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('workflow-editor-page');
    this.header = page.getByTestId('workflow-editor-header');
    this.nameInput = page.getByLabel('Workflow name');
    this.yamlEditor = page.locator('textarea').first();
    this.saveButton = page.getByRole('button', { name: 'Save' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
    this.validationError = page.getByTestId('workflow-editor-validation-error');
  }

  // INTERACTIONS: Composable user actions
  async goto(workflowId: string, projectId = 'test') {
    await this.page.goto(
      `/studio/projects/${projectId}/design/workflows/${workflowId}/editor`
    );
    await this.page.waitForLoadState('domcontentloaded');
  }

  async gotoNew(projectId = 'test') {
    await this.page.goto(
      `/studio/projects/${projectId}/design/workflows/new/editor`
    );
    await this.page.waitForLoadState('domcontentloaded');
  }

  async fillName(name: string) {
    await this.nameInput.clear();
    await this.nameInput.fill(name);
  }

  async fillYaml(yaml: string) {
    await this.yamlEditor.clear();
    await this.yamlEditor.fill(yaml);
  }

  async save() {
    await this.saveButton.click();
    // Wait for save to complete (network or UI feedback)
    await this.page.waitForResponse(
      r => r.url().includes('/api/workflows') && r.status() < 400,
      { timeout: 5000 }
    ).catch(() => {}); // Ignore timeout if no matching request
  }

  // STATE: Queries that return testable assertions
  async hasValidationError(): Promise<boolean> {
    return this.validationError.isVisible().catch(() => false);
  }

  async isDirty(): Promise<boolean> {
    return this.saveButton.isEnabled();
  }
}
```

### 9.3 Page Object Usage in Tests

```typescript
test('create workflow and save YAML', async ({ page }) => {
  const editor = new WorkflowEditorPage(page);

  await editor.gotoNew();
  await expect(editor.root).toBeVisible();

  await editor.fillName('My Test Workflow');
  await editor.fillYaml('stages:\n  - id: explore\n    name: Explore');

  await editor.save();

  // Verify navigation back to catalog
  await expect(page).toHaveURL(/\/design\/workflows$/);
  await expect(page.getByTestId('workflow-catalog-row-my-test-workflow')).toBeVisible();
});
```

### 9.4 DesignCatalogPage — Generic for All Resource Types

```typescript
// Reusable for workflows, agents, skills, prompts, tools, templates
export class DesignCatalogPage {
  constructor(
    private page: Page,
    private resourceType: 'workflow' | 'agent' | 'skill' | 'prompt' | 'tool' | 'template'
  ) {}

  private testId(key: string) {
    return `${this.resourceType}-catalog-${key}`;
  }

  get root() { return this.page.getByTestId(`${this.resourceType}-catalog-page`); }
  get list() { return this.page.getByTestId(this.testId('list')); }
  get refreshButton() { return this.page.getByTestId(this.testId('refresh')); }
  get createButton() { return this.page.getByTestId(this.testId('create')); }

  row(name: string): Locator {
    const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return this.page.getByTestId(this.testId(`row-${safe}`));
  }

  async goto(projectId: string) {
    await this.page.goto(`/studio/projects/${projectId}/design/${this.resourceType}s`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async create() {
    await this.createButton.click();
    await this.page.waitForURL(new RegExp(`/${this.resourceType}s/new/editor`));
  }
}
```

---

## 10. Fixture Standards

### 10.1 Required Fixtures

| Fixture | Purpose | Scope |
|---------|---------|-------|
| `mcp` | MCP client for tool calls | Per-test |
| `rest` | REST client for CRUD | Per-test |
| `seedRegistry` | Cleanup registration | Per-test, auto-cleanup |
| `pageEvidence` | Screenshot/video capture | Per-test |

### 10.2 MCP Fixture

```typescript
// Reuse existing MCPClient, ensure it's initialized before use
mcp: async ({}, use) => {
  const client = new MCPClient(BASE_URL);
  await client.initialize();
  await use(client);
},
```

### 10.3 REST Fixture

```typescript
rest: async ({}, use) => {
  const client = new RestSeedClient(REST_URL);
  await use(client);
  // No explicit cleanup — seedRegistry handles teardown
},
```

### 10.4 Seed Registry — Cleanup Rules

```typescript
// Register cleanup BEFORE the operation (so it runs even if test fails)
test('create and delete workflow', async ({ rest, seedRegistry }) => {
  const wf = await rest.createWorkflow('temp-wf');
  // Register FIRST — cleanup runs even if assertion fails
  seedRegistry.register(() => rest.deleteWorkflow(wf.arn));

  // Assert
  expect(wf.arn).toContain('temp-wf');

  // Cleanup runs automatically after test via seedRegistry.cleanupAll()
});
```

### 10.5 Test Data: Isolation Requirements

| Data Type | Isolation Strategy | Rationale |
|-----------|-------------------|-----------|
| Workflows | Per-test unique name + cleanup | Avoid collisions across runs |
| Workspaces | Per-test unique ID + cleanup | Same |
| Agents/Skills/Prompts | Per-test unique name + cleanup | Same |
| Executions | Ephemeral workspace IDs (`test-${Date.now()}-${random}`) | Auto-cleanup via workspace teardown |
| Studio UI state | Per-test fresh page via `page.goto()` | No shared state between tests |

---

## 11. Test Data Management

### 11.1 Global Baseline Data

Global seed data (loaded once per test session via `global-setup.ts`):
- 1 workflow: `sdd-full` (ARN: `arn:local:global:workflow/sdd-full`)
- 1 agent: `orchestrator` (if seeded)
- 1 skill: `sdd-explore` (if seeded)

Tests may read this data but **must not mutate it**.

### 11.2 Per-Test Data

```typescript
// Pattern for unique, isolated test data
const uniqueName = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test('delete removes from catalog', async ({ rest, seedRegistry }) => {
  const name = uniqueName('del-wf');
  const wf = await rest.createWorkflow(name);
  seedRegistry.register(() => rest.deleteWorkflow(wf.arn));

  await rest.deleteWorkflow(wf.arn);

  // Verify deleted
  const raw = await rest.getWorkflow(wf.arn); // should 404
  expect(raw).toBeNull();
});
```

### 11.3 Workspace Isolation

```typescript
// Each execution uses a unique workspace so data doesn't bleed
const execWorkspace = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
await client.request('workflow_execute', {
  workflow_arn: workflowArn,
  workspace_id: execWorkspace,  // unique per test
  input: {},
});
// Workspace is ephemeral — no cleanup needed
```

---

## 12. CI/CD Integration

### 12.1 Test Execution Matrix

| Trigger | Tests Run | Workers |
|---------|-----------|---------|
| Every push | Smoke (shell + 1 CRUD + 1 exec flow) | 3 |
| PR to main | Full regression (all 112+ tests) | 3 |
| Scheduled (nightly) | Full + cross-browser (chromium + firefox + webkit) | 1 each |
| Manual trigger | User-selected subset | configurable |

### 12.2 Smoke Suite (Fast Gate)

```bash
# Run in <2 min for every push
npx playwright test \
  --project=chromium \
  --grep "smoke|shell|navigation" \
  --workers=3
```

Define smoke tests with a tag:

```typescript
test.describe('smoke', () => {
  test('shell loads', async ({ page }) => {
    // ...
  });
});
```

### 12.3 Full Regression

```bash
# Run all in ~5 min (3 workers, parallel)
npx playwright test --project=chromium --workers=3
```

### 12.4 Cross-Browser (Nightly)

```bash
npx playwright test --project=chromium --project=firefox --project=webkit
```

Note: Firefox and WebKit projects are defined in `playwright.config.ts` but currently
not run in CI. Add them to the nightly pipeline.

### 12.5 Visual Baseline Update (Release)

```bash
# Run before release to update baselines
npx playwright test --project=chromium --update-snapshots
git add tests/.screenshots/
git commit -m "chore: update visual baselines"
```

---

## 13. Known Issues and Remediation

| Issue | Impact | Remediation |
|-------|--------|-------------|
| Layout bug (sidebar below content) undetected for months | Critical | Add layout geometry tests + visual regression |
| Editor CRUD tests missing | High | Add save/validate/delete for all 6 editor types |
| Observe pages (insights/artifacts/metrics/alerts) only test "no crash" | Medium | Add data rendering assertions |
| Registry and Admin pages have zero E2E coverage | High | Add full coverage for all subpages |
| 5 tests skip when workflows missing | Low | Seed data ensures workflows always exist |
| `workflow_update_state` test doesn't verify persisted change | Medium | Add GET after update to verify |
| Cross-browser (Firefox/WebKit) not run in CI | Low | Add to nightly pipeline |
| No network mocking for flaky tests | Medium | Add `page.route()` for known-flaky endpoints |

---

## 14. Test Execution Reference

```bash
# Local development (attach to running server)
E2E_MODE=attach SKIP_CONTAINER_CHECK=1 npx playwright test

# UI tests only
E2E_MODE=attach SKIP_CONTAINER_CHECK=1 npx playwright test --project=chromium

# Single test
npx playwright test e2e/studio-design-workflows.spec.ts:14 --project=chromium

# With trace (debug mode)
npx playwright test e2e/studio.spec.ts:71 --trace on

# With video (debug mode)
npx playwright test e2e/studio.spec.ts:71 --video on

# With headed browser (visible)
npx playwright test e2e/studio.spec.ts:71 --headed

# Update visual baselines
npx playwright test --project=chromium --update-snapshots

# Generate test (codegen — open page and record)
npx playwright codegen http://localhost:8080/studio
```

---

## 15. Coverage Scorecard

| Category | Tests | Coverage |
|----------|-------|----------|
| Studio Shell | 9 | 65% |
| Dashboard | 10 | 80% |
| Design: Workflows | 8 | 60% |
| Design: Agents | 2 | 30% |
| Design: Skills | 2 | 20% |
| Design: Prompts | 2 | 20% |
| Design: Tools | 0 | 0% |
| Design: Templates | 0 | 0% |
| Observe: Executions | 7 | 70% |
| Observe: Insights | 1 | 20% |
| Observe: Artifacts | 1 | 20% |
| Observe: Metrics | 1 | 20% |
| Observe: Alerts | 1 | 20% |
| Registry | 0 | 0% |
| Admin | 1 | 20% |
| Responsive/Layout | 2 | 30% |
| Command Palette | 2 | 50% |
| Theme | 1 | 100% |
| MCP (26 tools) | 26 | 85% |
| REST API | ~20 | 80% |
| Canonical E2E Flow | 3 | 60% |
| **TOTAL** | **~112** | **~55%** |

**Goal**: Reach 85%+ coverage with the improvements outlined in this plan.

---

## 16. Implementation Priority

### Phase 1: Fix Fragile Tests (High Impact, Low Effort)
1. Add layout geometry tests (sidebar left of content)
2. Add visual regression baselines for 5 critical pages
3. Fix `workflow_update_state` to verify persisted change
4. Fix skip-on-missing-data patterns

### Phase 2: Complete CRUD Coverage (High Impact, Medium Effort)
5. Add save/validate for Workflow Editor
6. Add Agent, Skill, Prompt, Tool, Template editors (CRUD)
7. Add Registry pages coverage (resources, overrides, deps)
8. Add Admin pages coverage (workspaces detail, settings form)

### Phase 3: Observe Pages (Medium Impact, Medium Effort)
9. Add insights/artifacts/metrics/alerts data rendering tests
10. Execution detail: timeline, graph, logs assertions

### Phase 4: Quality Improvements (Low Impact, High Effort)
11. axe-core accessibility scan on all pages
12. Keyboard navigation tests
13. Network mocking for flaky endpoints
14. Cross-browser nightly run (Firefox + WebKit)
15. Command palette execute-command tests
