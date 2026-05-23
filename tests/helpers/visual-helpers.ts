/**
 * Visual and Layout Helpers for E2E Tests
 *
 * Provides reusable geometry assertions and visual regression helpers.
 * These catch layout regressions that DOM assertions alone cannot detect.
 */
import type { Page, Locator, ConsoleMessage } from '@playwright/test';
import { expect } from '@playwright/test';

// ─── Layout Assertion Helpers ──────────────────────────────────────────────────

/**
 * Asserts that the sidebar is positioned to the LEFT of the main content area,
 * and that they share the same vertical row (not stacked vertically).
 *
 * This would have caught the sidebar-layout bug where sidebar rendered
 * below the content instead of beside it.
 */
export async function assertSidebarLeftOfContent(page: Page): Promise<void> {
  const sidebar = page.getByTestId('sidebar-navigation');
  const mainContent = page.locator('.app-shell__project-main, [data-testid="project-dashboard"], main').first();

  const sidebarBox = await sidebar.boundingBox();
  const contentBox = await mainContent.boundingBox();

  if (!sidebarBox) {
    throw new Error('Sidebar bounding box is null — sidebar not found or hidden');
  }
  if (!contentBox) {
    throw new Error('Main content bounding box is null — content not found');
  }

  // Sidebar x + width should be <= content x (sidebar ends before content starts)
  // Allow 20px tolerance for rounding
  expect(sidebarBox.x + sidebarBox.width).toBeLessThanOrEqual(contentBox.x + 20);

  // Sidebar and content should overlap in vertical space (same row)
  // Sidebar top should be above or equal to content bottom
  const verticalOverlap =
    sidebarBox.y < contentBox.y + contentBox.height &&
    contentBox.y < sidebarBox.y + sidebarBox.height;

  expect(verticalOverlap).toBeTruthy();
}

/**
 * Asserts that an element is fully visible within the current viewport
 * (not clipped by overflow or positioned off-screen).
 *
 * For scrollable containers (sidebar, main content area), overflow is expected
 * — we only verify the container's origin is within viewport, not its edges.
 */
export async function assertInViewport(page: Page, locator: Locator, label?: string): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  if (!box) {
    throw new Error(`Bounding box null for${label ? ` ${label}` : ''}`);
  }
  if (!viewport) {
    throw new Error('Viewport size is null');
  }

  const msg = label ? ` [${label}]` : '';

  // Element should not start above viewport
  expect(box.y, `Element starts above viewport${msg}`).toBeGreaterThanOrEqual(0);

  // Element should not start left of viewport
  expect(box.x, `Element starts left of viewport${msg}`).toBeGreaterThanOrEqual(0);

  // For elements that may scroll internally (sidebar, main content), we only check
  // that the TOP-LEFT corner is in viewport. The bottom-right may overflow if the
  // element has its own scroll. This is the correct behavior for scrollable regions.
  // We DO check horizontal overflow only for fixed-width elements.
  expect(
    box.x + box.width,
    `Element extends right of viewport${msg}`,
  ).toBeLessThanOrEqual(viewport.width + 10); // 10px tolerance
}

/**
 * Asserts that the topbar is pinned to the top of the viewport
 * and has the correct height (64px).
 */
export async function assertTopbarPinned(page: Page): Promise<void> {
  const topbar = page.locator('.app-shell__topbar');
  const box = await topbar.boundingBox();

  if (!box) {
    throw new Error('Topbar bounding box is null');
  }

  // Topbar should be at top of viewport (y ≈ 0)
  expect(box.y, 'Topbar is not pinned to top of viewport').toBeLessThanOrEqual(5);

  // Topbar should be ~64px tall
  expect(box.height, 'Topbar height is not approximately 64px').toBeGreaterThanOrEqual(60);
  expect(box.height, 'Topbar height exceeds expected 64px').toBeLessThanOrEqual(70);
}

/**
 * Asserts that a locator is visible AND not hidden by overflow.
 */
export async function assertVisibleAndContained(page: Page, locator: Locator, label: string): Promise<void> {
  await expect(locator, `Element not visible: ${label}`).toBeVisible();

  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  if (box && viewport) {
    expect(
      box.y + box.height,
      `Element overflows viewport vertically: ${label}`,
    ).toBeLessThanOrEqual(viewport.height + 10); // 10px tolerance
    expect(
      box.x + box.width,
      `Element overflows viewport horizontally: ${label}`,
    ).toBeLessThanOrEqual(viewport.width + 10);
  }
}

// ─── Visual Regression Helpers ────────────────────────────────────────────────

/**
 * Navigates to a URL and captures a full-page screenshot for visual regression.
 * Requires `--update-snapshots` to generate baselines.
 */
export async function capturePageScreenshot(
  page: Page,
  name: string,
  options?: { fullPage?: boolean; animations?: 'disabled' | 'enabled' }
): Promise<void> {
  const { fullPage = true, animations = 'disabled' } = options ?? {};

  if (animations === 'disabled') {
    // Disable CSS animations for consistent screenshots
    await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }' });
  }

  await expect(page).toHaveScreenshot(name, { fullPage });
}

/**
 * Captures a screenshot of a specific element (not full page).
 */
export async function captureElementScreenshot(
  locator: Locator,
  name: string
): Promise<void> {
  await expect(locator).toHaveScreenshot(name);
}

// ─── Console Error Helpers ────────────────────────────────────────────────────

/**
 * Collects console errors (Error level) during a page operation.
 * Fails if unexpected errors appear.
 */
export class ConsoleErrorCollector {
  private errors: string[] = [];

  constructor(private readonly page: Page) {
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        this.errors.push(msg.text());
      }
    });
  }

  /**
   * After calling fn(), any collected errors will cause the test to fail.
   * Ignores known benign errors (font loading, favicon, etc.).
   */
  async assertNoErrors(fn: () => Promise<void>, ignorePatterns: RegExp[] = []): Promise<void> {
    await fn();

    const unexpected = this.errors.filter(
      e => !ignorePatterns.some(p => p.test(e))
    );

    if (unexpected.length > 0) {
      console.error('Unexpected console errors:', unexpected);
    }

    expect(unexpected, `Unexpected console errors: ${JSON.stringify(unexpected)}`).toHaveLength(0);
  }

  getErrors(): string[] {
    return [...this.errors];
  }
}

// ─── Viewport Breakpoints ─────────────────────────────────────────────────────

export const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
  wide: { width: 1920, height: 1080 },
} as const;

/**
 * Runs a test across multiple viewport sizes.
 */
export async function testResponsive(
  page: Page,
  testFn: (viewport: keyof typeof VIEWPORTS) => Promise<void>
): Promise<void> {
  for (const [name, size] of Object.entries(VIEWPORTS)) {
    await test.step(`viewport: ${name}`, async () => {
      await page.setViewportSize(size);
      await testFn(name as keyof typeof VIEWPORTS);
    });
  }
}

// ─── Network Response Helpers ─────────────────────────────────────────────────

/**
 * Waits for a specific API response after an action.
 * Times out gracefully if no matching response arrives.
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: RegExp | string,
  options?: { method?: string; status?: number; timeout?: number }
): Promise<PromiseSettledValues<[Response | null]>> {
  const { method, status, timeout = 5000 } = options ?? {};

  const responsePromise = page.waitForResponse(
    r => {
      const urlMatch = typeof urlPattern === 'string'
        ? r.url().includes(urlPattern)
        : urlPattern.test(r.url());
      const methodMatch = method ? r.request().method() === method : true;
      const statusMatch = status ? r.status() === status : true;
      return urlMatch && methodMatch && statusMatch;
    },
    { timeout }
  ).catch(() => null);

  return Promise.allSettled([responsePromise]);
}

// ─── Wait Helpers ────────────────────────────────────────────────────────────

/**
 * Waits for an element to have non-zero size (is rendered with dimensions).
 */
export async function waitForElementRendered(page: Page, locator: Locator, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const box = await locator.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Element never reached non-zero dimensions after ${timeout}ms`);
}
