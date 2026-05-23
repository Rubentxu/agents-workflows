/**
 * Network Mocking Helper for E2E Tests
 * 
 * Provides utilities for mocking flaky or external network requests
 * to make tests more reliable and deterministic.
 */

import type { Page, Route } from '@playwright/test';

/**
 * Mock configuration for a URL pattern
 */
export interface MockConfig {
  /** URL pattern to match (can be string or RegExp) */
  url: string | RegExp;
  /** HTTP status code to return */
  status?: number;
  /** Response body (will be JSON stringified if object) */
  body?: string | object;
  /** Response headers */
  headers?: Record<string, string>;
  /** Delay in ms before responding */
  delay?: number;
}

/**
 * Default mocks for known flaky endpoints
 */
const DEFAULT_MOCKS: MockConfig[] = [
  // Mock external API calls that might be slow or unavailable
  {
    url: /fonts\.googleapis\.com/,
    status: 200,
    body: '{}',
    delay: 0,
  },
  {
    url: /fonts\.gstatic\.com/,
    status: 200,
    body: '',
    delay: 0,
  },
  // Mock any analytics or tracking endpoints
  {
    url: /analytics|tracking|telemetry/,
    status: 204,
    body: '',
  },
];

/**
 * Apply network mocks to a page
 */
export async function applyNetworkMocks(
  page: Page,
  mocks: MockConfig[] = DEFAULT_MOCKS
): Promise<void> {
  for (const mock of mocks) {
    await page.route(mock.url, async (route: Route) => {
      if (mock.delay) {
        await page.waitForTimeout(mock.delay);
      }
      
      await route.fulfill({
        status: mock.status || 200,
        body: typeof mock.body === 'object' 
          ? JSON.stringify(mock.body) 
          : (mock.body || ''),
        headers: {
          'Content-Type': 'application/json',
          ...mock.headers,
        },
      });
    });
  }
}

/**
 * Abort requests to external domains that might slow down tests
 */
export async function abortExternalRequests(page: Page): Promise<void> {
  await page.route('**/*', async (route: Route) => {
    const url = route.request().url();
    
    // Allow localhost requests (our servers)
    if (url.startsWith('http://localhost') || url.startsWith('https://localhost')) {
      await route.continue();
      return;
    }
    
    // Allow blob: and data: URLs (common in SPAs)
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      await route.continue();
      return;
    }
    
    // Abort all other external requests
    await route.abort();
  });
}

/**
 * Create a mock that returns specific data for a given request
 */
export function createMockHandler(config: MockConfig) {
  return async (route: Route) => {
    if (config.delay) {
      await new Promise(resolve => setTimeout(resolve, config.delay));
    }
    
    await route.fulfill({
      status: config.status || 200,
      body: typeof config.body === 'object' 
        ? JSON.stringify(config.body) 
        : (config.body || ''),
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });
  };
}

/**
 * Stub out SSE streams for testing (prevent hanging on networkidle)
 */
export async function mockSSEStreams(page: Page): Promise<void> {
  // Mock the metrics SSE endpoint
  await page.route(/\/api\/metrics\/sse/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"ping"}\n\n',
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  });
}

/**
 * Speed up tests by mocking slow network resources
 */
export async function optimizeNetworkForTests(page: Page): Promise<void> {
  // Abort external requests
  await abortExternalRequests(page);
  
  // Mock SSE to prevent hanging
  await mockSSEStreams(page);
}
