import { mkdirSync } from 'fs';
import { join } from 'path';
import { test, expect } from '../helpers/e2e-fixtures';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const ARTIFACT_DIR = '/home/rubentxu/Proyectos/agentesIA/agents-workflows/tests/e2e/functional-audit';
const PROJECT_ID = 'test';

mkdirSync(ARTIFACT_DIR, { recursive: true });

async function goto(page: any, path: string) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('domcontentloaded');
}

async function shot(page: any, name: string) {
  await page.screenshot({ path: join(ARTIFACT_DIR, name), fullPage: true });
}

async function createExecutionWithData(page: any, mcp: any, rest: any, seedRegistry: any) {
  const workflow = await rest.createWorkflow(`audit-exec-${Date.now()}`);
  seedRegistry.register(() => rest.deleteWorkflow(workflow.arn));

  const rawExec = await mcp.request('workflow_execute', {
    workflow_arn: workflow.arn,
    workspace_id: `audit-workspace-${Date.now()}`,
    input: { source: 'functional-audit' },
  });
  const exec = mcp.parseToolResult(rawExec) as { arn: string };

  await mcp.request('insights_log', {
    execution_arn: exec.arn,
    insight_type: 'stage_completed',
    data: JSON.stringify({ stage: 'explore', tokens: 120 }),
    stage_id: 'explore',
  });

  await mcp.request('artifact_create', {
    execution_arn: exec.arn,
    name: `audit-${Date.now()}.md`,
    content: '# Audit artifact',
    content_type: 'text/markdown',
  });

  return exec.arn;
}

test.describe('Functional audit captures', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('capture design surfaces', async ({ page, rest, seedRegistry }) => {
    const workflow = await rest.createWorkflow(`audit-workflow-${Date.now()}`);
    const agent = await rest.createAgent(`audit-agent-${Date.now()}`);
    const skill = await rest.createSkill(`audit-skill-${Date.now()}`);
    const prompt = await rest.createPrompt(`audit-prompt-${Date.now()}`);
    seedRegistry.register(() => rest.deleteWorkflow(workflow.arn));
    seedRegistry.register(() => rest.deleteAgent(agent.arn));
    seedRegistry.register(() => rest.deleteSkill(skill.arn));
    seedRegistry.register(() => rest.deletePrompt(prompt.arn));

    await goto(page, `/studio/projects/${PROJECT_ID}/design/workflows`);
    await expect(page.getByTestId('workflow-catalog-page')).toBeVisible();
    await shot(page, '01-workflows-catalog.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/design/agents`);
    await shot(page, '02-agents-catalog.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/design/skills`);
    await shot(page, '03-skills-catalog.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/design/prompts`);
    await shot(page, '04-prompts-catalog.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/design/tools`);
    await shot(page, '05-tools-catalog.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/design/templates`);
    await shot(page, '06-templates-catalog.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/design/workflows/${encodeURIComponent(workflow.arn)}/editor`);
    await shot(page, '07-workflow-editor.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/design/agents/new/editor`);
    await shot(page, '08-agent-editor.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/design/skills/new/editor`);
    await shot(page, '09-skill-editor.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/design/prompts/new/editor`);
    await shot(page, '10-prompt-editor.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/design/tools/new/editor`);
    await shot(page, '11-tool-editor.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/design/templates/new/editor`);
    await shot(page, '12-template-editor.png');
  });

  test('capture observe surfaces', async ({ page, mcp, rest, seedRegistry }) => {
    const executionArn = await createExecutionWithData(page, mcp, rest, seedRegistry);

    await goto(page, `/studio/projects/${PROJECT_ID}/observe/agent-executions`);
    await shot(page, '13-agent-executions.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/observe/agent-executions/${encodeURIComponent(executionArn)}`);
    await shot(page, '14-execution-detail.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/observe/insights`);
    await shot(page, '15-insights.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/observe/artifacts`);
    await shot(page, '16-artifacts.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/observe/metrics`);
    await shot(page, '17-metrics.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/observe/alerts`);
    await shot(page, '18-alerts.png');
  });

  test('capture registry and admin surfaces', async ({ page, rest, seedRegistry }) => {
    const workflow = await rest.createWorkflow(`audit-registry-wf-${Date.now()}`);
    const agent = await rest.createAgent(`audit-registry-agent-${Date.now()}`);
    const skill = await rest.createSkill(`audit-registry-skill-${Date.now()}`);
    const prompt = await rest.createPrompt(`audit-registry-prompt-${Date.now()}`);
    const workspace = await rest.createWorkspace(`audit-workspace-${Date.now()}`);
    seedRegistry.register(() => rest.deleteWorkflow(workflow.arn));
    seedRegistry.register(() => rest.deleteAgent(agent.arn));
    seedRegistry.register(() => rest.deleteSkill(skill.arn));
    seedRegistry.register(() => rest.deletePrompt(prompt.arn));
    seedRegistry.register(() => rest.deleteWorkspace(workspace.id));

    await goto(page, `/studio/projects/${PROJECT_ID}/registry/resources`);
    await expect(page.getByRole('heading', { name: /registry resources/i })).toBeVisible();
    await expect(page.getByText(/audit-registry-wf-|audit-registry-agent-|audit-registry-skill-|audit-registry-prompt-/i).first()).toBeVisible({ timeout: 10000 });
    await shot(page, '19-registry-resources.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/registry/overrides`);
    await expect(page.getByRole('heading', { name: /registry overrides/i })).toBeVisible();
    await expect(page.getByText(/approximates overrides by showing non-global resources/i)).toBeVisible();
    await shot(page, '20-registry-overrides.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/registry/dependencies`);
    await expect(page.getByRole('heading', { name: /dependencies/i })).toBeVisible();
    await expect(page.getByText(/preview graph using mock relationship data/i)).toBeVisible();
    await page.waitForTimeout(700);
    await shot(page, '21-registry-dependencies.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/admin/workspaces`);
    await shot(page, '22-admin-workspaces.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/admin/settings`);
    await shot(page, '23-admin-settings.png');

    await goto(page, `/studio/projects/${PROJECT_ID}/admin/integrations`);
    await shot(page, '24-admin-integrations.png');
  });
});
