import type { Page } from '@playwright/test';
import { test, expect } from '../helpers/e2e-fixtures';
import { captureCheckpoint } from '../helpers/evidence';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const PROJECT_ID = 'test';

function toTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function gotoProject(page: Page, path = '') {
  await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}${path}`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
}

async function openCommandPalette(page: Page) {
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette-dialog')).toBeVisible();
  await expect(page.getByTestId('command-palette-input')).toBeVisible();
}

test.describe('Studio UI - Shell and navigation', () => {
  test('dashboard shell loads with stable controls', async ({ page }) => {
    await gotoProject(page);

    await expect(page.getByTestId('topbar-sidebar-toggle')).toBeVisible();
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
    await expect(page.getByTestId('command-palette-open')).toBeVisible();
    await expect(page.getByTestId('workspace-selector')).toBeVisible();
  });

  test('sidebar navigation reaches workflows, registry, and admin', async ({ page }) => {
    await gotoProject(page);

    await page.getByTestId('sidebar-nav-workflows').click();
    await expect(page).toHaveURL(new RegExp(`/studio/projects/${PROJECT_ID}/design/workflows$`));

    await page.getByTestId('sidebar-nav-resources').click();
    await expect(page).toHaveURL(new RegExp(`/studio/projects/${PROJECT_ID}/registry/resources$`));

    await page.getByTestId('sidebar-nav-workspaces').click();
    await expect(page).toHaveURL(new RegExp(`/studio/projects/${PROJECT_ID}/admin/workspaces$`));
  });

  test('observe navigation uses Agent Execution terminology', async ({ page }) => {
    await gotoProject(page);

    await expect(page.getByTestId('sidebar-nav-agent-executions')).toContainText('Agent Executions');
    await page.getByTestId('sidebar-nav-agent-executions').click();
    await expect(page).toHaveURL(new RegExp(`/studio/projects/${PROJECT_ID}/observe/agent-executions$`));
    await expect(page.getByTestId('agent-executions-header')).toContainText('Agent Executions');
  });

  test('active navigation item exposes aria-current', async ({ page }) => {
    await gotoProject(page, '/design/workflows');
    await expect(page.getByTestId('sidebar-nav-workflows')).toHaveAttribute('aria-current', 'page');
  });

  test('sidebar toggle collapses the shell', async ({ page }) => {
    await gotoProject(page);
    const shell = page.locator('.app-shell');

    await page.getByTestId('topbar-sidebar-toggle').click();
    await expect(shell).toHaveClass(/app-shell--collapsed/);
  });
});

test.describe('Studio UI - Workflow catalog', () => {
  test('default workflow is visible in the catalog', async ({ page }) => {
    await gotoProject(page, '/design/workflows');

    await expect(page.getByTestId('workflow-catalog-page')).toBeVisible();
    await expect(page.getByTestId('workflow-catalog-row-sdd-full-pipeline')).toBeVisible();
  });

  test('seeded workflow appears in the UI catalog', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('ui-seeded-workflow');
    const workflow = await rest.createWorkflow(name);
    seedRegistry.register(async () => rest.deleteWorkflow(workflow.arn));

    await gotoProject(page, '/design/workflows');
    await expect(page.getByTestId(`workflow-catalog-row-${toTestId(name)}`)).toBeVisible();

    await captureCheckpoint(page, testInfo, 'seeded-workflow-visible');
  });

  test('create workflow button navigates to editor', async ({ page }) => {
    await gotoProject(page, '/design/workflows');

    await page.getByTestId('workflow-catalog-create').click();
    await expect(page).toHaveURL(new RegExp(`/studio/projects/${PROJECT_ID}/design/workflows/new/editor$`));
  });
});

test.describe('Studio UI - Workspace selector', () => {
  test('workspace selector opens and shows All Workspaces', async ({ page }) => {
    await gotoProject(page);

    await expect(page.getByTestId('workspace-selector-trigger')).toBeEnabled();
    await page.getByTestId('workspace-selector-trigger').click();
    await expect(page.getByTestId('workspace-selector-dropdown')).toBeVisible();
    await expect(page.getByTestId('workspace-selector-option-all')).toContainText('All Workspaces');
  });

  test('seeded workspace appears in selector dropdown', async ({ page, rest, seedRegistry }) => {
    const workspaceName = rest.uniqueName('ui-workspace');
    const workspace = await rest.createWorkspace(workspaceName);
    seedRegistry.register(async () => rest.deleteWorkspace(workspace.id));

    await gotoProject(page);
    await expect(page.getByTestId('workspace-selector-trigger')).toBeEnabled();
    await page.getByTestId('workspace-selector-trigger').click();
    await expect(page.getByTestId(`workspace-selector-option-${workspace.id}`)).toContainText(workspaceName);
  });
});

test.describe('Studio UI - Command palette and theme', () => {
  test('Ctrl+K opens command palette with stable categories', async ({ page }) => {
    await gotoProject(page);
    await openCommandPalette(page);

    await expect(page.getByTestId('command-palette-category-navigation')).toBeVisible();
    await expect(page.getByTestId('command-palette-category-executions')).toContainText('Agent Executions');
  });

  test('Escape closes command palette', async ({ page }) => {
    await gotoProject(page);
    await openCommandPalette(page);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('command-palette-dialog')).toHaveCount(0);
  });

  test('theme toggle changes the html data-theme attribute', async ({ page }) => {
    await gotoProject(page);

    const html = page.locator('html');
    const before = await html.getAttribute('data-theme');
    await page.getByTestId('theme-toggle').click();
    await expect(html).not.toHaveAttribute('data-theme', before ?? '');
  });
});

test.describe('Studio UI - States and detail pages', () => {
  test('invalid route renders the not found page', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/nonexistent-page`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to Studio' })).toBeVisible();
  });

  test('agent executions page renders list or empty state', async ({ page }) => {
    await gotoProject(page, '/observe/agent-executions');

    await expect(page.getByTestId('agent-executions-header')).toContainText('Agent Executions');
    const list = page.getByTestId('agent-executions-list');
    const empty = page.getByTestId('agent-executions-empty-state');
    await expect(list.or(empty)).toBeVisible();
  });

  test('insights, artifacts, and metrics routes load', async ({ page }) => {
    await gotoProject(page, '/observe/insights');
    await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();

    await gotoProject(page, '/observe/artifacts');
    await expect(page.getByRole('heading', { name: 'Artifacts', exact: true })).toBeVisible();

    await gotoProject(page, '/observe/metrics');
    await expect(page.getByRole('heading', { name: 'Metrics', exact: true })).toBeVisible();
  });

  test('admin routes load and expose their tabs', async ({ page }) => {
    await gotoProject(page, '/admin/workspaces');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: 'Workspaces' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(main.getByRole('link', { name: 'Integrations' })).toBeVisible();
  });
});

test.describe('Studio UI - Registry pages (Phase 2.5)', () => {
  test('registry resources page loads with content', async ({ page }) => {
    await gotoProject(page, '/registry/resources');
    await page.waitForLoadState('networkidle');
    // Should show the Registry heading
    await expect(page.getByRole('heading', { name: /Registry/i })).toBeVisible();
    // Should have some content area (list or empty state)
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });

  test('registry overrides page loads', async ({ page }) => {
    await gotoProject(page, '/registry/overrides');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /Registry/i })).toBeVisible();
  });

  test('registry dependencies page loads', async ({ page }) => {
    await gotoProject(page, '/registry/dependencies');
    await page.waitForLoadState('networkidle');
    // Dependencies page may show a graph or list
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });

  test('registry resource detail page loads for a resource', async ({ page, rest, seedRegistry }) => {
    // Create a workflow to have a resource to view
    const name = rest.uniqueName('e2e-registry-detail');
    const { arn } = await rest.createWorkflow(name);
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    // Navigate directly to the resource detail page
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/registry/resource?arn=${encodeURIComponent(arn)}`);
    await page.waitForLoadState('networkidle');
    
    // Should show back button and resource info
    await expect(page.getByText('← Registry')).toBeVisible();
  });
});

test.describe('Studio UI - Admin pages (Phase 2.6)', () => {
  test('admin workspaces list page shows content', async ({ page }) => {
    await gotoProject(page, '/admin/workspaces');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    // Should show Workspaces in the sidebar
    await expect(page.getByTestId('sidebar-nav-workspaces')).toBeVisible();
  });

  test('admin settings page loads', async ({ page }) => {
    await gotoProject(page, '/admin/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    // Settings page should have some content
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });

  test('admin integrations page loads', async ({ page }) => {
    await gotoProject(page, '/admin/integrations');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    // Integrations page should have some content
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });

  test('admin workspaces list shows seeded workspace', async ({ page, rest, seedRegistry }) => {
    // Create a workspace via REST
    const ws = await rest.createWorkspace('e2e-admin-ws-' + Date.now());
    seedRegistry.register(() => rest.deleteWorkspace(ws.id));

    await gotoProject(page, '/admin/workspaces');
    await page.waitForLoadState('networkidle');
    
    // Workspace should appear in the select dropdown (workspaces are shown in dropdown)
    // Use select locator and check the option text
    const select = page.locator('select').filter({ hasText: ws.name });
    await expect(select).toBeAttached({ timeout: 10000 });
  });
});

test.describe('Studio UI - Responsive rendering', () => {
  test('desktop layout keeps sidebar visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoProject(page);
    await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
  });

  test('mobile layout shows the mobile menu toggle', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoProject(page);
    await expect(page.getByTestId('topbar-mobile-menu-toggle')).toBeVisible();
  });
});
