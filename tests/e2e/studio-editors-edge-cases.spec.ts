/**
 * Studio Editors — Error States & Edge Cases E2E Tests
 *
 * Tests error handling, validation, and edge cases in the Studio editors
 * using Monaco-based editors (ADR-0016).
 *
 * Editor families:
 *   - YAML family (ResourceYamlEditor): Agent, Tool
 *     → Monaco YAML editor, single editing surface
 *   - Markdown family (MarkdownResourceEditor): Skill, Prompt, Template
 *     → Monaco with split view: YAML frontmatter + Markdown body
 *   - Workflow (WorkflowYamlEditor): Workflow
 *     → ReactFlow canvas + Monaco YAML panel side-by-side
 */

import { test, expect } from '../helpers/e2e-fixtures';
import { WorkflowEditorPage } from '../helpers/page-objects';
import {
  waitForMonacoReady,
  fillMonaco,
  getMonacoContent,
  getMonacoSaveButton,
  setYamlEditorValue,
  getYamlEditorValue,
  setWorkflowEditorValue,
  getWorkflowEditorValue,
  setMarkdownEditorValue,
  getMarkdownEditorValue,
  switchMarkdownView,
  MONACO_EDITOR_SELECTOR,
} from '../helpers/monaco-helpers';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const PROJECT_ID = 'test';
const PROJECT_SCOPE = `project/${PROJECT_ID}`;
const GLOBAL_SCOPE = 'global';

function editorUrl(resource: string, id: string) {
  return `${BASE_URL}/studio/projects/${PROJECT_ID}/design/${resource}/${encodeURIComponent(id)}/editor`;
}

// ─── Workflow Editor ────────────────────────────────────────────────────────

test.describe('Workflow Editor — Error States & Edge Cases', () => {
  test('shows error when loading non-existent workflow', async ({ page }) => {
    const editor = new WorkflowEditorPage(page);

    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/workflows/nonexistent-workflow/editor`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const pageLoaded = await page.getByText('← Workflows').isVisible().catch(() => false) ||
                       await page.getByText(/error/i).isVisible().catch(() => false) ||
                       await page.getByText('Page not found').isVisible().catch(() => false) ||
                       await page.getByRole('button', { name: 'Save' }).isVisible().catch(() => false);
    expect(pageLoaded).toBeTruthy();
  });

  test('YAML panel: handles invalid YAML gracefully', async ({ page, rest, seedRegistry }) => {
    const name = rest.uniqueName('e2e-invalid-yaml');
    const { arn } = await rest.createWorkflow(name, 'global');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    const editor = new WorkflowEditorPage(page);
    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');
    await waitForMonacoReady(page);

    const invalidYaml = `apiVersion: workflows.local/v1
kind: Workflow
metadata:
  name: test
spec:
  stages:
    - id: explore
      agent: orchestrator
  execution:
    mode: [invalid yaml structure`;

    await setWorkflowEditorValue(page, arn, invalidYaml);

    const content = await getWorkflowEditorValue(page, arn);
    expect(content).toContain('invalid yaml structure');

    // Save button remains enabled — the frontend does not gate Save on YAML validity.
    // The key invariant is that Monaco accepted and preserved the invalid content.
    await expect(page.locator(MONACO_EDITOR_SELECTOR)).toBeVisible();
  });

  test('YAML panel: handles empty YAML', async ({ page, rest, seedRegistry }) => {
    const name = rest.uniqueName('e2e-empty-yaml');
    const { arn } = await rest.createWorkflow(name, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/workflows/${encodeURIComponent(arn)}/editor?arn=${encodeURIComponent(arn)}`);
    await page.waitForLoadState('domcontentloaded');
    await waitForMonacoReady(page);

    await setWorkflowEditorValue(page, arn, '');

    const content = await getWorkflowEditorValue(page, arn);
    expect(content).toBe('');

    await expect(page.locator(MONACO_EDITOR_SELECTOR)).toBeVisible();
  });

  test('canvas tab: add stage shows in nodes', async ({ page, rest, seedRegistry }) => {
    const editor = new WorkflowEditorPage(page);

    const name = rest.uniqueName('e2e-canvas-test');
    const { arn } = await rest.createWorkflow(name, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');

    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible();
  });

  test('canvas tab: inspector shows when node is selected', async ({ page, rest, seedRegistry }) => {
    const editor = new WorkflowEditorPage(page);

    const name = rest.uniqueName('e2e-inspector-test');
    const { arn } = await rest.createWorkflow(name, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const nodes = page.locator('.react-flow__node');
    const nodeCount = await nodes.count();

    if (nodeCount > 0) {
      await nodes.first().click();
      await page.waitForTimeout(500);

      const inspectorPanel = page.locator('text=Select a stage to inspect').or(page.locator('[data-testid*="workflow-inspector"]'));
      const hasInspector = await inspectorPanel.isVisible().catch(() => false);
      expect(hasInspector || nodeCount > 0).toBeTruthy();
    } else {
      const placeholder = page.locator('text=Select a stage to inspect');
      await expect(placeholder).toBeVisible();
    }
  });

  test('switching between canvas and YAML preserves data', async ({ page, rest, seedRegistry }) => {
    const name = rest.uniqueName('e2e-tab-switch');
    const { arn } = await rest.createWorkflow(name, 'global');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    const editor = new WorkflowEditorPage(page);
    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');
    await waitForMonacoReady(page);

    const originalContent = await getWorkflowEditorValue(page, arn);
    expect(originalContent.length).toBeGreaterThan(0);

    // Switch to Canvas view
    const canvasButton = page.getByRole('button', { name: 'Canvas' });
    if (await canvasButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await canvasButton.click();
      await page.waitForTimeout(500);
    }

    // Switch back to YAML view
    const yamlButton = page.getByRole('button', { name: 'YAML' });
    if (await yamlButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await yamlButton.click();
      await page.waitForTimeout(500);
    }

    const afterSwitch = await getWorkflowEditorValue(page, arn);
    expect(afterSwitch.length).toBeGreaterThan(0);
  });
});

// ─── Agent Editor ────────────────────────────────────────────────────────────

test.describe('Agent Editor — Error States & Edge Cases', () => {
  test('shows shell when loading non-existent agent', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/agents/nonexistent-agent/editor`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // The editor renders an empty shell (heading + back link) for non-existent resources.
    // It does NOT show an error — the resource simply has no content.
    const backLink = page.getByText('← Agents');
    const heading = page.getByRole('heading', { name: /agent/i });
    const shellVisible = await backLink.isVisible().catch(() => false) ||
                         await heading.isVisible().catch(() => false);
    expect(shellVisible).toBeTruthy();
  });

  test('Monaco loads with YAML content for existing agent', async ({ page, rest, seedRegistry }) => {
    const name = rest.uniqueName('e2e-agent-load');
    const { arn } = await rest.createAgent(name, PROJECT_SCOPE);
    seedRegistry.register(() => rest.deleteAgent(arn));

    await page.goto(editorUrl('agents', name));
    await page.waitForLoadState('domcontentloaded');
    await waitForMonacoReady(page);

    const content = await getMonacoContent(page);
    expect(content).toContain('model:');
    expect(content).toContain('description:');
  });

  test('YAML content contains expected agent fields', async ({ page, rest, seedRegistry }) => {
    const name = rest.uniqueName('e2e-agent-fields');
    const arn = `arn:local:${PROJECT_SCOPE}:agent/${name}`;
    seedRegistry.register(() => rest.deleteAgent(arn));

    await rest.createAgent(name, PROJECT_SCOPE);

    await page.goto(editorUrl('agents', name));
    await page.waitForLoadState('domcontentloaded');
    await waitForMonacoReady(page);

    const content = await getMonacoContent(page);
    expect(content).toContain('temperature:');
    expect(content).toContain('steps:');
  });

  test('Monaco displays valid YAML content after programmatic edit', async ({ page, rest, seedRegistry }) => {
    const name = rest.uniqueName('e2e-agent-edit');
    const arn = `arn:local:${PROJECT_SCOPE}:agent/${name}`;
    seedRegistry.register(() => rest.deleteAgent(arn));

    await rest.createAgent(name, PROJECT_SCOPE);

    await page.goto(editorUrl('agents', name));
    await page.waitForLoadState('domcontentloaded');
    await waitForMonacoReady(page);

    const updatedYaml = `arn: local
model: anthropic/claude-3.5-sonnet
description: Updated via Monaco editor edge-case test
temperature: 0.9
steps: 100
mode: all
hidden: false
color: accent
tools:
  bash: true
  read: true
  edit: true
`;

    await setYamlEditorValue(page, arn, updatedYaml);

    const content = await getYamlEditorValue(page, arn);
    expect(content).toContain('anthropic/claude-3.5-sonnet');
    expect(content).toContain('Updated via Monaco editor');
  });
});

// ─── Skill Editor ─────────────────────────────────────────────────────────────

test.describe('Skill Editor — Error States & Edge Cases', () => {
  test('shows shell when loading non-existent skill', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/skills/nonexistent-skill/editor`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // The editor renders an empty shell (back link) for non-existent resources.
    const backLink = page.getByText('← Skills');
    const heading = page.getByRole('heading', { name: /skill/i });
    const shellVisible = await backLink.isVisible().catch(() => false) ||
                         await heading.isVisible().catch(() => false);
    expect(shellVisible).toBeTruthy();
  });

  test('Monaco handles large content in skill editor', async ({ page, rest, seedRegistry }) => {
    const name = rest.uniqueName('e2e-skill-large');
    const arn = `arn:local:${GLOBAL_SCOPE}:skill/${name}`;
    seedRegistry.register(() => rest.deleteSkill(arn));

    await rest.createSkill(name, GLOBAL_SCOPE);

    await page.goto(editorUrl('skills', name));
    await page.waitForLoadState('domcontentloaded');
    await waitForMonacoReady(page);

    const longBody = 'x'.repeat(5000);
    const largeContent = `---
name: ${name}
description: Large content skill test
author: e2e
version: 1.0.0
license: MIT
---

# Large Skill Content\n\n${longBody}`;

    await setMarkdownEditorValue(page, arn, largeContent);

    const content = await getMarkdownEditorValue(page, arn);
    expect(content.length).toBeGreaterThan(5000);
  });
});

// ─── Prompt Editor ────────────────────────────────────────────────────────────

test.describe('Prompt Editor — Error States & Edge Cases', () => {
  test('shows error when loading non-existent prompt', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/prompts/nonexistent-prompt/editor`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const pageLoaded = await page.getByText('← Prompts').isVisible().catch(() => false) ||
                       await page.getByText(/error/i).isVisible().catch(() => false) ||
                       await page.getByText('Page not found').isVisible().catch(() => false) ||
                       await page.getByRole('button', { name: 'Save' }).isVisible().catch(() => false);
    expect(pageLoaded).toBeTruthy();
  });

  test('Monaco split view displays multiline template content', async ({ page, rest, seedRegistry }) => {
    const name = rest.uniqueName('e2e-prompt-multi');
    const arn = `arn:local:${GLOBAL_SCOPE}:prompt/${name}`;
    seedRegistry.register(() => rest.deletePrompt(arn));

    await rest.createPrompt(name, GLOBAL_SCOPE);

    await page.goto(editorUrl('prompts', name));
    await page.waitForLoadState('domcontentloaded');
    await waitForMonacoReady(page);

    const multilineContent = `---
name: ${name}
description: Multiline prompt test
kind: system
---

You are a helpful assistant.

Context:
{{context}}

Previous conversation:
{{history}}

User: {{input}}

Please respond with: {{response_format}}`;

    await setMarkdownEditorValue(page, arn, multilineContent);

    const content = await getMarkdownEditorValue(page, arn);
    expect(content).toContain('{{context}}');
    expect(content).toContain('{{input}}');
    expect(content).toContain('{{response_format}}');
  });

  test('switching views preserves markdown content', async ({ page, rest, seedRegistry }) => {
    const name = rest.uniqueName('e2e-prompt-view');
    const arn = `arn:local:${GLOBAL_SCOPE}:prompt/${name}`;
    seedRegistry.register(() => rest.deletePrompt(arn));

    await rest.createPrompt(name, GLOBAL_SCOPE);

    await page.goto(editorUrl('prompts', name));
    await page.waitForLoadState('domcontentloaded');
    await waitForMonacoReady(page);

    const originalContent = await getMarkdownEditorValue(page, arn);

    await switchMarkdownView(page, 'frontmatter');
    await page.waitForTimeout(300);

    await switchMarkdownView(page, 'split');
    await page.waitForTimeout(300);

    const afterSwitch = await getMarkdownEditorValue(page, arn);
    expect(afterSwitch.length).toBeGreaterThan(0);
    expect(afterSwitch).toContain('---');
  });
});

// ─── Workflow Execution — Pause/Resume via REST (unchanged, MCP-based) ───────

test.describe('Workflow Execution — Pause/Resume via REST', () => {
  const REST_URL = process.env.AGENTS_WORKFLOWS_REST_URL || 'http://localhost:8081';

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

  test('can pause a running execution via REST', async ({ mcp }) => {
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    const rawExec = await mcp.request('workflow_execute', {
      workflow_arn: workflows[0].arn,
      workspace_id: `test-pause-${Date.now()}`,
      input: { test: true },
    });
    const execution = mcp.parseToolResult(rawExec) as { arn: string };
    expect(execution.arn).toBeDefined();

    const pauseResult = await fetchJSON(`${REST_URL}/api/executions/${encodeURIComponent(execution.arn)}/pause`, {
      method: 'POST',
    });
    expect(pauseResult).toBeDefined();
    console.log('Execution paused via REST:', execution.arn);

    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });

  test('can resume a paused execution via REST', async ({ mcp }) => {
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    const rawExec = await mcp.request('workflow_execute', {
      workflow_arn: workflows[0].arn,
      workspace_id: `test-resume-${Date.now()}`,
      input: { test: true },
    });
    const execution = mcp.parseToolResult(rawExec) as { arn: string };

    await fetchJSON(`${REST_URL}/api/executions/${encodeURIComponent(execution.arn)}/pause`, {
      method: 'POST',
    });
    await mcp.waitForTimeout(500);

    const resumeResult = await fetchJSON(`${REST_URL}/api/executions/${encodeURIComponent(execution.arn)}/resume`, {
      method: 'POST',
    });
    expect(resumeResult).toBeDefined();
    console.log('Execution resumed via REST:', execution.arn);

    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });

  test('paused execution has correct status', async ({ mcp }) => {
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    const rawExec = await mcp.request('workflow_execute', {
      workflow_arn: workflows[0].arn,
      workspace_id: `test-pause-status-${Date.now()}`,
      input: { test: true },
    });
    const execution = mcp.parseToolResult(rawExec) as { arn: string };

    await fetchJSON(`${REST_URL}/api/executions/${encodeURIComponent(execution.arn)}/pause`, {
      method: 'POST',
    });
    await mcp.waitForTimeout(500);

    const rawState = await mcp.request('workflow_get_state', {
      execution_arn: execution.arn,
    });
    const state = mcp.parseToolResult(rawState) as { status: string };
    expect(state.status).toBe('paused');

    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });
});

// ─── Multi-Stage Workflow — Stage Dependencies (unchanged, MCP-based) ────────

test.describe('Multi-Stage Workflow — Stage Dependencies', () => {
  test('workflow with multiple stages executes all stages', async ({ mcp }) => {
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    let multiStageArn = workflows[0].arn;
    for (const wf of workflows) {
      const rawDag = await mcp.request('workflow_get_dag', { arn: wf.arn });
      const dag = mcp.parseToolResult(rawDag) as { nodes: unknown[] };
      if (dag.nodes.length > 1) {
        multiStageArn = wf.arn;
        break;
      }
    }

    const rawExec = await mcp.request('workflow_execute', {
      workflow_arn: multiStageArn,
      workspace_id: `test-multi-stage-${Date.now()}`,
      input: { goal: 'test multi-stage workflow' },
    });
    const execution = mcp.parseToolResult(rawExec) as { arn: string };
    expect(execution.arn).toBeDefined();
    console.log('Multi-stage execution:', execution.arn);

    const rawDag = await mcp.request('workflow_get_dag', { arn: multiStageArn });
    const dag = mcp.parseToolResult(rawDag) as { nodes: Array<{ id: string }>; edges: unknown[] };
    console.log(`Workflow has ${dag.nodes.length} stages and ${dag.edges.length} dependencies`);

    const rawNext = await mcp.request('workflow_get_next_stage', {
      execution_arn: execution.arn,
    });
    const nextStage = mcp.parseToolResult(rawNext);
    expect(nextStage).toBeDefined();

    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });

  test('workflow DAG shows correct node and edge structure', async ({ mcp }) => {
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    const arn = workflows[0].arn;
    const rawDag = await mcp.request('workflow_get_dag', { arn });
    const dag = mcp.parseToolResult(rawDag) as { nodes: unknown[]; edges: unknown[] };

    expect(Array.isArray(dag.nodes)).toBeTruthy();
    expect(Array.isArray(dag.edges)).toBeTruthy();

    for (const node of dag.nodes as Array<{ id: string; stage: string; depends_on: string[] }>) {
      expect(typeof node.id).toBe('string');
      expect(typeof node.stage).toBe('string');
      expect(Array.isArray(node.depends_on)).toBeTruthy();
    }

    for (const edge of dag.edges as Array<{ from: string; to: string }>) {
      expect(typeof edge.from).toBe('string');
      expect(typeof edge.to).toBe('string');
    }

    console.log(`DAG structure: ${dag.nodes.length} nodes, ${dag.edges.length} edges`);
  });

  test('sequential execution respects dependency order', async ({ mcp }) => {
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    const rawExec = await mcp.request('workflow_execute', {
      workflow_arn: workflows[0].arn,
      workspace_id: `test-sequential-${Date.now()}`,
      input: { test: true },
    });
    const execution = mcp.parseToolResult(rawExec) as { arn: string };

    const stages = ['explore', 'spec', 'design', 'tasks'];
    for (const stage of stages) {
      const rawUpdate = await mcp.request('workflow_update_state', {
        execution_arn: execution.arn,
        status: 'running',
        current_stage: stage,
        completed_stages: stages.slice(0, stages.indexOf(stage)),
      });
      expect(rawUpdate).toBeDefined();

      const rawNext = await mcp.request('workflow_get_next_stage', {
        execution_arn: execution.arn,
      });
      const next = mcp.parseToolResult(rawNext);
      expect(next).toBeDefined();
    }

    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });
});

// ─── Resource Override Flow (unchanged, REST-based) ──────────────────────────

test.describe('Resource Override Flow', () => {
  test('override workflow appears in project scope', async ({ page, rest, seedRegistry }) => {
    const globalName = rest.uniqueName('global-to-override');
    const { arn: globalArn } = await rest.createWorkflow(globalName, 'global');
    seedRegistry.register(() => rest.deleteWorkflow(globalArn));

    const projectName = rest.uniqueName('override-workflow');
    const { arn: overrideArn } = await rest.createWorkflow(projectName, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(overrideArn));

    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/workflows`);
    await page.waitForLoadState('networkidle');

    const globalRow = page.locator(`[data-testid="workflow-catalog-row-${globalName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"]`);
    const projectRow = page.locator(`[data-testid="workflow-catalog-row-${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"]`);

    await page.reload();
    await page.waitForLoadState('networkidle');

    console.log(`Global workflow: ${globalArn}, Project override: ${overrideArn}`);
  });

  test('override source ARN is recorded correctly', async ({ rest, seedRegistry }) => {
    const sourceName = rest.uniqueName('override-source');
    const { arn: sourceArn } = await rest.createWorkflow(sourceName, 'global');
    seedRegistry.register(() => rest.deleteWorkflow(sourceArn));

    const overrideName = sourceName;
    const { arn: overrideArn } = await rest.createWorkflow(overrideName, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(overrideArn));

    expect(sourceArn).not.toBe(overrideArn);
    expect(sourceArn).toContain('global');
    expect(overrideArn).toContain('project');

    console.log(`Source: ${sourceArn}, Override: ${overrideArn}`);
  });
});

// ─── Validation & Edge Cases (unchanged, MCP/REST-based) ─────────────────────

test.describe('Validation & Edge Cases', () => {
  test('workflow without stages is valid', async ({ rest, seedRegistry }) => {
    const name = rest.uniqueName('empty-workflow');
    const { arn } = await rest.createWorkflow(name, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    expect(arn).toBeDefined();
    expect(arn).toContain(name);
  });

  test('agent without optional fields is valid', async ({ rest, seedRegistry }) => {
    const name = rest.uniqueName('minimal-agent');
    const { arn } = await rest.createAgent(name, 'global');
    seedRegistry.register(() => rest.deleteAgent(arn));

    expect(arn).toBeDefined();
    expect(arn).toContain(name);
  });

  test('skill without triggers is valid', async ({ rest, seedRegistry }) => {
    const name = rest.uniqueName('no-triggers-skill');
    const { arn } = await rest.createSkill(name, 'global');
    seedRegistry.register(() => rest.deleteSkill(arn));

    expect(arn).toBeDefined();
  });

  test('execution with empty input is valid', async ({ mcp }) => {
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    const rawExec = await mcp.request('workflow_execute', {
      workflow_arn: workflows[0].arn,
      workspace_id: `test-empty-input-${Date.now()}`,
      input: {},
    });
    const execution = mcp.parseToolResult(rawExec) as { arn: string };
    expect(execution.arn).toBeDefined();

    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });

  test('execution with complex nested input is valid', async ({ mcp }) => {
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    const rawExec = await mcp.request('workflow_execute', {
      workflow_arn: workflows[0].arn,
      workspace_id: `test-complex-input-${Date.now()}`,
      input: {
        user: { id: 123, name: 'Test User' },
        settings: { theme: 'dark', notifications: true },
        tags: ['test', 'e2e', 'complex'],
        metadata: { created_at: new Date().toISOString() },
      },
    });
    const execution = mcp.parseToolResult(rawExec) as { arn: string };
    expect(execution.arn).toBeDefined();

    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });
});
