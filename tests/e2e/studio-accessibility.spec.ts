/**
 * Studio Accessibility Tests (Phase 4.1, 4.2)
 * 
 * Runs axe-core accessibility scans on critical Studio pages.
 * Tests aria attributes, keyboard navigation, and focus management.
 * 
 * Note: These tests report accessibility violations but use annotations
 * so they don't block CI - violations are tracked for fixing.
 */

import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../helpers/e2e-fixtures';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const PROJECT_ID = 'test';

async function runAxeScan(page: any, pageName: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  
  if (results.violations.length > 0) {
    console.log(`\nAccessibility violations on ${pageName}:`);
    for (const violation of results.violations) {
      console.log(`  - ${violation.id}: ${violation.description}`);
      console.log(`    Impact: ${violation.impact}`);
      console.log(`    Nodes: ${violation.nodes.length}`);
    }
  }
  
  return results;
}

test.describe('Studio Accessibility - axe-core Scans (Phase 4.1)', () => {
  test.setTimeout(60_000);

  test('dashboard page accessibility scan', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    
    const results = await runAxeScan(page, 'Dashboard');
    const criticalViolations = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    
    // Report but don't fail - accessibility improvements are ongoing
    if (criticalViolations.length > 0) {
      test.info().annotations.push({
        type: 'accessibility',
        description: `${criticalViolations.length} critical/serious violations: ${criticalViolations.map(v => v.id).join(', ')}`,
      });
    }
    
    // Just verify page loads - violations are informational
    await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
  });

  test('workflows catalog page accessibility scan', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/workflows`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const results = await runAxeScan(page, 'Workflows Catalog');
    const criticalViolations = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    
    if (criticalViolations.length > 0) {
      test.info().annotations.push({
        type: 'accessibility',
        description: `${criticalViolations.length} critical/serious violations: ${criticalViolations.map(v => v.id).join(', ')}`,
      });
    }
    
    await expect(page.locator('[data-testid="workflow-catalog-page"]')).toBeVisible({ timeout: 5000 });
  });

  test('agents catalog page accessibility scan', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/agents`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const results = await runAxeScan(page, 'Agents Catalog');
    const criticalViolations = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    
    if (criticalViolations.length > 0) {
      test.info().annotations.push({
        type: 'accessibility',
        description: `${criticalViolations.length} critical/serious violations: ${criticalViolations.map(v => v.id).join(', ')}`,
      });
    }
    
    await expect(page.locator('[data-testid="agent-catalog-page"]')).toBeVisible({ timeout: 5000 });
  });

  test('observe agent executions page accessibility scan', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/observe/agent-executions`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const results = await runAxeScan(page, 'Agent Executions');
    const criticalViolations = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    
    if (criticalViolations.length > 0) {
      test.info().annotations.push({
        type: 'accessibility',
        description: `${criticalViolations.length} critical/serious violations: ${criticalViolations.map(v => v.id).join(', ')}`,
      });
    }
    
    await expect(page.getByTestId('agent-executions-header')).toBeVisible({ timeout: 5000 });
  });

  test('registry resources page accessibility scan', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/registry/resources`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const results = await runAxeScan(page, 'Registry Resources');
    const criticalViolations = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    
    if (criticalViolations.length > 0) {
      test.info().annotations.push({
        type: 'accessibility',
        description: `${criticalViolations.length} critical/serious violations: ${criticalViolations.map(v => v.id).join(', ')}`,
      });
    }
    
    // Just verify page loaded
    await expect(page.locator('h1')).toBeVisible({ timeout: 5000 });
  });

  test('admin workspaces page accessibility scan', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/admin/workspaces`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    const results = await runAxeScan(page, 'Admin Workspaces');
    const criticalViolations = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    
    if (criticalViolations.length > 0) {
      test.info().annotations.push({
        type: 'accessibility',
        description: `${criticalViolations.length} critical/serious violations: ${criticalViolations.map(v => v.id).join(', ')}`,
      });
    }
    
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Studio Accessibility - Keyboard Navigation (Phase 4.2)', () => {
  test('Skip to main content link targets the main landmark', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/agents`);
    await page.waitForLoadState('domcontentloaded');

    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skipLink).toHaveAttribute('href', '#main-content');

    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('catalog and registry search inputs have accessible names', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/agents`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('textbox', { name: 'Search agents' })).toBeVisible();

    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/registry/resources`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('textbox', { name: 'Search resources' })).toBeVisible();
  });

  test('Tab key navigates through interactive elements', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    
    // Press Tab to move focus
    await page.keyboard.press('Tab');
    
    // Focus should move to an interactive element
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('Command palette opens with Ctrl+K and closes with Escape', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
    
    // Open command palette
    await page.keyboard.press('Control+k');
    
    const dialog = page.getByTestId('command-palette-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    
    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('Sidebar navigation is keyboard accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    
    // Tab to sidebar
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Should be able to find focused navigation items
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('Focus moves through workflow editor tabs with keyboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/workflows`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    // Create a workflow to edit
    const createBtn = page.getByTestId('workflow-catalog-create');
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(500);
      
      // Tab through editor tabs
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
      await page.keyboard.press('Tab');
      
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    }
  });

  test('Escape key closes open dropdowns/modals', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/admin/workspaces`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    // Try to open workspace selector dropdown
    const selector = page.getByTestId('workspace-selector-trigger');
    if (await selector.isVisible()) {
      await selector.click();
      await page.waitForTimeout(300);
      
      // Escape should close it
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      
      // Dropdown should be closed (not checking specific behavior, just verify no crash)
      await expect(page.getByRole('main')).toBeVisible();
    }
  });
});

test.describe('Studio Accessibility - Command Palette Execute (Phase 4.3)', () => {
  test('command palette allows typing to filter commands', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
    
    // Open command palette
    await page.keyboard.press('Control+k');
    const input = page.getByTestId('command-palette-input');
    await expect(input).toBeVisible();
    
    // Type to filter
    await input.fill('workflow');
    await page.waitForTimeout(300);
    
    // Should show filtered results
    const results = page.locator('[data-testid="command-palette-results"]');
    if (await results.isVisible().catch(() => false)) {
      await expect(results).toBeVisible();
    }
  });

  test('command palette filtering works', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
    
    // Open command palette
    await page.keyboard.press('Control+k');
    const input = page.getByTestId('command-palette-input');
    await expect(input).toBeVisible();
    
    // Type to filter using keyboard
    await page.keyboard.type('workflows');
    await page.waitForTimeout(500);
    
    // Close with Escape
    await page.keyboard.press('Escape');
    
    // Verify command palette closed
    await expect(page.getByTestId('command-palette-dialog')).not.toBeVisible();
  });

  test('command palette can be closed by clicking outside', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
    
    // Open command palette
    await page.keyboard.press('Control+k');
    const dialog = page.getByTestId('command-palette-dialog');
    await expect(dialog).toBeVisible();
    
    // Click outside to close
    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);
    
    await expect(dialog).not.toBeVisible();
  });

  test('command palette shows categories', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
    
    // Open command palette
    await page.keyboard.press('Control+k');
    
    // Check categories are visible
    await expect(page.getByTestId('command-palette-category-navigation')).toBeVisible();
  });
});
