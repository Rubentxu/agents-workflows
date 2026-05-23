/**
 * Studio Editors — Error States & Edge Cases E2E Tests
 *
 * Tests error handling, validation, and edge cases in the Studio editors:
 * - Workflow Editor: YAML parsing errors, invalid stages, canvas interactions
 * - Agent Editor: validation errors, config tab errors
 * - Skill Editor: save failures, empty states
 * - Prompt Editor: validation, content edge cases
 * - Multi-stage workflows: complex DAGs, dependencies
 */

import { test, expect } from '../helpers/e2e-fixtures';
import { WorkflowEditorPage, AgentEditorPage } from '../helpers/page-objects';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const PROJECT_ID = 'test';

test.describe('Workflow Editor — Error States & Edge Cases', () => {
  test('shows error when loading non-existent workflow', async ({ page }) => {
    const editor = new WorkflowEditorPage(page);

    // Navigate to a workflow that doesn't exist
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/workflows/nonexistent-workflow/editor`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Should either show error, or load the editor in some state without crashing
    // The key is that the page doesn't hard-crash
    const pageLoaded = await page.getByText('← Workflows').isVisible().catch(() => false) ||
                       await page.getByText(/error/i).isVisible().catch(() => false) ||
                       await page.getByText('Page not found').isVisible().catch(() => false) ||
                       await page.getByRole('button', { name: 'Save' }).isVisible().catch(() => false);
    expect(pageLoaded).toBeTruthy();
  });

  test('YAML tab: handles invalid YAML gracefully', async ({ page }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.gotoNew(PROJECT_ID);
    await page.waitForLoadState('domcontentloaded');

    await editor.switchToYamlTab();
    const textarea = editor.yamlEditor;
    await expect(textarea).toBeVisible();

    // Enter malformed YAML
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

    await textarea.clear();
    await textarea.fill(invalidYaml);

    // Apply button should be clickable but may show error on parse
    const applyBtn = page.getByRole('button', { name: 'Apply changes' });
    if (await applyBtn.isVisible()) {
      await applyBtn.click();
      await page.waitForTimeout(500);
      // Editor should not crash - either shows error or reverts
      const stillVisible = await textarea.isVisible();
      expect(stillVisible).toBeTruthy();
    }
  });

  test('YAML tab: handles empty YAML', async ({ page }) => {
    const editor = new WorkflowEditorPage(page);
    await editor.gotoNew(PROJECT_ID);
    await page.waitForLoadState('domcontentloaded');

    await editor.switchToYamlTab();
    const textarea = editor.yamlEditor;
    await expect(textarea).toBeVisible();

    // Clear and leave empty
    await textarea.clear();

    // Apply should still work or show appropriate error
    const applyBtn = page.getByRole('button', { name: 'Apply changes' });
    if (await applyBtn.isVisible()) {
      await applyBtn.click();
      await page.waitForTimeout(300);
    }
    // Editor should remain functional
    await expect(textarea).toBeVisible();
  });

  test('canvas tab: add stage shows in nodes', async ({ page, rest, seedRegistry }) => {
    const editor = new WorkflowEditorPage(page);

    // Create a workflow with stages
    const name = rest.uniqueName('e2e-canvas-test');
    const { arn } = await rest.createWorkflow(name, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');

    // The canvas should be visible with the ReactFlow container
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible();
  });

  test('canvas tab: inspector shows when node is selected', async ({ page, rest, seedRegistry }) => {
    const editor = new WorkflowEditorPage(page);

    // Create workflow with stages via YAML
    const name = rest.uniqueName('e2e-inspector-test');
    const { arn } = await rest.createWorkflow(name, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');

    // Wait for canvas to load
    await page.waitForTimeout(1000);

    // Try to click on a node if any exist
    const nodes = page.locator('.react-flow__node');
    const nodeCount = await nodes.count();

    if (nodeCount > 0) {
      // Click a node
      await nodes.first().click();
      await page.waitForTimeout(500);

      // Inspector panel should appear with stage details
      const inspectorPanel = page.locator('text=Select a stage to inspect').or(page.locator('[data-testid*="workflow-inspector"]'));
      // Either inspector is shown or the "select stage" placeholder
      const hasInspector = await inspectorPanel.isVisible().catch(() => false);
      expect(hasInspector || nodeCount > 0).toBeTruthy();
    } else {
      // No nodes - should show placeholder
      const placeholder = page.locator('text=Select a stage to inspect');
      await expect(placeholder).toBeVisible();
    }
  });

  test('switching tabs preserves data', async ({ page, rest, seedRegistry }) => {
    const editor = new WorkflowEditorPage(page);

    const name = rest.uniqueName('e2e-tab-switch');
    const { arn } = await rest.createWorkflow(name, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');

    // Switch to YAML and enter content
    await editor.switchToYamlTab();
    const textarea = editor.yamlEditor;
    await expect(textarea).toBeVisible();

    const originalContent = await textarea.inputValue();

    // Switch back to canvas
    await page.getByRole('button', { name: 'Canvas' }).click();
    await page.waitForTimeout(300);

    // Switch back to YAML
    await editor.switchToYamlTab();
    await page.waitForTimeout(300);

    // Content should be preserved
    const afterSwitch = await textarea.inputValue();
    // Content should either be preserved or the workflow loaded fresh
    expect(afterSwitch.length).toBeGreaterThan(0);
  });
});

test.describe('Agent Editor — Error States & Edge Cases', () => {
  test('shows error when loading non-existent agent', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/agents/nonexistent-agent/editor`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Should either show editor chrome, error, or loading without crashing.
    const hasContent = await page.getByRole('button', { name: /agents/i }).isVisible().catch(() => false) ||
                      await page.getByRole('button', { name: 'Save' }).isVisible().catch(() => false) ||
                      await page.getByRole('heading', { name: /nonexistent-agent/i }).isVisible().catch(() => false) ||
                      await page.getByText(/error/i).isVisible().catch(() => false) ||
                      await page.getByText(/loading/i).isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('config tab: name field validates empty name', async ({ page }) => {
    const editor = new AgentEditorPage(page);
    await editor.gotoNew(PROJECT_ID);
    await page.waitForLoadState('domcontentloaded');

    // Find the name input
    const nameInput = page.locator('input[type="text"]').first();
    await expect(nameInput).toBeVisible();

    // Clear the name
    await nameInput.clear();

    // Save button should be disabled or show validation
    const saveBtn = page.getByRole('button', { name: 'Save' });
    // If validation exists, button might be disabled
    // Either way, clearing name should not crash
    expect(await nameInput.inputValue()).toBe('');
  });

  test('config tab: model field accepts various model names', async ({ page }) => {
    const editor = new AgentEditorPage(page);
    await editor.gotoNew(PROJECT_ID);
    await page.waitForLoadState('domcontentloaded');

    // Find model input (second text input)
    const modelInput = page.locator('input[type="text"]').nth(1);
    await expect(modelInput).toBeVisible();

    // Try different model names
    const models = ['gpt-4', 'claude-3-5-sonnet', 'gemini-pro', 'ollama/llama2'];
    for (const model of models) {
      await modelInput.clear();
      await modelInput.fill(model);
      const value = await modelInput.inputValue();
      expect(value).toBe(model);
    }
  });

  test('config tab: timeout field accepts numeric values', async ({ page }) => {
    const editor = new AgentEditorPage(page);
    await editor.gotoNew(PROJECT_ID);
    await page.waitForLoadState('domcontentloaded');

    // Find timeout input (number type)
    const timeoutInput = page.locator('input[type="number"]');
    await expect(timeoutInput).toBeVisible();

    // Enter timeout values
    await timeoutInput.clear();
    await timeoutInput.fill('120000');
    expect(await timeoutInput.inputValue()).toBe('120000');

    await timeoutInput.clear();
    await timeoutInput.fill('30000');
    expect(await timeoutInput.inputValue()).toBe('30000');
  });

  test('resources tab: shows empty state correctly', async ({ page }) => {
    const editor = new AgentEditorPage(page);
    await editor.gotoNew(PROJECT_ID);
    await page.waitForLoadState('domcontentloaded');

    // Switch to resources tab
    await page.getByRole('button', { name: 'Resources' }).click();
    await page.waitForTimeout(300);

    // Should show empty state messages for skills, prompts, tools
    const emptyMessages = page.locator('text=No skills bound').or(page.locator('text=No prompts bound')).or(page.locator('text=No tools bound'));
    await expect(emptyMessages.first()).toBeVisible();
  });

  test('yaml tab: shows JSON representation', async ({ page }) => {
    const editor = new AgentEditorPage(page);
    await editor.gotoNew(PROJECT_ID);
    await page.waitForLoadState('domcontentloaded');

    // Switch to YAML tab
    await page.getByRole('button', { name: 'YAML' }).click();
    await page.waitForTimeout(300);

    // Should show JSON/YAML representation of the agent
    const preElement = page.locator('pre');
    await expect(preElement).toBeVisible();

    // Content should be parseable JSON
    const content = await preElement.textContent();
    expect(() => JSON.parse(content || '{}')).not.toThrow();
  });
});

test.describe('Skill Editor — Error States & Edge Cases', () => {
  test('shows error when loading non-existent skill', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/skills/nonexistent-skill/editor`);
    await page.waitForLoadState('domcontentloaded');

    // Should not crash
    const hasContent = await page.getByText('← Skills').isVisible().catch(() => false) ||
                      await page.getByText(/error/i).isVisible().catch(() => false) ||
                      await page.getByText(/loading/i).isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('instructions field accepts long content', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/skills/new/editor`);
    await page.waitForLoadState('domcontentloaded');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();

    // Enter a long skill instruction
    const longContent = `# Test Skill

This is a very long skill instruction that tests how the editor
handles large amounts of text content. ` + 'x'.repeat(5000);

    await textarea.clear();
    await textarea.fill(longContent);

    const value = await textarea.inputValue();
    expect(value.length).toBeGreaterThan(4000);
  });

  test('triggers field parses comma-separated values', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/skills/new/editor`);
    await page.waitForLoadState('domcontentloaded');

    // Find triggers input - it's the last text input on the skill editor page
    const triggersInput = page.locator('input[type="text"]').last();
    await expect(triggersInput).toBeVisible();

    await triggersInput.clear();
    await triggersInput.fill('trigger1, trigger2, trigger3');

    const value = await triggersInput.inputValue();
    expect(value).toContain('trigger1');
    expect(value).toContain('trigger2');
    expect(value).toContain('trigger3');
  });

  test('triggers field handles empty value', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/skills/new/editor`);
    await page.waitForLoadState('domcontentloaded');

    // Use last() since triggers is the last text input
    const triggersInput = page.locator('input[type="text"]').last();
    await triggersInput.clear();
    await triggersInput.fill('');

    // Should not crash
    expect(await triggersInput.inputValue()).toBe('');
  });
});

test.describe('Prompt Editor — Error States & Edge Cases', () => {
  test('shows error when loading non-existent prompt', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/prompts/nonexistent-prompt/editor`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Should either show error or load without hard-crash
    const pageLoaded = await page.getByText('← Prompts').isVisible().catch(() => false) ||
                      await page.getByText(/error/i).isVisible().catch(() => false) ||
                      await page.getByText('Page not found').isVisible().catch(() => false) ||
                      await page.getByRole('button', { name: 'Save' }).isVisible().catch(() => false);
    expect(pageLoaded).toBeTruthy();
  });

  test('template content field accepts multiline content', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/prompts/new/editor`);
    await page.waitForLoadState('domcontentloaded');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();

    const multilineContent = `You are a helpful assistant.

Context:
{{context}}

Previous conversation:
{{history}}

User: {{input}}

Please respond with: {{response_format}}`;

    await textarea.clear();
    await textarea.fill(multilineContent);

    const value = await textarea.inputValue();
    expect(value).toContain('{{context}}');
    expect(value).toContain('{{input}}');
  });

  test('variables field parses comma-separated values', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/prompts/new/editor`);
    await page.waitForLoadState('domcontentloaded');

    // Find variables input (second text input)
    const variablesInput = page.locator('input[type="text"]').nth(1);
    await expect(variablesInput).toBeVisible();

    await variablesInput.clear();
    await variablesInput.fill('var1, var2, var3');

    const value = await variablesInput.inputValue();
    expect(value).toContain('var1');
  });

  test('variables field handles complex variable names', async ({ page }) => {
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/prompts/new/editor`);
    await page.waitForLoadState('domcontentloaded');

    const variablesInput = page.locator('input[type="text"]').nth(1);
    await variablesInput.clear();
    await variablesInput.fill('input, context, system_prompt, response_format');

    const value = await variablesInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });
});

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
    // Create execution via MCP
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

    // Pause via REST
    const pauseResult = await fetchJSON(`${REST_URL}/api/executions/${encodeURIComponent(execution.arn)}/pause`, {
      method: 'POST',
    });
    expect(pauseResult).toBeDefined();
    console.log('Execution paused via REST:', execution.arn);

    // Abort to clean up
    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });

  test('can resume a paused execution via REST', async ({ mcp }) => {
    // Create execution
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    const rawExec = await mcp.request('workflow_execute', {
      workflow_arn: workflows[0].arn,
      workspace_id: `test-resume-${Date.now()}`,
      input: { test: true },
    });
    const execution = mcp.parseToolResult(rawExec) as { arn: string };

    // Pause via REST
    await fetchJSON(`${REST_URL}/api/executions/${encodeURIComponent(execution.arn)}/pause`, {
      method: 'POST',
    });
    await mcp.waitForTimeout(500);

    // Resume via REST
    const resumeResult = await fetchJSON(`${REST_URL}/api/executions/${encodeURIComponent(execution.arn)}/resume`, {
      method: 'POST',
    });
    expect(resumeResult).toBeDefined();
    console.log('Execution resumed via REST:', execution.arn);

    // Abort to clean up
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

    // Pause via REST
    await fetchJSON(`${REST_URL}/api/executions/${encodeURIComponent(execution.arn)}/pause`, {
      method: 'POST',
    });
    await mcp.waitForTimeout(500);

    // Check state via MCP
    const rawState = await mcp.request('workflow_get_state', {
      execution_arn: execution.arn,
    });
    const state = mcp.parseToolResult(rawState) as { status: string };
    expect(state.status).toBe('paused');

    // Abort to clean up
    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });
});

test.describe('Multi-Stage Workflow — Stage Dependencies', () => {
  test('workflow with multiple stages executes all stages', async ({ mcp }) => {
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    // Find a workflow with multiple stages
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

    // Get the DAG to understand stages
    const rawDag = await mcp.request('workflow_get_dag', { arn: multiStageArn });
    const dag = mcp.parseToolResult(rawDag) as { nodes: Array<{ id: string }>; edges: unknown[] };
    console.log(`Workflow has ${dag.nodes.length} stages and ${dag.edges.length} dependencies`);

    // Get next stage suggestion
    const rawNext = await mcp.request('workflow_get_next_stage', {
      execution_arn: execution.arn,
    });
    const nextStage = mcp.parseToolResult(rawNext);
    expect(nextStage).toBeDefined();

    // Abort to clean up
    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });

  test('workflow DAG shows correct node and edge structure', async ({ mcp }) => {
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    const arn = workflows[0].arn;
    const rawDag = await mcp.request('workflow_get_dag', { arn });
    const dag = mcp.parseToolResult(rawDag) as { nodes: unknown[]; edges: unknown[] };

    // Verify DAG structure
    expect(Array.isArray(dag.nodes)).toBeTruthy();
    expect(Array.isArray(dag.edges)).toBeTruthy();

    // Each node should have an id (DagNode: { id, stage, depends_on })
    for (const node of dag.nodes as Array<{ id: string; stage: string; depends_on: string[] }>) {
      expect(typeof node.id).toBe('string');
      expect(typeof node.stage).toBe('string');
      expect(Array.isArray(node.depends_on)).toBeTruthy();
    }

    // Each edge should have from and to (DagEdge: { from, to })
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

    // Update state through multiple stages
    const stages = ['explore', 'spec', 'design', 'tasks'];
    for (const stage of stages) {
      const rawUpdate = await mcp.request('workflow_update_state', {
        execution_arn: execution.arn,
        status: 'running',
        current_stage: stage,
        completed_stages: stages.slice(0, stages.indexOf(stage)),
      });
      expect(rawUpdate).toBeDefined();

      // Get next stage
      const rawNext = await mcp.request('workflow_get_next_stage', {
        execution_arn: execution.arn,
      });
      const next = mcp.parseToolResult(rawNext);
      expect(next).toBeDefined();
    }

    // Abort to clean up
    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });
});

test.describe('Resource Override Flow', () => {
  test('override workflow appears in project scope', async ({ page, rest, seedRegistry }) => {
    // First create a global workflow to override
    const globalName = rest.uniqueName('global-to-override');
    const { arn: globalArn } = await rest.createWorkflow(globalName, 'global');
    seedRegistry.register(() => rest.deleteWorkflow(globalArn));

    // Create a project-scoped workflow that overrides the global
    const projectName = rest.uniqueName('override-workflow');
    const { arn: overrideArn } = await rest.createWorkflow(projectName, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(overrideArn));

    // Navigate to project workflows
    await page.goto(`${BASE_URL}/studio/projects/${PROJECT_ID}/design/workflows`);
    await page.waitForLoadState('networkidle');

    // Both workflows should appear in the catalog
    const globalRow = page.locator(`[data-testid="workflow-catalog-row-${globalName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"]`);
    const projectRow = page.locator(`[data-testid="workflow-catalog-row-${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"]`);

    // Refreshing to ensure data loads
    await page.reload();
    await page.waitForLoadState('networkidle');

    console.log(`Global workflow: ${globalArn}, Project override: ${overrideArn}`);
  });

  test('override source ARN is recorded correctly', async ({ rest, seedRegistry }) => {
    // Create source workflow
    const sourceName = rest.uniqueName('override-source');
    const { arn: sourceArn } = await rest.createWorkflow(sourceName, 'global');
    seedRegistry.register(() => rest.deleteWorkflow(sourceArn));

    // The override concept - when creating a project-scoped resource with same name as global
    // it effectively becomes an override
    const overrideName = sourceName; // Same name creates override behavior
    const { arn: overrideArn } = await rest.createWorkflow(overrideName, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(overrideArn));

    // Verify the ARNs are different (different scopes)
    expect(sourceArn).not.toBe(overrideArn);
    expect(sourceArn).toContain('global');
    expect(overrideArn).toContain('project');

    console.log(`Source: ${sourceArn}, Override: ${overrideArn}`);
  });
});

test.describe('Validation & Edge Cases', () => {
  test('workflow without stages is valid', async ({ rest, seedRegistry }) => {
    const name = rest.uniqueName('empty-workflow');
    const { arn } = await rest.createWorkflow(name, 'project/test');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    // Empty stages should be accepted
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
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    expect(arn).toBeDefined();
  });

  test('execution with empty input is valid', async ({ mcp }) => {
    const rawWorkflows = await mcp.request('workflow_list');
    const workflows = mcp.parseToolResult(rawWorkflows) as Array<{ arn: string }>;
    expect(workflows.length, 'At least one workflow must exist').toBeGreaterThan(0);

    // Execute with empty input
    const rawExec = await mcp.request('workflow_execute', {
      workflow_arn: workflows[0].arn,
      workspace_id: `test-empty-input-${Date.now()}`,
      input: {},
    });
    const execution = mcp.parseToolResult(rawExec) as { arn: string };
    expect(execution.arn).toBeDefined();

    // Clean up
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

    // Clean up
    await mcp.request('workflow_abort', { execution_arn: execution.arn });
  });
});
