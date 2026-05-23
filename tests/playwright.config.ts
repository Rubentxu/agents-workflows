import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

/**
 * Playwright configuration for agents-workflows E2E tests
 * 
 * Single server mode for local development.
 * Multi-instance mode (Phase 4.5) only enabled in CI with proper infrastructure.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  preserveOutput: 'always',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: isCI ? 2 : 0,
  workers: isCI ? 4 : 2,
  reporter: [
    ['html', { outputFolder: './playwright-report' }],
    ['list'],
    ['json', { outputFile: './test-results/results.json' }],
  ],
  metadata: {
    e2eMode: process.env.E2E_MODE ?? 'attach',
  },
  use: {
    baseURL: 'http://localhost:8081',
    screenshot: 'only-on-failure',
    trace: isCI ? 'retain-on-failure' : 'on-first-retry',
    video: 'retain-on-failure',
  },
  globalSetup: './helpers/global-setup.ts',
  globalTeardown: './helpers/global-teardown.ts',
  
  // Single server projects for local development
  projects: [
    // Core studio tests (exclude observe-data, accessibility, network which have their own projects)
    {
      name: 'chromium-studio',
      testMatch: /^(?!.*(?:studio-observe-data|studio-accessibility|studio-network-optimization)).*studio.*\.spec\.ts$/,
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8081',
      },
    },
    
    // Agent execution flow
    {
      name: 'chromium-executions',
      testMatch: /agent-execution-flow\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8081',
      },
    },
    
    // Observe data tests
    {
      name: 'chromium-observe-data',
      testMatch: /studio-observe-data\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8081',
      },
    },
    
    // Accessibility tests
    {
      name: 'chromium-accessibility',
      testMatch: /studio-accessibility\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8081',
      },
    },
    
    // Network optimization tests
    {
      name: 'chromium-network',
      testMatch: /studio-network-optimization\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8081',
      },
    },

    // Functional capture audit
    {
      name: 'chromium-functional-audit',
      testMatch: /functional-audit-captures\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8081',
      },
    },
    
    // API tests
    {
      name: 'chromium-api',
      testMatch: /api\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8081',
      },
    },
    
    // MCP tests
    {
      name: 'chromium-mcp', 
      testMatch: /mcp\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8081',
      },
    },
    
    // Workflow tests
    {
      name: 'chromium-workflows',
      testMatch: /workflows\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8081',
      },
    },

    // Performance tests
    {
      name: 'chromium-performance',
      testMatch: /performance\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:8081',
      },
    },

    // Visual regression tests
    {
      name: 'chromium-visual-regression',
      testMatch: /visual-regression\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:8081',
        viewport: { width: 1440, height: 900 },
        // Snapshots stored in Playwright's default test-file snapshots directory.
        screenshot: 'only-on-failure',
      },
    },
  ],
});
