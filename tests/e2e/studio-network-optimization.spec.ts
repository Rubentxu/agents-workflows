/**
 * Studio Network Optimization Tests (Phase 4.4)
 * 
 * Tests that verify network mocking and optimization work correctly.
 * These tests help ensure flaky tests become reliable.
 */

import { test, expect } from '../helpers/e2e-fixtures';
import { abortExternalRequests, mockSSEStreams, applyNetworkMocks } from '../helpers/network-mock';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const PROJECT_ID = 'test';

test.describe('Studio Network Optimization (Phase 4.4)', () => {
  test('page loads with sidebar visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    
    await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
  });

  test('metrics page does not hang', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/observe/metrics`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible();
  });

  test('insights page loads normally', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/observe/insights`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    
    // Use exact match to avoid conflict with "No insights found" h3
    await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();
  });

  test('network abort helper can be applied', async ({ page }) => {
    // Just verify the helper doesn't crash
    await abortExternalRequests(page);
    
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    
    await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
  });

  test('SSE mock helper can be applied', async ({ page }) => {
    await mockSSEStreams(page);
    
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/observe/metrics`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    
    await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible();
  });
});
