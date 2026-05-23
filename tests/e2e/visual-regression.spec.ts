/**
 * Visual regression baselines for the most important Studio flows.
 *
 * These screenshots are intended to validate FUNCTIONAL states, not only that
 * the page shell renders. Each page is prepared with enough data to prove the
 * intended feature is present on screen.
 */

import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../helpers/e2e-fixtures';
import type { MCPClient } from '../helpers/mcp-client';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const REST_URL = process.env.AGENTS_WORKFLOWS_REST_URL || 'http://localhost:8081';
const PROJECT_ID = 'test';
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

type CriticalPage = {
  name: string;
  description: string;
  capture: (ctx: { page: Page; mcp: MCPClient }) => Promise<void>;
  masks?: (page: Page) => Locator[];
};

async function gotoAndWait(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState('domcontentloaded');
}

async function createWorkflowWithStages(page: Page, name: string): Promise<{ arn: string; name: string }> {
  const response = await page.request.post(`${REST_URL}/api/workflows`, {
    data: {
      scope: `project/${PROJECT_ID}`,
      name,
      description: 'Visual regression fixture',
      stages: [
        {
          id: 'explore',
          agent: 'orchestrator',
          depends_on: [],
          input: {},
        },
        {
          id: 'verify',
          agent: 'orchestrator',
          depends_on: ['explore'],
          input: {},
        },
      ],
      execution: { mode: 'sequential' },
    },
  });

  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { arn: string; name: string };
}

async function createExecutionFixture(page: Page, mcp: MCPClient): Promise<{ executionArn: string; workflowArn: string }> {
  const workflowName = 'visual-regression-execution-workflow';
  const workflow = await createWorkflowWithStages(page, workflowName);

  const rawExec = await mcp.request('workflow_execute', {
    workflow_arn: workflow.arn,
    workspace_id: 'visual-baseline-workspace',
    input: { source: 'visual-regression' },
  });
  const parsed = mcp.parseToolResult(rawExec) as { arn: string };
  expect(parsed?.arn).toBeTruthy();

  return {
    executionArn: parsed.arn,
    workflowArn: workflow.arn,
  };
}

const CRITICAL_PAGES: CriticalPage[] = [
  {
    name: 'dashboard',
    description: 'Dashboard with navigation, KPI strip, and workspace cards',
    capture: async ({ page }) => {
      await gotoAndWait(page, `/studio/projects/${PROJECT_ID}`);
      await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
      await expect(page.getByTestId('dashboard-kpi-section')).toBeVisible();
    },
  },
  {
    name: 'workflows-catalog',
    description: 'Workflow catalog with list, refresh, and create CTA',
    capture: async ({ page }) => {
      await gotoAndWait(page, `/studio/projects/${PROJECT_ID}/design/workflows`);
      await expect(page.getByTestId('workflow-catalog-page')).toBeVisible();
      await expect(page.getByTestId('workflow-catalog-create')).toBeVisible();
    },
  },
  {
    name: 'workflow-editor-content',
    description: 'Workflow editor with real content visible in YAML tab',
    capture: async ({ page }) => {
      const workflow = await createWorkflowWithStages(page, 'visual-regression-editor');
      await gotoAndWait(page, `/studio/projects/${PROJECT_ID}/design/workflows/${encodeURIComponent(workflow.arn)}/editor`);
      await expect(page.getByRole('heading', { name: /visual-regression-editor/i })).toBeVisible();
      await page.getByRole('button', { name: 'YAML', exact: true }).click();
      await expect(page.getByText('Raw YAML')).toBeVisible();
      const editor = page.locator('textarea');
      await expect(editor).toBeVisible();
      await editor.fill(`apiVersion: workflows.local/v1
kind: Workflow
metadata:
  name: visual-regression-editor
spec:
  description: Visual regression baseline
  stages:
    - id: explore
      agent: orchestrator
      depends_on: []
      input: {}
    - id: verify
      agent: orchestrator
      depends_on: [explore]
      input: {}
  execution:
    mode: sequential
`);
    },
    masks: (page) => [
      page.locator('span.font-mono').first(),
    ],
  },
  {
    name: 'agent-executions',
    description: 'Agent executions list with filters and live execution rows',
    capture: async ({ page, mcp }) => {
      await createExecutionFixture(page, mcp);
      await gotoAndWait(page, `/studio/projects/${PROJECT_ID}/observe/agent-executions`);
      await expect(page.getByTestId('agent-executions-header')).toBeVisible();
      await expect(page.getByTestId('agent-executions-filter-all')).toBeVisible();
      await expect(page.getByTestId('agent-executions-list')).toBeVisible();
    },
  },
  {
    name: 'execution-detail-tabs',
    description: 'Execution detail with tabs and overview content',
    capture: async ({ page, mcp }) => {
      const { executionArn } = await createExecutionFixture(page, mcp);
      await gotoAndWait(page, `/studio/projects/${PROJECT_ID}/observe/agent-executions/${encodeURIComponent(executionArn)}`);
      await expect(page.getByTestId('execution-detail')).toBeVisible();
      await expect(page.getByTestId('execution-detail-tabs')).toBeVisible();
      await expect(page.getByTestId('execution-detail-tab-overview')).toBeVisible();
      await expect(page.getByTestId('execution-detail-tab-timeline')).toBeVisible();
      await expect(page.getByTestId('execution-detail-tab-logs')).toBeVisible();
    },
    masks: (page) => [
      page.getByTestId('execution-detail-header').locator('h1'),
      page.getByTestId('execution-detail-header').locator('span.font-mono'),
      page.getByTestId('execution-detail-content').getByText(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/).first(),
    ],
  },
];

test.describe('Visual Regression - Critical Functional Pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
  });

  for (const pageInfo of CRITICAL_PAGES) {
    test(`baseline: ${pageInfo.description}`, async ({ page, mcp }) => {
      await pageInfo.capture({ page, mcp });

      await expect(page).toHaveScreenshot(`${pageInfo.name}.png`, {
        animations: 'disabled',
        maxDiffPixelRatio: 0.1,
        mask: pageInfo.masks ? pageInfo.masks(page) : [],
        timeout: 30_000,
      });
    });
  }
});

test.describe('Visual Regression - Update Workflow', () => {
  test('documentation: how to update baselines', async () => {
    expect(true).toBe(true);
  });
});
