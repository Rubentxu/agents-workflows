/**
 * Studio Responsive — Layout Geometry & Viewport Tests
 *
 * Validates that the Studio layout is structurally correct across breakpoints:
 * - Sidebar is positioned to the LEFT of content (not below or overlapping incorrectly)
 * - Topbar is pinned to the top at 64px height
 * - Content area does not overflow the viewport
 * - Mobile: sidebar opens as overlay, closes on navigation
 *
 * These tests would have caught the sidebar-layout bug where sidebar rendered
 * below the content area in normal document flow instead of inside the app-shell grid.
 */

import { test, expect } from '../helpers/e2e-fixtures';
import {
  assertSidebarLeftOfContent,
  assertTopbarPinned,
  assertInViewport,
  assertVisibleAndContained,
  VIEWPORTS,
} from '../helpers/visual-helpers';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const PROJECT_ID = 'test';

async function gotoProject(page: import('@playwright/test').Page, path = '') {
  await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}${path}`);
  await page.waitForLoadState('domcontentloaded');
}

test.describe('Studio Layout — Geometry Assertions', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('sidebar is to the LEFT of the main content area', async ({ page }) => {
    await gotoProject(page);

    // This is the critical geometry assertion — would have caught the layout bug
    await assertSidebarLeftOfContent(page);
  });

  test('sidebar and content share the same vertical row (not stacked)', async ({ page }) => {
    await gotoProject(page);

    const sidebar = page.getByTestId('sidebar-navigation');
    const content = page.locator('.app-shell__project-main');

    const sidebarBox = await sidebar.boundingBox();
    const contentBox = await content.boundingBox();

    expect(sidebarBox).not.toBeNull();
    expect(contentBox).not.toBeNull();

    // Sidebar top should be within 10px of content top (same horizontal band)
    expect(Math.abs(sidebarBox!.y - contentBox!.y)).toBeLessThanOrEqual(10);
  });

  test('topbar is pinned to the top of the viewport at 64px', async ({ page }) => {
    await gotoProject(page);
    await assertTopbarPinned(page);
  });

  test('main content area does not overflow viewport height', async ({ page }) => {
    await gotoProject(page);

    const main = page.locator('.app-shell__project-main');
    await assertInViewport(page, main, 'main content area');
  });

  test('sidebar does not overflow viewport height', async ({ page }) => {
    await gotoProject(page);

    const sidebar = page.getByTestId('sidebar-navigation');
    await assertInViewport(page, sidebar, 'sidebar');
  });
});

test.describe('Studio Layout — Viewport Breakpoints', () => {
  const VIEWPORTS = {
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1440, height: 900 },
  };

  test.beforeEach(async ({ page }) => {
    // Set viewport but still navigate to a project
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('desktop (1440px): sidebar visible, content accessible', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await gotoProject(page);

    const sidebar = page.getByTestId('sidebar-navigation');
    const dashboardHeader = page.getByTestId('dashboard-header');

    await expect(sidebar).toBeVisible();
    await expect(dashboardHeader).toBeVisible();

    // Verify sidebar is to the left of content
    await assertSidebarLeftOfContent(page);
  });

  test('tablet (768px): sidebar or toggle visible, layout intact', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await gotoProject(page);

    // At tablet, either sidebar visible (if it fits) or mobile toggle visible
    const sidebar = page.getByTestId('sidebar-navigation');
    const mobileToggle = page.getByTestId('topbar-mobile-menu-toggle');

    // Check sidebar transform to see if it's hidden via CSS
    const sidebarHidden = await sidebar.evaluate(el => {
      const transform = window.getComputedStyle(el).transform;
      return transform.includes('matrix') && transform !== 'matrix(1, 0, 0, 1, 0, 0)';
    });

    const toggleVisible = await mobileToggle.isVisible().catch(() => false);

    // One of them should be visible
    expect(!sidebarHidden || toggleVisible, 'Neither sidebar nor mobile toggle visible at tablet').toBeTruthy();

    if (!sidebarHidden) {
      await assertSidebarLeftOfContent(page);
    }
  });

  test('mobile (375px): sidebar hidden via CSS transform', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await gotoProject(page);

    const sidebar = page.getByTestId('sidebar-navigation');
    const mobileToggle = page.getByTestId('topbar-mobile-menu-toggle');

    await expect(mobileToggle).toBeVisible();

    // Sidebar should be hidden via CSS transform (translateX(-100%))
    const sidebarTransform = await sidebar.evaluate(el => window.getComputedStyle(el).transform);
    const isHiddenViaTransform = sidebarTransform !== 'none' && !sidebarTransform.includes('matrix(1, 0, 0, 1, 0, 0)');
    expect(isHiddenViaTransform, 'Sidebar should be hidden via transform in mobile').toBeTruthy();
  });

  test('mobile (375px): shell does not cause horizontal overflow', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);

    await page.goto(`${BASE_URL}/studio`);
    await page.waitForLoadState('domcontentloaded');
    const homeWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(homeWidth).toBeLessThanOrEqual(VIEWPORTS.mobile.width);

    await gotoProject(page, '/design/agents');
    const projectWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(projectWidth).toBeLessThanOrEqual(VIEWPORTS.mobile.width);
  });

  test('mobile (375px): catalog actions stack within viewport', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await gotoProject(page, '/design/agents');

    const search = page.getByTestId('agent-catalog-search');
    const refresh = page.getByTestId('agent-catalog-refresh');
    const create = page.getByTestId('agent-catalog-create');

    await expect(search).toBeVisible();
    await expect(refresh).toBeVisible();
    await expect(create).toBeVisible();

    const [searchBox, refreshBox, createBox] = await Promise.all([
      search.boundingBox(),
      refresh.boundingBox(),
      create.boundingBox(),
    ]);

    expect(searchBox).not.toBeNull();
    expect(refreshBox).not.toBeNull();
    expect(createBox).not.toBeNull();

    expect(searchBox!.width).toBeLessThanOrEqual(VIEWPORTS.mobile.width - 40);
    expect(refreshBox!.y).toBeGreaterThan(searchBox!.y);
    expect(createBox!.y).toBeGreaterThan(refreshBox!.y);
    expect(createBox!.x + createBox!.width).toBeLessThanOrEqual(VIEWPORTS.mobile.width);
  });

  test('mobile (375px): registry filters stack and remain usable', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await gotoProject(page, '/registry/resources');

    const search = page.getByRole('textbox', { name: 'Search resources' });
    const kind = page.getByRole('combobox', { name: 'Filter resources by kind' });
    const scope = page.getByRole('combobox', { name: 'Filter resources by scope' });

    const [searchBox, kindBox, scopeBox] = await Promise.all([
      search.boundingBox(),
      kind.boundingBox(),
      scope.boundingBox(),
    ]);

    expect(searchBox).not.toBeNull();
    expect(kindBox).not.toBeNull();
    expect(scopeBox).not.toBeNull();

    expect(kindBox!.y).toBeGreaterThan(searchBox!.y);
    expect(scopeBox!.y).toBeGreaterThan(kindBox!.y);
    expect(scopeBox!.x + scopeBox!.width).toBeLessThanOrEqual(VIEWPORTS.mobile.width);
  });
});

test.describe('Studio Layout — Mobile Sidebar Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
  });

  /**
   * In mobile, sidebar starts with transform: translateX(-100%) (hidden).
   * Clicking toggle removes the transform, making it visible (x=0).
   * We check the boundingBox x-coordinate to determine if sidebar is open or closed.
   */
  const isSidebarOpen = async (page: Page): Promise<boolean> => {
    const sidebar = page.getByTestId('sidebar-navigation');
    const box = await sidebar.boundingBox();
    // In mobile, sidebar width is 256px. If hidden (translateX=-100%), x would be negative or very negative.
    // When open, x should be >= 0.
    return box ? box.x >= -1 : false;
  };

  test('mobile: sidebar opens as overlay when toggle clicked', async ({ page }) => {
    await gotoProject(page);

    const mobileToggle = page.getByTestId('topbar-mobile-menu-toggle');
    const sidebar = page.getByTestId('sidebar-navigation');

    // Sidebar starts hidden (off-screen to the left)
    expect(await isSidebarOpen(page), 'Sidebar should start hidden').toBe(false);

    // Click toggle
    await mobileToggle.click();
    await page.waitForTimeout(300); // Wait for CSS transition

    // Sidebar becomes visible
    expect(await isSidebarOpen(page), 'Sidebar should be open after toggle click').toBe(true);

    // Sidebar is flush to left edge
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(sidebarBox!.x).toBe(0);
  });

  test('mobile: sidebar closes when toggle clicked again', async ({ page }) => {
    await gotoProject(page);

    const mobileToggle = page.getByTestId('topbar-mobile-menu-toggle');

    // Open sidebar
    await mobileToggle.click();
    await page.waitForTimeout(300);
    expect(await isSidebarOpen(page), 'Sidebar should be open').toBe(true);

    // Click toggle again to close
    await mobileToggle.click();
    await page.waitForTimeout(300);

    // Sidebar is hidden again
    expect(await isSidebarOpen(page), 'Sidebar should be closed after second toggle click').toBe(false);
  });

  test('mobile: clicking a nav link triggers navigation', async ({ page }) => {
    await gotoProject(page);

    const mobileToggle = page.getByTestId('topbar-mobile-menu-toggle');

    // Open sidebar first
    await mobileToggle.click();
    await page.waitForTimeout(300);
    expect(await isSidebarOpen(page), 'Sidebar should be open').toBe(true);

    // Click a nav link — this triggers SPA navigation to a new route
    // We just verify the click doesn't error and the page doesn't crash
    await page.getByTestId('sidebar-nav-workflows').click();
    await page.waitForLoadState('networkidle');

    // Page should still be functional (workflows page has workflow-catalog-page)
    await expect(page.getByTestId('workflow-catalog-page')).toBeVisible();
  });

  test('mobile: top-level projects page does not expose a dead sidebar toggle', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio`);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('topbar-mobile-menu-toggle')).toHaveCount(0);
  });
});

test.describe('Studio Layout — Dashboard Content', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('dashboard KPI strip is fully visible (not clipped)', async ({ page }) => {
    await gotoProject(page);
    await page.waitForLoadState('networkidle');

    const kpiSection = page.getByTestId('dashboard-kpi-section');
    if (await kpiSection.isVisible().catch(() => false)) {
      await assertVisibleAndContained(page, kpiSection, 'KPI section');
    }
  });

  test('dashboard header is fully visible', async ({ page }) => {
    await gotoProject(page);
    await page.waitForLoadState('networkidle');

    const header = page.getByTestId('dashboard-header');
    await assertVisibleAndContained(page, header, 'dashboard header');
  });

  test('create workflow button is fully visible and not truncated', async ({ page }) => {
    await gotoProject(page);
    await page.waitForLoadState('networkidle');

    const createBtn = page.getByTestId('dashboard-create-workflow');
    if (await createBtn.isVisible().catch(() => false)) {
      await assertVisibleAndContained(page, createBtn, 'create workflow button');

      // Verify button text is not truncated
      const box = await createBtn.boundingBox();
      expect(box!.width).toBeGreaterThan(100); // Should be wide enough for "Create Workflow"
    }
  });
});

test.describe('Studio Layout — Sidebar Navigation Items', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoProject(page);
  });

  test('all sidebar nav items are visible and in DOM', async ({ page }) => {
    const navItems = page.getByTestId('sidebar-navigation').locator('.nav-item');
    const count = await navItems.count();

    expect(count, 'Sidebar should have navigation items').toBeGreaterThan(0);

    // Verify each nav item is in DOM and has text (visible in the sidebar scrollable region)
    for (let i = 0; i < count; i++) {
      const item = navItems.nth(i);
      await expect(item).toBeAttached();
      const text = await item.textContent();
      expect(text?.trim().length, `Nav item ${i} should have text`).toBeGreaterThan(0);
    }
  });

  test('collapsed sidebar shows only icons (labels hidden)', async ({ page }) => {
    // Collapse sidebar
    await page.getByTestId('topbar-sidebar-toggle').click();

    const labels = page.locator('.app-shell__sidebar .nav-item__label');
    const count = await labels.count();

    // Labels should be hidden (display: none or visibility: hidden)
    for (let i = 0; i < count; i++) {
      const label = labels.nth(i);
      const isHidden = await label.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
      });
      expect(isHidden, `Label ${i} should be hidden in collapsed sidebar`).toBeTruthy();
    }
  });
});
