import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for agents-workflows E2E tests
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  preserveOutput: 'always',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: './playwright-report' }],
    ['list'],
    ['json', { outputFile: './test-results/results.json' }],
  ],
  globalSetup: './helpers/global-setup.ts',
  globalTeardown: './helpers/global-teardown.ts',
  projects: [
    {
      name: 'api',
      testMatch: /.*api\.spec\.ts/,
      use: { baseURL: 'http://localhost:8080' },
    },
    {
      name: 'mcp',
      testMatch: /.*mcp\.spec\.ts/,
      use: { baseURL: 'http://localhost:8080' },
    },
    {
      name: 'workflows',
      testMatch: /.*workflows\.spec\.ts/,
      use: { baseURL: 'http://localhost:8080' },
    },
    {
      name: 'chromium',
      testMatch: /.*studio\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:8080' },
    },
  ],
});
