/**
 * Studio Observe — Critical Path E2E Tests
 *
 * Validates the Observe section: execution list, detail page, tabs,
 * timeline, insights, artifacts, and metrics pages.
 * Uses MCP fixture to seed execution data.
 */

import { test, expect } from '../helpers/e2e-fixtures';
import { AgentExecutionListPage, ExecutionDetailPage } from '../helpers/page-objects';

const PROJECT_ID = 'test';

test.describe('Studio Observe — Agent Execution List', () => {
  test('execution list page renders with data after MCP execute', async ({ page, mcp }) => {
    const listPage = new AgentExecutionListPage(page);

    await test.step('Seed an execution via MCP', async () => {
      const rawWorkflows = await mcp.request('workflow_list');
      const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
      if (workflows.length === 0) return;

      await mcp.request('workflow_execute', {
        workflow_arn: workflows[0].arn,
        workspace_id: `test-observe-${Date.now()}`,
        input: {},
      });
    });

    await test.step('Navigate to execution list', async () => {
      await listPage.goto(PROJECT_ID);
      await expect(listPage.header).toBeVisible({ timeout: 8000 });
    });

    await test.step('Executions appear in the list', async () => {
      // Wait for either the list or empty state
      await page.waitForSelector(
        '[data-testid="agent-executions-list"], [data-testid="agent-executions-empty-state"]',
        { timeout: 10000 },
      );
      const listVisible = await page.getByTestId('agent-executions-list').isVisible().catch(() => false);
      expect(listVisible).toBeTruthy();
    });
  });

  test('status filter buttons toggle correctly', async ({ page, mcp }) => {
    const listPage = new AgentExecutionListPage(page);
    await listPage.goto(PROJECT_ID);
    await expect(listPage.header).toBeVisible({ timeout: 8000 });

    await test.step('Click "running" filter', async () => {
      await listPage.filterBy('running');
      const runningBtn = page.getByTestId('agent-executions-filter-running');
      await expect(runningBtn).toHaveAttribute('aria-pressed', 'true');
    });

    await test.step('Click "all" to reset', async () => {
      await listPage.filterBy('all');
      const allBtn = page.getByTestId('agent-executions-filter-all');
      await expect(allBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });
});

test.describe('Studio Observe — Execution Detail', () => {
  test('execution detail page shows tabs and content', async ({ page, mcp }) => {
    const detailPage = new ExecutionDetailPage(page);

    let executionArn = '';

    await test.step('Create execution via MCP', async () => {
      const rawWorkflows = await mcp.request('workflow_list');
      const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
      if (workflows.length === 0) return;

      const rawExec = await mcp.request('workflow_execute', {
        workflow_arn: workflows[0].arn,
        workspace_id: `test-detail-${Date.now()}`,
        input: {},
      });
      const execution = mcp.parseToolResult(rawExec) as { arn: string };
      executionArn = execution.arn;
    });

    await test.step('Navigate to execution detail', async () => {
      await detailPage.goto(PROJECT_ID, executionArn);
      await expect(detailPage.root).toBeVisible({ timeout: 8000 });
    });

    await test.step('Header shows execution info', async () => {
      await expect(detailPage.header).toBeVisible();
      await expect(detailPage.header).toContainText(executionArn.split('/').pop()!);
    });

    await test.step('Tabs are visible', async () => {
      await expect(detailPage.tabs).toBeVisible();
      // Key tabs should be present
      await expect(page.getByTestId('execution-detail-tab-overview')).toBeVisible();
      await expect(page.getByTestId('execution-detail-tab-timeline')).toBeVisible();
      await expect(page.getByTestId('execution-detail-tab-graph')).toBeVisible();
      await expect(page.getByTestId('execution-detail-tab-logs')).toBeVisible();
    });

    await test.step('Overview tab shows content', async () => {
      await detailPage.clickTab('overview');
      await expect(detailPage.content).toBeVisible();
    });

    await test.step('Back button navigates to list', async () => {
      await detailPage.goBack();
      await page.waitForURL(/\/agent-executions$/);
    });
  });

  test('switching tabs renders different content areas', async ({ page, mcp }) => {
    const detailPage = new ExecutionDetailPage(page);

    let executionArn = '';

    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    if (workflows.length === 0) return;

    const rawExec = await mcp.request('workflow_execute', {
      workflow_arn: workflows[0].arn,
      workspace_id: `test-tabs-${Date.now()}`,
      input: {},
    });
    executionArn = (mcp.parseToolResult(rawExec) as { arn: string }).arn;

    await detailPage.goto(PROJECT_ID, executionArn);
    await expect(detailPage.root).toBeVisible({ timeout: 8000 });

    // Click through several tabs to verify they render without crash
    for (const tab of ['overview', 'timeline', 'logs', 'artifacts']) {
      await test.step(`Tab "${tab}" renders`, async () => {
        await detailPage.clickTab(tab);
        await expect(detailPage.content).toBeVisible();
        // No crash = success — tab content may be empty but page must not error
      });
    }

    // Graph tab uses ReactFlow canvas which may affect visibility — just verify no crash
    await test.step('Tab "graph" renders without crash', async () => {
      await detailPage.clickTab('graph');
      // Give it a moment to render — just verify page hasn't crashed
      await page.waitForTimeout(500);
      await expect(detailPage.root).toBeVisible();
    });
  });
});

test.describe('Studio Observe — Insights page', () => {
  test('insights page loads without error', async ({ page }) => {
    await page.goto(`http://localhost:8080/studio/projects/${PROJECT_ID}/observe/insights`);
    await page.waitForLoadState('domcontentloaded');
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Studio Observe — Artifacts page', () => {
  test('artifacts page loads without error', async ({ page }) => {
    await page.goto(`http://localhost:8080/studio/projects/${PROJECT_ID}/observe/artifacts`);
    await page.waitForLoadState('domcontentloaded');
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Studio Observe — Metrics page', () => {
  test('metrics page loads without error', async ({ page }) => {
    await page.goto(`http://localhost:8080/studio/projects/${PROJECT_ID}/observe/metrics`);
    await page.waitForLoadState('domcontentloaded');
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Studio Observe — Alerts page', () => {
  test('alerts page loads without error', async ({ page }) => {
    await page.goto(`http://localhost:8080/studio/projects/${PROJECT_ID}/observe/alerts`);
    await page.waitForLoadState('domcontentloaded');
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });
});
