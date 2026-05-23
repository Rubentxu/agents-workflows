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

test.describe('REST API - Workflow CRUD', () => {
  let createdWorkflowArn: string;

  test('POST /api/workflows creates a workflow', async () => {
    const body = await fetchJSON<{ arn: string; name: string }>(`${REST_URL}/api/workflows`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'test-workflow',
        scope: 'project/test',
        stages: [],
        execution: { mode: 'sequential' }
      })
    });
    expect(body).toHaveProperty('arn');
    expect(body.arn).toContain('workflow/test-workflow');
    createdWorkflowArn = body.arn;
    console.log('Created workflow:', body.arn);
  });

  test('PUT /api/workflows/{arn} updates a workflow', async () => {
    const body = await fetchJSON<{ arn: string; name: string }>(`${REST_URL}/api/workflows`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'update-test-workflow',
        scope: 'project/test',
        stages: [],
        execution: { mode: 'sequential' }
      })
    });
    expect(body).toHaveProperty('arn');
    const arn = body.arn;

    const updateBody = await fetchJSON<{ arn: string; name: string }>(`${REST_URL}/api/workflows/${encodeURIComponent(arn)}`, {
      method: 'PUT',
      body: JSON.stringify({
        description: 'updated description'
      })
    });
    expect(updateBody).toHaveProperty('arn', arn);
  });

  test('DELETE /api/workflows/{arn} deletes a workflow', async () => {
    const body = await fetchJSON<{ arn: string }>(`${REST_URL}/api/workflows`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'delete-test-workflow',
        scope: 'project/test',
        stages: [],
        execution: { mode: 'sequential' }
      })
    });
    const arn = body.arn;

    const deleteResponse = await fetch(`${REST_URL}/api/workflows/${encodeURIComponent(arn)}`, {
      method: 'DELETE'
    });
    expect(deleteResponse.status).toBeLessThan(400);

    const getResponse = await fetch(`${REST_URL}/api/workflows/${encodeURIComponent(arn)}`);
    expect(getResponse.status).toBe(404);
  });
});

test.describe('REST API - Workspace CRUD', () => {
  let createdWorkspaceId: string;

  test('POST /api/workspaces creates a workspace', async () => {
    const body = await fetchJSON<{ id: string; name: string }>(`${REST_URL}/api/workspaces`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'test-workspace',
        project_id: 'test'
      })
    });
    expect(body).toHaveProperty('id');
    createdWorkspaceId = body.id;
    console.log('Created workspace:', body.id);
  });

  test('GET /api/workspaces/{id} returns workspace', async () => {
    const body = await fetchJSON<{ id: string; name: string }>(`${REST_URL}/api/workspaces`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'get-test-workspace',
        project_id: 'test'
      })
    });
    const id = body.id;

    const getBody = await fetchJSON<{ id: string; name: string }>(`${REST_URL}/api/workspaces/${id}`);
    expect(getBody).toHaveProperty('id', id);
  });

  test('DELETE /api/workspaces/{id} deletes workspace', async () => {
    const body = await fetchJSON<{ id: string }>(`${REST_URL}/api/workspaces`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'delete-test-workspace',
        project_id: 'test'
      })
    });
    const id = body.id;

    const deleteResponse = await fetch(`${REST_URL}/api/workspaces/${id}`, {
      method: 'DELETE'
    });
    expect(deleteResponse.status).toBeLessThan(400);

    const getResponse = await fetch(`${REST_URL}/api/workspaces/${id}`);
    expect(getResponse.status).toBe(404);
  });
});

test.describe('REST API - Agent CRUD', () => {
  let createdAgentArn: string;

  test('POST /api/agents creates an agent', async () => {
    const body = await fetchJSON<{ arn: string; name: string }>(`${REST_URL}/api/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'test-agent',
        scope: 'global',
        description: 'Test agent for CRUD',
        model: 'claude-3-5-sonnet',
        skills: [],
        tools: []
      })
    });
    expect(body).toHaveProperty('arn');
    createdAgentArn = body.arn;
    console.log('Created agent:', body.arn);
  });

  test('PUT /api/agents/{arn} updates an agent', async () => {
    const body = await fetchJSON<{ arn: string }>(`${REST_URL}/api/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'update-test-agent',
        scope: 'global',
        model: 'claude-3-5-sonnet',
        skills: [],
        tools: []
      })
    });
    const arn = body.arn;

    const updateBody = await fetchJSON<{ arn: string }>(`${REST_URL}/api/agents/${encodeURIComponent(arn)}`, {
      method: 'PUT',
      body: JSON.stringify({
        description: 'Updated description'
      })
    });
    expect(updateBody).toHaveProperty('arn', arn);
  });

  test('DELETE /api/agents/{arn} deletes an agent', async () => {
    const body = await fetchJSON<{ arn: string }>(`${REST_URL}/api/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'delete-test-agent',
        scope: 'global',
        model: 'claude-3-5-sonnet',
        skills: [],
        tools: []
      })
    });
    const arn = body.arn;

    const deleteResponse = await fetch(`${REST_URL}/api/agents/${encodeURIComponent(arn)}`, {
      method: 'DELETE'
    });
    expect(deleteResponse.status).toBeLessThan(400);

    const getResponse = await fetch(`${REST_URL}/api/agents/${encodeURIComponent(arn)}`);
    expect(getResponse.status).toBe(404);
  });
});

test.describe('REST API - Skill CRUD', () => {
  let createdSkillArn: string;

  test('POST /api/skills creates a skill', async () => {
    const body = await fetchJSON<{ arn: string; name: string }>(`${REST_URL}/api/skills`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'test-skill',
        description: 'Test skill for CRUD',
        content: '# Test Skill\n\nDescription here',
        triggers: ['test-trigger'],
        scope: 'global'
      })
    });
    expect(body).toHaveProperty('arn');
    createdSkillArn = body.arn;
    console.log('Created skill:', body.arn);
  });

  test('PUT /api/skills/{arn} updates a skill', async () => {
    const body = await fetchJSON<{ arn: string }>(`${REST_URL}/api/skills`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'update-test-skill',
        description: 'Original description',
        content: '# Skill Content',
        triggers: ['trigger1'],
        scope: 'global'
      })
    });
    const arn = body.arn;

    const updateBody = await fetchJSON<{ arn: string }>(`${REST_URL}/api/skills/${encodeURIComponent(arn)}`, {
      method: 'PUT',
      body: JSON.stringify({
        description: 'Updated description'
      })
    });
    expect(updateBody).toHaveProperty('arn', arn);
  });

  test('DELETE /api/skills/{arn} deletes a skill', async () => {
    const body = await fetchJSON<{ arn: string }>(`${REST_URL}/api/skills`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'delete-test-skill',
        description: 'To be deleted',
        content: '# Skill',
        triggers: ['trigger'],
        scope: 'global'
      })
    });
    const arn = body.arn;

    const deleteResponse = await fetch(`${REST_URL}/api/skills/${encodeURIComponent(arn)}`, {
      method: 'DELETE'
    });
    expect(deleteResponse.status).toBeLessThan(400);

    const getResponse = await fetch(`${REST_URL}/api/skills/${encodeURIComponent(arn)}`);
    expect(getResponse.status).toBe(404);
  });
});

test.describe('REST API - Prompt CRUD', () => {
  let createdPromptArn: string;

  test('POST /api/prompts creates a prompt', async () => {
    const body = await fetchJSON<{ arn: string; name: string }>(`${REST_URL}/api/prompts`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'test-prompt',
        description: 'Test prompt for CRUD',
        content: 'You are a helpful assistant.',
        scope: 'global'
      })
    });
    expect(body).toHaveProperty('arn');
    createdPromptArn = body.arn;
    console.log('Created prompt:', body.arn);
  });

  test('PUT /api/prompts/{arn} updates a prompt', async () => {
    const body = await fetchJSON<{ arn: string }>(`${REST_URL}/api/prompts`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'update-test-prompt',
        description: 'Original description',
        content: 'Original prompt content',
        scope: 'global'
      })
    });
    const arn = body.arn;

    const updateBody = await fetchJSON<{ arn: string }>(`${REST_URL}/api/prompts/${encodeURIComponent(arn)}`, {
      method: 'PUT',
      body: JSON.stringify({
        description: 'Updated description'
      })
    });
    expect(updateBody).toHaveProperty('arn', arn);
  });

  test('DELETE /api/prompts/{arn} deletes a prompt', async () => {
    const body = await fetchJSON<{ arn: string }>(`${REST_URL}/api/prompts`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'delete-test-prompt',
        description: 'To be deleted',
        content: 'Prompt to delete',
        scope: 'global'
      })
    });
    const arn = body.arn;

    const deleteResponse = await fetch(`${REST_URL}/api/prompts/${encodeURIComponent(arn)}`, {
      method: 'DELETE'
    });
    expect(deleteResponse.status).toBeLessThan(400);

    const getResponse = await fetch(`${REST_URL}/api/prompts/${encodeURIComponent(arn)}`);
    expect(getResponse.status).toBe(404);
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

  test('POST /api/workflows with invalid body returns 400', async () => {
    const response = await fetch(`${REST_URL}/api/workflows`, {
      method: 'POST',
      body: JSON.stringify({ invalid: 'payload' }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
