/**
 * Page Object Model for Studio E2E Tests
 *
 * Encapsulates page interactions behind typed, reusable methods.
 * Uses data-testid selectors for stability.
 */
import type { Page, Locator } from '@playwright/test';

// ─── Base URL helpers ────────────────────────────────────────────────────────

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';

function studioUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

// ─── Dashboard Page Object ───────────────────────────────────────────────────

export class DashboardPage {
  readonly page: Page;
  readonly root: Locator;
  readonly header: Locator;
  readonly refreshButton: Locator;
  readonly createWorkflowButton: Locator;
  readonly createWorkspaceButton: Locator;
  readonly kpiSection: Locator;
  readonly executionsTable: Locator;
  readonly executionsEmpty: Locator;
  readonly viewAllExecutionsButton: Locator;
  readonly workspacesGrid: Locator;
  readonly workflowsGrid: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('project-dashboard');
    this.header = page.getByTestId('dashboard-header');
    this.refreshButton = page.getByTestId('dashboard-refresh');
    this.createWorkflowButton = page.getByTestId('dashboard-create-workflow');
    this.createWorkspaceButton = page.getByTestId('dashboard-create-workspace');
    this.kpiSection = page.getByTestId('dashboard-kpi-section');
    this.executionsTable = page.getByTestId('dashboard-executions-table');
    this.executionsEmpty = page.getByTestId('dashboard-executions-empty');
    this.viewAllExecutionsButton = page.getByTestId('dashboard-view-all-executions');
    this.workspacesGrid = page.getByTestId('dashboard-workspaces-grid');
    this.workflowsGrid = page.getByTestId('dashboard-workflows-grid');
  }

  async goto(projectId: string) {
    await this.page.goto(studioUrl(`/studio/projects/${projectId}`));
    await this.page.waitForLoadState('domcontentloaded');
  }

  async refresh() {
    await this.refreshButton.click();
  }

  executionRow(executionId: string): Locator {
    return this.page.getByTestId(`dashboard-execution-row-${executionId}`);
  }
}

// ─── Design Catalog Page Object ──────────────────────────────────────────────

export class DesignCatalogPage {
  readonly page: Page;
  readonly resourceKey: string;
  readonly catalogPage: Locator;
  readonly refreshButton: Locator;
  readonly createButton: Locator;
  readonly listContainer: Locator;

  constructor(page: Page, resourceKey: string) {
    this.page = page;
    this.resourceKey = resourceKey;
    this.catalogPage = page.getByTestId(`${resourceKey}-catalog-page`);
    this.refreshButton = page.getByTestId(`${resourceKey}-catalog-refresh`);
    this.createButton = page.getByTestId(`${resourceKey}-catalog-create`);
    this.listContainer = page.getByTestId(`${resourceKey}-catalog-list`);
  }

  async goto(projectId: string, resourceType: string) {
    const url = studioUrl(`/studio/projects/${projectId}/design/${resourceType}`);
    await this.page.goto(url);
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for URL to match
    await this.page.waitForURL(new RegExp(`/design/${resourceType}`));
    // Wait for the catalog page element to be visible
    await this.catalogPage.waitFor({ state: 'visible', timeout: 10000 });
  }

  async refresh() {
    await this.refreshButton.click();
  }

  async create() {
    await this.createButton.click();
  }

  /**
   * Build the test-id for a catalog row.
   * ResourceCatalogPage uses toTestId(name) → e.g. "My Workflow" → "my-workflow"
   * Test ID format: {resourceKey}-catalog-row-{toTestId name}
   */
  resourceRow(name: string): Locator {
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return this.page.getByTestId(`${this.resourceKey}-catalog-row-${safeName}`);
  }

  /**
   * Build the test-id for a delete button in a catalog row.
   * Format: {resourceKey}-catalog-delete-{toTestId name}
   */
  deleteButton(name: string): Locator {
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return this.page.getByTestId(`${this.resourceKey}-catalog-delete-${safeName}`);
  }
}

// ─── Workflow Editor Page Object ─────────────────────────────────────────────

export class WorkflowEditorPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoNew(projectId: string) {
    await this.page.goto(studioUrl(`/studio/projects/${projectId}/design/workflows/new/editor`));
    await this.page.waitForLoadState('domcontentloaded');
  }

  async gotoExisting(projectId: string, workflowId: string) {
    await this.page.goto(studioUrl(`/studio/projects/${projectId}/design/workflows/${encodeURIComponent(workflowId)}/editor`));
    await this.page.waitForLoadState('domcontentloaded');
  }

  async gotoExistingByArn(projectId: string, arn: string) {
    // Navigate with arn query param so editor loads the correct workflow
    await this.page.goto(studioUrl(`/studio/projects/${projectId}/design/workflows/${encodeURIComponent(arn)}/editor?arn=${encodeURIComponent(arn)}`));
    await this.page.waitForLoadState('domcontentloaded');
    // Monaco will be ready after the page loads; caller should call waitForMonacoReady() before filling
  }

  /** The YAML textarea in the editor */
  get yamlEditor(): Locator {
    return this.page.locator('textarea').first();
  }

  get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save' }).first();
  }

  async switchToYamlTab() {
    // Wait for the Monaco textarea (always visible in the right panel of the workflow editor).
    // If a YAML tab button exists (e.g. other editors), use it; otherwise fall back to textarea.
    const yamlButton = this.page.getByRole('button', { name: 'YAML' });
    if (await yamlButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await yamlButton.click();
      await this.page.waitForLoadState('domcontentloaded');
    }
    await this.page.locator('textarea').first().waitFor({ state: 'visible', timeout: 15000 });
  }

  async switchToCanvasTab() {
    await this.page.getByRole('button', { name: 'Canvas' }).click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async save() {
    await this.saveButton.click();
    // Wait for save to complete — button text changes to "Saving..." then back
    await this.page.waitForResponse(
      r => r.url().includes('/api/') && r.status() < 400,
      { timeout: 10000 }
    ).catch(() => {});
  }

  async backToCatalog() {
    await this.page.getByText('← Workflows').click();
    await this.page.waitForLoadState('domcontentloaded');
  }
}

// ─── Agent Editor Page Object ────────────────────────────────────────────────

export class AgentEditorPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoNew(projectId: string) {
    await this.page.goto(studioUrl(`/studio/projects/${projectId}/design/agents/new/editor`));
    await this.page.waitForLoadState('domcontentloaded');
  }

  async gotoExisting(projectId: string, agentId: string) {
    await this.page.goto(studioUrl(`/studio/projects/${projectId}/design/agents/${encodeURIComponent(agentId)}/editor`));
    await this.page.waitForLoadState('domcontentloaded');
  }

  get nameInput(): Locator {
    return this.page.locator('label:text("Name") + input, input[type="text"]').first();
  }

  get descriptionTextarea(): Locator {
    return this.page.locator('textarea').first();
  }

  get modelInput(): Locator {
    return this.page.locator('label:text("Model") + input, input[placeholder="gpt-4"]').first();
  }

  get saveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save' }).first();
  }

  async switchToTab(tab: 'config' | 'resources' | 'yaml') {
    await this.page.getByRole('button', { name: new RegExp(`^${tab}$`) }).click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async save() {
    await this.saveButton.click();
    await this.page.waitForResponse(
      r => r.url().includes('/api/') && r.status() < 400,
      { timeout: 10000 }
    ).catch(() => {});
  }

  async backToCatalog() {
    await this.page.getByText('← Agents').click();
    await this.page.waitForLoadState('domcontentloaded');
  }
}

// ─── Agent Execution List Page Object ────────────────────────────────────────

export class AgentExecutionListPage {
  readonly page: Page;
  readonly header: Locator;
  readonly listContainer: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.getByTestId('agent-executions-header');
    this.listContainer = page.getByTestId('agent-executions-list');
    this.refreshButton = page.getByTestId('agent-executions-refresh');
  }

  async goto(projectId: string) {
    await this.page.goto(studioUrl(`/studio/projects/${projectId}/observe/agent-executions`));
    await this.page.waitForLoadState('domcontentloaded');
  }

  async filterBy(status: string) {
    await this.page.getByTestId(`agent-executions-filter-${status}`).click();
  }

  executionRow(executionId: string): Locator {
    return this.page.getByTestId(`agent-executions-row-${executionId}`);
  }
}

// ─── Agent Execution Detail Page Object ──────────────────────────────────────

export class ExecutionDetailPage {
  readonly page: Page;
  readonly root: Locator;
  readonly header: Locator;
  readonly backButton: Locator;
  readonly tabs: Locator;
  readonly content: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId('execution-detail');
    this.header = page.getByTestId('execution-detail-header');
    this.backButton = page.getByTestId('execution-detail-back');
    this.tabs = page.getByTestId('execution-detail-tabs');
    this.content = page.getByTestId('execution-detail-content');
  }

  async goto(projectId: string, executionId: string) {
    await this.page.goto(studioUrl(`/studio/projects/${projectId}/observe/agent-executions/${encodeURIComponent(executionId)}`));
    await this.page.waitForLoadState('domcontentloaded');
  }

  async clickTab(tab: string) {
    await this.page.getByTestId(`execution-detail-tab-${tab}`).click();
  }

  async goBack() {
    await this.backButton.click();
  }
}

// ─── Navigation Helper ───────────────────────────────────────────────────────

export class StudioNavigation {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoStudio() {
    await this.page.goto(studioUrl('/studio'));
    await this.page.waitForLoadState('domcontentloaded');
  }

  async gotoProject(projectId: string) {
    await this.page.goto(studioUrl(`/studio/projects/${projectId}`));
    await this.page.waitForLoadState('domcontentloaded');
  }

  async clickSidebarNav(label: string) {
    const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await this.page.getByTestId(`sidebar-nav-${safeLabel}`).click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async openCommandPalette() {
    await this.page.keyboard.press('Control+K');
    await this.page.getByTestId('command-palette-dialog').waitFor({ state: 'visible' });
  }

  async closeCommandPalette() {
    await this.page.keyboard.press('Escape');
  }
}
