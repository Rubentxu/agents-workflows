import { test as base, expect } from '@playwright/test';
import type { PageEvidence } from './evidence';
import { attachPageEvidence, installPageEvidence } from './evidence';
import { MCPClient } from './mcp-client';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const REST_URL = process.env.AGENTS_WORKFLOWS_REST_URL || 'http://localhost:8081';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${options?.method ?? 'GET'} ${url}`);
  }

  return response.json() as Promise<T>;
}

export class RestSeedClient {
  constructor(private readonly restURL: string) {}

  uniqueName(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async createWorkflow(name: string, scope = 'project/test') {
    return fetchJSON<{ arn: string; name: string }>(`${this.restURL}/api/workflows`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        scope,
        stages: [],
        execution: { mode: 'sequential' },
      }),
    });
  }

  async deleteWorkflow(arn: string): Promise<void> {
    await fetch(`${this.restURL}/api/workflows/${encodeURIComponent(arn)}`, { method: 'DELETE' });
  }

  async createAgent(name: string, scope = 'global') {
    // Returns { arn: string, name: string, ... }
    return fetchJSON<{ arn: string; name: string; created_at: string; scope: string }>(`${this.restURL}/api/agents`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        scope,
        description: 'E2E seed agent',
        model: 'openai/gpt-4o-mini',
        prompt: null,
        skills: [],
        tools: {},
        permission: null,
        temperature: 0.7,
        top_p: null,
        steps: 50,
        mode: 'all',
        hidden: false,
        color: 'primary',
        variant: null,
        options: null,
      }),
    });
  }

  async deleteAgent(arn: string): Promise<void> {
    await fetch(`${this.restURL}/api/agents/${encodeURIComponent(arn)}`, { method: 'DELETE' });
  }

  async getAgent(arn: string) {
    return fetchJSON<{ id: string; name: string; scope: string; config: string }>(`${this.restURL}/api/agents/${encodeURIComponent(arn)}`);
  }

  async createSkill(name: string, scope = 'global') {
    // Returns { arn: string, name: string, ... }
    return fetchJSON<{ arn: string; name: string; created_at: string; scope: string }>(`${this.restURL}/api/skills`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        scope,
        description: 'Use when validating E2E resource flows',
        content_path: null,
        content: '# E2E Skill\n\nUse when validating end-to-end test flows.',
        triggers: [],
        version: '1.0.0',
        author: 'e2e',
        license: 'MIT',
        references: [],
        required_tools: [],
      }),
    });
  }

  async deleteSkill(arn: string): Promise<void> {
    await fetch(`${this.restURL}/api/skills/${encodeURIComponent(arn)}`, { method: 'DELETE' });
  }

  async getSkill(arn: string) {
    return fetchJSON<{ id: string; name: string; scope: string; config: string }>(`${this.restURL}/api/skills/${encodeURIComponent(arn)}`);
  }

  async createPrompt(name: string, scope = 'global') {
    // Returns { arn: string, name: string, ... }
    return fetchJSON<{ arn: string; name: string; created_at: string; scope: string }>(`${this.restURL}/api/prompts`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        scope,
        description: 'E2E prompt seed',
        content_path: null,
        content: 'You are an E2E seed prompt.',
        kind: 'system',
        template: null,
      }),
    });
  }

  async deletePrompt(arn: string): Promise<void> {
    await fetch(`${this.restURL}/api/prompts/${encodeURIComponent(arn)}`, { method: 'DELETE' });
  }

  async getPrompt(arn: string) {
    return fetchJSON<{ id: string; name: string; scope: string; config: string }>(`${this.restURL}/api/prompts/${encodeURIComponent(arn)}`);
  }

  async createTool(name: string, scope = 'global') {
    return fetchJSON<{ arn: string; name: string; created_at: string; scope: string }>(`${this.restURL}/api/tools`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        scope,
        description: 'E2E tool seed',
        source: `custom://${name}`,
        source_type: 'custom',
        input_schema: { type: 'object', properties: {} },
        output_schema: null,
        category: 'custom',
        tags: ['e2e'],
        implementation_path: `tools/${name}.sh`,
        runtime: 'bash',
      }),
    });
  }

  async deleteTool(arn: string): Promise<void> {
    await fetch(`${this.restURL}/api/tools/${encodeURIComponent(arn)}`, { method: 'DELETE' });
  }

  async getTool(arn: string) {
    return fetchJSON<{ id: string; name: string; scope: string; config: string }>(`${this.restURL}/api/tools/${encodeURIComponent(arn)}`);
  }

  async createTemplate(name: string, scope = 'global') {
    return fetchJSON<{ arn: string; name: string; created_at: string; scope: string }>(`${this.restURL}/api/templates`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        scope,
        description: 'E2E template seed',
        content_path: `templates/${name}.md`,
        format: 'markdown',
        target_kind: 'prompt',
      }),
    });
  }

  async deleteTemplate(arn: string): Promise<void> {
    await fetch(`${this.restURL}/api/templates/${encodeURIComponent(arn)}`, { method: 'DELETE' });
  }

  async getTemplate(arn: string) {
    return fetchJSON<{ id: string; name: string; scope: string; config: string }>(`${this.restURL}/api/templates/${encodeURIComponent(arn)}`);
  }

  async createWorkspace(name: string, projectId = 'test') {
    return fetchJSON<{ id: string; name: string }>(`${this.restURL}/api/workspaces`, {
      method: 'POST',
      body: JSON.stringify({ name, project_id: projectId }),
    });
  }

  async deleteWorkspace(id: string): Promise<void> {
    await fetch(`${this.restURL}/api/workspaces/${id}`, { method: 'DELETE' });
  }
}

class SeedRegistry {
  private cleanups: Array<() => Promise<void>> = [];

  register(cleanup: () => Promise<void>): void {
    this.cleanups.unshift(cleanup);
  }

  async cleanupAll(): Promise<void> {
    for (const cleanup of this.cleanups) {
      try {
        await cleanup();
      } catch {
        // Best-effort cleanup for test fixtures.
      }
    }
    this.cleanups = [];
  }
}

type E2EFixtures = {
  mcp: MCPClient;
  rest: RestSeedClient;
  seedRegistry: SeedRegistry;
  pageEvidence: PageEvidence;
};

export const test = base.extend<E2EFixtures>({
  mcp: async ({}, use) => {
    const client = new MCPClient(BASE_URL);
    await client.initialize();
    await use(client);
  },

  rest: async ({}, use) => {
    await use(new RestSeedClient(REST_URL));
  },

  seedRegistry: async ({}, use) => {
    const registry = new SeedRegistry();
    await use(registry);
    await registry.cleanupAll();
  },

  pageEvidence: async ({ page }, use, testInfo) => {
    const evidence = installPageEvidence(page);
    await use(evidence);
    await attachPageEvidence(page, testInfo, evidence);
  },
});

export { expect };
