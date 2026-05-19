/**
 * REST API E2E Tests
 * 
 * Tests all REST API endpoints:
 * - GET  /api/health
 * - GET  /metrics/sse (MCP server)
 * - GET  /api/workflows
 * - GET  /api/agents
 * - GET  /api/skills
 * - GET  /api/prompts
 * - GET  /api/artifacts
 * - GET  /api/executions
 */

import '@playwright/test';
import { test, expect } from '@playwright/test';

const REST_URL = process.env.AGENTS_WORKFLOWS_REST_URL || 'http://localhost:8081';
const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return response.json() as Promise<T>;
}

test.describe('REST API - Health & Registry', () => {
  test('GET /api/health returns healthy status', async () => {
    const body = await fetchJSON<{ status: string; version: string }>(`${REST_URL}/api/health`);
    expect(body).toHaveProperty('status', 'healthy');
    expect(body).toHaveProperty('version');
    console.log('Health response:', JSON.stringify(body, null, 2));
  });
  
  test('GET /api/health includes uptime', async () => {
    const body = await fetchJSON<{ uptime_seconds: number }>(`${REST_URL}/api/health`);
    expect(body).toHaveProperty('uptime_seconds');
  });
  
  test('GET /metrics/sse returns SSE stream', async () => {
    const response = await fetch(`${BASE_URL}/metrics/sse`);
    expect(response.ok).toBeTruthy();
    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('text/event-stream');
  });
});

test.describe('REST API - Resources', () => {
  test('GET /api/workflows returns workflow list', async () => {
    const body = await fetchJSON<{ workflows: unknown[] }>(`${REST_URL}/api/workflows`);
    expect(Array.isArray(body.workflows)).toBeTruthy();
    console.log(`Found ${body.workflows.length} workflows`);
  });
  
  test('GET /api/agents returns agent list', async () => {
    const body = await fetchJSON<{ agents: unknown[] }>(`${REST_URL}/api/agents`);
    expect(Array.isArray(body.agents)).toBeTruthy();
    console.log(`Found ${body.agents.length} agents`);
  });
  
  test('GET /api/skills returns skill list', async () => {
    const body = await fetchJSON<{ skills: unknown[] }>(`${REST_URL}/api/skills`);
    expect(Array.isArray(body.skills)).toBeTruthy();
    console.log(`Found ${body.skills.length} skills`);
  });
  
  test('GET /api/prompts returns prompt list', async () => {
    const body = await fetchJSON<{ prompts: unknown[] }>(`${REST_URL}/api/prompts`);
    expect(Array.isArray(body.prompts)).toBeTruthy();
    console.log(`Found ${body.prompts.length} prompts`);
  });
  
  test('GET /api/artifacts returns artifact list', async () => {
    const body = await fetchJSON<{ artifacts: unknown[] }>(`${REST_URL}/api/artifacts`);
    expect(Array.isArray(body.artifacts)).toBeTruthy();
    console.log(`Found ${body.artifacts.length} artifacts`);
  });
  
  test('GET /api/executions returns execution list', async () => {
    const body = await fetchJSON<{ executions: unknown[] }>(`${REST_URL}/api/executions`);
    expect(Array.isArray(body.executions)).toBeTruthy();
    console.log(`Found ${body.executions.length} executions`);
  });
});

test.describe('REST API - Error Handling', () => {
  test('GET /api/nonexistent returns 404', async () => {
    const response = await fetch(`${REST_URL}/api/nonexistent`);
    expect(response.status).toBe(404);
  });
  
  test('POST /api/nonexistent returns 404', async () => {
    const response = await fetch(`${REST_URL}/api/nonexistent`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(404);
  });
});
