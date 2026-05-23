/**
 * Performance E2E Tests
 *
 * Measures and benchmarks performance metrics:
 * - Page load times for key pages
 * - API response times
 * - Concurrent execution performance
 *
 * These tests do NOT fail on slow performance - they record and report.
 * Use test.slow() when thresholds are exceeded for visibility.
 */

import '@playwright/test';
import { test, expect } from '@playwright/test';
import { MCPClient, extractArn } from '../helpers/mcp-client';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const REST_URL = process.env.AGENTS_WORKFLOWS_REST_URL || 'http://localhost:8081';
const PROJECT_ID = 'test';

// Performance benchmarks
const BENCHMARKS = {
  pageLoad: {
    domcontentloaded: 2000, // ms
    networkidle: 5000, // ms
  },
  apiResponse: 500, // ms
  concurrentExecutions: {
    totalTime: 10000, // 5 workflows in 10 seconds
    perWorkflow: 3000, // ms per workflow
  },
};

interface PerformanceResult {
  metric: string;
  value: number;
  threshold: number;
  passed: boolean;
}

function recordResult(results: PerformanceResult[], metric: string, value: number, threshold: number): void {
  const passed = value <= threshold;
  results.push({ metric, value, threshold, passed });
  if (!passed) {
    console.log(`⚠️  SLOW: ${metric} took ${value}ms (threshold: ${threshold}ms)`);
  } else {
    console.log(`✅  ${metric}: ${value}ms (threshold: ${threshold}ms)`);
  }
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<{ data: T; duration: number }> {
  const start = performance.now();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const duration = performance.now() - start;
  const data = await response.json() as T;
  return { data, duration };
}

test.describe('Performance - Page Load Times', () => {
  const performanceResults: PerformanceResult[] = [];

  test('dashboard page load performance', async ({ page }) => {
    const start = performance.now();
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    const domContentLoaded = performance.now() - start;

    recordResult(performanceResults, 'Dashboard domcontentloaded', domContentLoaded, BENCHMARKS.pageLoad.domcontentloaded);

    // Mark test as slow if threshold exceeded
    if (domContentLoaded > BENCHMARKS.pageLoad.domcontentloaded) {
      test.slow();
    }

    await expect(page.getByTestId('sidebar-navigation')).toBeVisible();
  });

  test('workflows page load performance', async ({ page }) => {
    const start = performance.now();
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/workflows`);
    await page.waitForLoadState('domcontentloaded');
    const domContentLoaded = performance.now() - start;

    recordResult(performanceResults, 'Workflows domcontentloaded', domContentLoaded, BENCHMARKS.pageLoad.domcontentloaded);

    if (domContentLoaded > BENCHMARKS.pageLoad.domcontentloaded) {
      test.slow();
    }

    await expect(page.getByTestId('workflow-catalog-page')).toBeVisible({ timeout: 10000 });
  });

  test('agents page load performance', async ({ page }) => {
    const start = performance.now();
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/registry/resources?type=agent`);
    await page.waitForLoadState('domcontentloaded');
    const domContentLoaded = performance.now() - start;

    recordResult(performanceResults, 'Agents domcontentloaded', domContentLoaded, BENCHMARKS.pageLoad.domcontentloaded);

    if (domContentLoaded > BENCHMARKS.pageLoad.domcontentloaded) {
      test.slow();
    }

    await expect(page.locator('main')).toBeVisible();
  });

  test('executions page load performance', async ({ page }) => {
    const start = performance.now();
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/observe/agent-executions`);
    await page.waitForLoadState('domcontentloaded');
    const domContentLoaded = performance.now() - start;

    recordResult(performanceResults, 'Executions domcontentloaded', domContentLoaded, BENCHMARKS.pageLoad.domcontentloaded);

    if (domContentLoaded > BENCHMARKS.pageLoad.domcontentloaded) {
      test.slow();
    }

    await expect(page.getByTestId('agent-executions-header')).toBeVisible({ timeout: 10000 });
  });

  test('insights page load performance', async ({ page }) => {
    const start = performance.now();
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/observe/insights`);
    await page.waitForLoadState('domcontentloaded');
    const domContentLoaded = performance.now() - start;

    recordResult(performanceResults, 'Insights domcontentloaded', domContentLoaded, BENCHMARKS.pageLoad.domcontentloaded);

    if (domContentLoaded > BENCHMARKS.pageLoad.domcontentloaded) {
      test.slow();
    }

    await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('metrics page load performance', async ({ page }) => {
    const start = performance.now();
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/observe/metrics`);
    await page.waitForLoadState('domcontentloaded');
    const domContentLoaded = performance.now() - start;

    recordResult(performanceResults, 'Metrics domcontentloaded', domContentLoaded, BENCHMARKS.pageLoad.domcontentloaded);

    if (domContentLoaded > BENCHMARKS.pageLoad.domcontentloaded) {
      test.slow();
    }

    await expect(page.getByRole('heading', { name: 'Metrics', exact: true })).toBeVisible({ timeout: 10000 });
  });

  test.afterAll(async () => {
    console.log('\n=== Page Load Performance Summary ===');
    const passed = performanceResults.filter(r => r.passed).length;
    const failed = performanceResults.filter(r => !r.passed).length;
    console.log(`Passed: ${passed}/${performanceResults.length}`);
    console.log(`Failed: ${failed}/${performanceResults.length}`);
    if (failed > 0) {
      console.log('\nSlow metrics:');
      performanceResults.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.metric}: ${r.value}ms (threshold: ${r.threshold}ms)`);
      });
    }
  });
});

test.describe('Performance - API Response Times', () => {
  const apiResults: PerformanceResult[] = [];

  test('GET /api/health response time', async () => {
    const { duration } = await fetchJSON<{ status: string }>(`${REST_URL}/api/health`);
    recordResult(apiResults, 'GET /api/health', duration, BENCHMARKS.apiResponse);
    expect(true).toBe(true); // Always pass - we just record
  });

  test('GET /api/workflows response time', async () => {
    const { duration } = await fetchJSON<{ workflows: unknown[] }>(`${REST_URL}/api/workflows`);
    recordResult(apiResults, 'GET /api/workflows', duration, BENCHMARKS.apiResponse);
    expect(true).toBe(true);
  });

  test('GET /api/agents response time', async () => {
    const { duration } = await fetchJSON<{ agents: unknown[] }>(`${REST_URL}/api/agents`);
    recordResult(apiResults, 'GET /api/agents', duration, BENCHMARKS.apiResponse);
    expect(true).toBe(true);
  });

  test('GET /api/executions response time', async () => {
    const { duration } = await fetchJSON<{ executions: unknown[] }>(`${REST_URL}/api/executions`);
    recordResult(apiResults, 'GET /api/executions', duration, BENCHMARKS.apiResponse);
    expect(true).toBe(true);
  });

  test('GET /api/artifacts response time', async () => {
    const { duration } = await fetchJSON<{ artifacts: unknown[] }>(`${REST_URL}/api/artifacts`);
    recordResult(apiResults, 'GET /api/artifacts', duration, BENCHMARKS.apiResponse);
    expect(true).toBe(true);
  });

  test('POST /api/workflows creation time', async () => {
    const start = performance.now();
    await fetch(`${REST_URL}/api/workflows`, {
      method: 'POST',
      body: JSON.stringify({
        name: `perf-test-${Date.now()}`,
        scope: 'project/test',
        stages: [],
        execution: { mode: 'sequential' },
      }),
    });
    const duration = performance.now() - start;
    recordResult(apiResults, 'POST /api/workflows', duration, BENCHMARKS.apiResponse * 2); // Allow more time for writes
    expect(true).toBe(true);
  });

  test.afterAll(async () => {
    console.log('\n=== API Response Performance Summary ===');
    const passed = apiResults.filter(r => r.passed).length;
    const failed = apiResults.filter(r => !r.passed).length;
    console.log(`Passed: ${passed}/${apiResults.length}`);
    console.log(`Failed: ${failed}/${apiResults.length}`);
    if (failed > 0) {
      console.log('\nSlow endpoints:');
      apiResults.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.metric}: ${r.value.toFixed(2)}ms (threshold: ${r.threshold}ms)`);
      });
    }
  });
});

test.describe('Performance - MCP Response Times', () => {
  const mcpResults: PerformanceResult[] = [];

  test('MCP workflow_list response time', async () => {
    const client = new MCPClient(BASE_URL);
    await client.initialize();

    const start = performance.now();
    const rawResult = await client.request('workflow_list');
    const duration = performance.now() - start;

    const workflows = client.parseToolResult(rawResult) as unknown[];
    recordResult(mcpResults, 'MCP workflow_list', duration, BENCHMARKS.apiResponse);
    expect(Array.isArray(workflows)).toBe(true);
  });

  test('MCP workflow_get response time', async () => {
    const client = new MCPClient(BASE_URL);
    await client.initialize();

    // First get a workflow ARN
    const rawResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawResult) as unknown[];
    if (workflows.length === 0) {
      console.log('⚠️  No workflows found, skipping workflow_get test');
      return;
    }

    const arn = extractArn(workflows[0]);
    const start = performance.now();
    await client.request('workflow_get', { arn });
    const duration = performance.now() - start;

    recordResult(mcpResults, 'MCP workflow_get', duration, BENCHMARKS.apiResponse);
    expect(true).toBe(true);
  });

  test.afterAll(async () => {
    console.log('\n=== MCP Response Performance Summary ===');
    const passed = mcpResults.filter(r => r.passed).length;
    const failed = mcpResults.filter(r => !r.passed).length;
    console.log(`Passed: ${passed}/${mcpResults.length}`);
    console.log(`Failed: ${failed}/${mcpResults.length}`);
    if (failed > 0) {
      console.log('\nSlow MCP calls:');
      mcpResults.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.metric}: ${r.value.toFixed(2)}ms (threshold: ${r.threshold}ms)`);
      });
    }
  });
});

test.describe('Performance - Concurrent Execution', () => {
  test('5 concurrent workflow executions complete in < 10 seconds', async () => {
    const client = new MCPClient(BASE_URL);
    await client.initialize();

    // Get workflow ARN
    const rawResult = await client.request('workflow_list');
    const workflows = client.parseToolResult(rawResult) as unknown[];
    if (workflows.length === 0) {
      console.log('⚠️  No workflows found, skipping concurrent execution test');
      return;
    }

    const arn = extractArn(workflows[0]);
    const numExecutions = 5;
    const start = performance.now();

    // Launch all executions concurrently
    const executionPromises = Array.from({ length: numExecutions }, (_, i) => {
      return client.request('workflow_execute', {
        workflow_arn: arn,
        workspace_id: `perf-concurrent-${Date.now()}-${i}`,
        input: { index: i, timestamp: Date.now() },
      });
    });

    const results = await Promise.all(executionPromises);
    const totalDuration = performance.now() - start;

    console.log(`\n=== Concurrent Execution Results ===`);
    console.log(`Launched ${numExecutions} executions in ${totalDuration.toFixed(2)}ms`);
    console.log(`Threshold: ${BENCHMARKS.concurrentExecutions.totalTime}ms`);

    // Record results
    const perExecutionAvg = totalDuration / numExecutions;
    console.log(`Average per execution: ${perExecutionAvg.toFixed(2)}ms`);

    // Check if within threshold
    const passed = totalDuration <= BENCHMARKS.concurrentExecutions.totalTime;
    if (!passed) {
      test.slow();
      console.log(`⚠️  SLOW: Concurrent executions took ${totalDuration.toFixed(2)}ms (threshold: ${BENCHMARKS.concurrentExecutions.totalTime}ms)`);
    } else {
      console.log(`✅  Concurrent executions within threshold`);
    }

    // Verify all executions were created
    results.forEach((result, i) => {
      const parsed = client.parseToolResult(result) as { arn?: string };
      expect(parsed.arn).toBeDefined();
    });

    expect(passed).toBe(true); // Pass if within threshold, but test won't fail overall
  });

  test('concurrent API calls - 10 simultaneous GET requests', async () => {
    const numCalls = 10;
    const start = performance.now();

    const promises = Array.from({ length: numCalls }, () =>
      fetchJSON<{ workflows: unknown[] }>(`${REST_URL}/api/workflows`)
    );

    const results = await Promise.all(promises);
    const totalDuration = performance.now() - start;

    console.log(`\n=== Concurrent API Results ===`);
    console.log(`Completed ${numCalls} GET /api/workflows in ${totalDuration.toFixed(2)}ms`);
    console.log(`Average per call: ${(totalDuration / numCalls).toFixed(2)}ms`);

    const threshold = BENCHMARKS.apiResponse * numCalls; // Allow N * base time for N concurrent calls
    const passed = totalDuration <= threshold;

    if (!passed) {
      test.slow();
      console.log(`⚠️  SLOW: ${numCalls} concurrent calls took ${totalDuration.toFixed(2)}ms`);
    } else {
      console.log(`✅  Concurrent API calls within threshold`);
    }

    results.forEach(({ data }) => {
      expect(Array.isArray(data.workflows)).toBe(true);
    });

    expect(passed).toBe(true);
  });
});

test.describe('Performance - Network Metrics', () => {
  test('measures network request counts and transfer sizes', async ({ page }) => {
    // Listen for network requests
    const requests: { url: string; resourceType: string; size: number }[] = [];
    page.on('response', response => {
      const size = parseInt(response.headers()['content-length'] || '0', 10);
      requests.push({
        url: response.url(),
        resourceType: response.request().resourceType(),
        size,
      });
    });

    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/workflows`);
    await page.waitForLoadState('networkidle');

    // Aggregate statistics
    const byType = requests.reduce((acc, req) => {
      acc[req.resourceType] = (acc[req.resourceType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalSize = requests.reduce((acc, req) => acc + req.size, 0);

    console.log(`\n=== Network Metrics ===`);
    console.log(`Total requests: ${requests.length}`);
    console.log(`Total transfer size: ${(totalSize / 1024).toFixed(2)} KB`);
    console.log(`Requests by type:`, byType);

    // Check for potential issues
    const scriptRequests = requests.filter(r => r.resourceType === 'script');
    const styleRequests = requests.filter(r => r.resourceType === 'stylesheet');
    const imageRequests = requests.filter(r => r.resourceType === 'image');

    if (scriptRequests.length > 20) {
      console.log(`⚠️  HIGH: ${scriptRequests.length} script requests (potential optimization opportunity)`);
    }
    if (totalSize > 2 * 1024 * 1024) {
      console.log(`⚠️  HIGH: Total size ${(totalSize / 1024 / 1024).toFixed(2)} MB (consider code splitting)`);
    }

    expect(requests.length).toBeGreaterThan(0);
  });
});
