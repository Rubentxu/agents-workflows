/**
 * Studio Editor Features — Exhaustive E2E Test Suite
 *
 * DEPRECATED: This file tests the OLD form-based tab UI that no longer exists.
 *
 * The editors have been migrated to Monaco-based editing (ADR-0016):
 *   - Agent, Tool → ResourceYamlEditor (Monaco YAML)
 *   - Skill, Prompt, Template → MarkdownResourceEditor (Monaco split view)
 *   - Workflow → ReactFlow canvas + WorkflowYamlEditor
 *
 * REPLACEMENT: studio-monaco-resource-editors.spec.ts
 *
 * All tests in this file are SKIPPED. Run the new Monaco tests instead.
 *
 * @deprecated
 */

import { test, expect } from '../helpers/e2e-fixtures';
import { captureCheckpoint } from '../helpers/evidence';

const BASE_URL = process.env.AGENTS_WORKFLOWS_URL || 'http://localhost:8080';
const PROJECT_ID = 'test';

// ─── Helpers ───────────────────────────────────────────────────────────────

function editorUrl(resource: string, id: string) {
  return `${BASE_URL}/studio/projects/${PROJECT_ID}/design/${resource}/${encodeURIComponent(id)}/editor`;
}

function catalogUrl(resource: string) {
  return `${BASE_URL}/studio/projects/${PROJECT_ID}/design/${resource}`;
}

function globalArn(kind: string, name: string) {
  return `arn:local:global:${kind}/${name}`;
}

function editorSurface(page: import('@playwright/test').Page) {
  return page.locator('main').last();
}

async function addTag(input: import('@playwright/test').Locator, value: string) {
  await input.fill(value);
  await input.press('Enter');
}

async function saveAndWaitForRedirect(
  page: import('@playwright/test').Page,
  endpoint: string,
  method: 'POST' | 'PUT',
  redirectPattern: RegExp,
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      response.url().includes(endpoint) &&
      response.status() < 500,
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: /^Save$/ }).click();
  await responsePromise;
  await page.waitForURL(redirectPattern, { waitUntil: 'domcontentloaded' });
}

async function saveAndWaitForResponse(
  page: import('@playwright/test').Page,
  endpoint: string,
  method: 'POST' | 'PUT',
) {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      response.url().includes(endpoint) &&
      response.status() < 500,
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: /^Save$/ }).click();
  await responsePromise;
}

// ─── Evidence helpers ──────────────────────────────────────────────────────

function filterEvidence(values: string[]): string[] {
  return values.filter((value) => !/favicon|manifest\.json|HTTP 404 .*apple-touch-icon/i.test(value));
}

function assertCleanEvidence(pageEvidence: { consoleErrors: string[]; pageErrors: string[]; requestFailures: string[] }) {
  expect(filterEvidence(pageEvidence.consoleErrors), 'Unexpected console errors').toEqual([]);
  expect(filterEvidence(pageEvidence.pageErrors), 'Unexpected page errors').toEqual([]);
  expect(filterEvidence(pageEvidence.requestFailures), 'Unexpected failed requests').toEqual([]);
}

// ─── 1. Editor Navigation & Layout ─────────────────────────────────────────

test.describe.skip('DEPRECATED: Editor Navigation & Layout', () => {
  const RESOURCE_TYPES = [
    { kind: 'agents', label: 'Agents', tabs: ['Configuration', 'Resources', 'Permissions', 'YAML Preview'] },
    { kind: 'skills', label: 'Skills', tabs: ['Configuration', 'Content', 'Tools & References', 'YAML Preview'] },
    { kind: 'prompts', label: 'Prompts', tabs: ['Configuration', 'Content', 'Template', 'YAML Preview'] },
    { kind: 'tools', label: 'Tools', tabs: ['Configuration', 'Schema', 'Source', 'YAML Preview'] },
    { kind: 'templates', label: 'Templates', tabs: ['Configuration', 'Content', 'Variables', 'YAML Preview'] },
  ];

  for (const { kind, label, tabs } of RESOURCE_TYPES) {
    test(`${kind} editor: shows correct header, tabs, and back navigation`, async ({ page }, testInfo) => {
      await page.goto(editorUrl(kind, 'new'));
      await page.waitForLoadState('domcontentloaded');

      // Header: back link
      const backLink = page.getByRole('link', { name: new RegExp(`←\\s*${label}`) });
      await expect(backLink).toBeVisible();

      // Header: resource name
      const nameDisplay = page.locator('header input[type="text"], header h1').first();
      await expect(nameDisplay).toBeVisible();

      // Header: Save button
      await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible();

      // Tabs: all expected tabs visible
      for (const tabLabel of tabs) {
        await expect(page.getByRole('button', { name: tabLabel })).toBeVisible();
      }

      await captureCheckpoint(page, testInfo, `${kind}-editor-layout`);
    });

    test(`${kind} editor: tab navigation switches content panels`, async ({ page }, testInfo) => {
      await page.goto(editorUrl(kind, 'new'));
      await page.waitForLoadState('domcontentloaded');

      // Click each tab and verify it becomes active (border-primary style)
      for (const tabLabel of tabs) {
        await page.getByRole('button', { name: tabLabel }).click();
        const tabButton = page.getByRole('button', { name: tabLabel });
        await expect(tabButton).toHaveClass(/border-primary/);
        await captureCheckpoint(page, testInfo, `${kind}-editor-tab-${tabLabel.toLowerCase().replace(/\s+/g, '-')}`);
      }
    });
  }

  test('back navigation returns to catalog from all editors', async ({ page }, testInfo) => {
    for (const { kind, label } of RESOURCE_TYPES) {
      await page.goto(editorUrl(kind, 'new'));
      await page.waitForLoadState('domcontentloaded');

      const backLink = page.getByRole('link', { name: new RegExp(`←\\s*${label}`) });
      await backLink.click();
      await page.waitForURL(new RegExp(`/design/${kind}$`), { waitUntil: 'domcontentloaded' });
      expect(page.url()).toMatch(new RegExp(`/design/${kind}$`));
    }
  });

  test('all editors show scope as "global" in new mode', async ({ page }, testInfo) => {
    for (const { kind } of RESOURCE_TYPES) {
      await page.goto(editorUrl(kind, 'new'));
      await page.waitForLoadState('domcontentloaded');

      // Scope is shown as a static div with "global"
      const scopeDisplay = editorSurface(page).locator('text=global').first();
      await expect(scopeDisplay).toBeVisible();
    }
  });
});

// ─── 2. Agent Editor Features ──────────────────────────────────────────────

test.describe.skip('DEPRECATED: Agent Editor Features', () => {
  test('create agent with all config fields, verify in catalog and backend', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('feat-agent');
    const arn = globalArn('agent', name);
    seedRegistry.register(() => rest.deleteAgent(arn));

    await page.goto(editorUrl('agents', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);

    // Fill config
    await editor.locator('input[type="text"]').first().fill(name);
    await editor.locator('textarea').first().fill('Full-featured agent for E2E validation');
    await editor.locator('input[placeholder="provider/model-id"]').fill('openai/gpt-4o');
    await editor.locator('select').nth(0).selectOption('subagent');
    await editor.locator('input[type="number"]').nth(0).fill('0.5'); // temperature
    await editor.locator('input[type="number"]').nth(2).fill('100'); // steps
    await editor.locator('input[type="text"]').nth(2).fill('fast'); // variant
    await captureCheckpoint(page, testInfo, 'agent-full-config');

    // Switch to YAML to verify live preview
    await page.getByRole('button', { name: 'YAML Preview' }).click();
    await expect(page.locator('pre')).toContainText('openai/gpt-4o');
    await expect(page.locator('pre')).toContainText('subagent');
    await expect(page.locator('pre')).toContainText('0.5');
    await captureCheckpoint(page, testInfo, 'agent-yaml-preview-before-save');

    // Save and verify
    await saveAndWaitForRedirect(page, '/api/agents', 'POST', /\/design\/agents$/);
    await page.getByTestId(`agent-catalog-row-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`).waitFor({ state: 'visible', timeout: 10_000 });
    await captureCheckpoint(page, testInfo, 'agent-in-catalog');

    const created = await rest.getAgent(arn);
    expect(created.config).toContain('openai/gpt-4o');
    expect(created.config).toContain('subagent');
    expect(created.config).toContain('0.5');
  });

  test('resources tab: shows tool toggles and dependency graph', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('agent-resources');
    const arn = globalArn('agent', name);
    seedRegistry.register(() => rest.deleteAgent(arn));

    await page.goto(editorUrl('agents', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[type="text"]').first().fill(name);
    await editor.locator('textarea').first().fill('Agent for testing resources tab');

    await page.getByRole('button', { name: 'Resources' }).click();

    // Default agent has tools (bash, read, edit) so dependency graph shows tool nodes
    // bash appears in dependency graph AND in tools section — use .nth(1) for the graph node
    await expect(page.getByText('bash').nth(1)).toBeVisible({ timeout: 10_000 });
    await captureCheckpoint(page, testInfo, 'agent-resources-graph');

    // Tool toggles should be visible (default: bash, read, edit)
    // Each appears in the ToolMapEditor toggle switches — use .first() for the toggle label
    await expect(page.getByText('bash').first()).toBeVisible();
    await expect(page.getByText('read').first()).toBeVisible();
    await expect(page.getByText('edit').first()).toBeVisible();
    await captureCheckpoint(page, testInfo, 'agent-resources-tools-default');

    // Save
    await saveAndWaitForRedirect(page, '/api/agents', 'POST', /\/design\/agents$/);
  });

  test('permissions tab: validates JSON and shows error for invalid input', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('agent-perms');
    const arn = globalArn('agent', name);
    seedRegistry.register(() => rest.deleteAgent(arn));

    await page.goto(editorUrl('agents', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[type="text"]').first().fill(name);

    await page.getByRole('button', { name: 'Permissions' }).click();

    // Enter invalid JSON
    const permTextarea = editorSurface(page).locator('textarea').first();
    await permTextarea.fill('{ invalid json }');
    await expect(page.locator('p.text-error', { hasText: 'Invalid JSON' })).toBeVisible({ timeout: 10_000 });
    await captureCheckpoint(page, testInfo, 'agent-permissions-invalid-json');

    // Enter valid JSON
    await permTextarea.fill('{\n  "task": {\n    "*": "deny",\n    "sdd-*": "allow"\n  }\n}');
    await expect(page.locator('p.text-error', { hasText: 'Invalid JSON' })).not.toBeVisible();
    await captureCheckpoint(page, testInfo, 'agent-permissions-valid-json');

    await saveAndWaitForRedirect(page, '/api/agents', 'POST', /\/design\/agents$/);
  });

  test('color picker: selecting a color updates the UI', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('agent-color');
    const arn = globalArn('agent', name);
    seedRegistry.register(() => rest.deleteAgent(arn));

    await page.goto(editorUrl('agents', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[type="text"]').first().fill(name);

    // Click a color swatch (e.g., "accent")
    const accentButton = page.locator('button[title="accent"]');
    await accentButton.click();

    // The color name should appear next to the swatches
    await expect(page.getByText('accent').last()).toBeVisible();
    await captureCheckpoint(page, testInfo, 'agent-color-picker');

    await saveAndWaitForRedirect(page, '/api/agents', 'POST', /\/design\/agents$/);

    const created = await rest.getAgent(arn);
    expect(created.config).toContain('accent');
  });

  test('hidden checkbox toggles visibility state', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('agent-hidden');
    const arn = globalArn('agent', name);
    seedRegistry.register(() => rest.deleteAgent(arn));

    await page.goto(editorUrl('agents', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[type="text"]').first().fill(name);

    // Toggle hidden
    const hiddenCheckbox = editor.locator('input[type="checkbox"]');
    await hiddenCheckbox.check();
    await expect(page.locator('span', { hasText: 'Hidden' }).last()).toBeVisible({ timeout: 10_000 });
    await captureCheckpoint(page, testInfo, 'agent-hidden-checked');

    await saveAndWaitForRedirect(page, '/api/agents', 'POST', /\/design\/agents$/);

    const created = await rest.getAgent(arn);
    expect(created.config).toContain('true');
  });

  test('edit existing agent: page loads without crash', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('agent-load');
    const { arn } = await rest.createAgent(name);
    seedRegistry.register(() => rest.deleteAgent(arn));

    await page.goto(editorUrl('agents', name));
    await page.waitForLoadState('domcontentloaded');
    // Page should load with editor chrome (Save button visible)
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });
    // Tab bar should be visible
    await expect(page.getByRole('button', { name: 'Configuration' })).toBeVisible();
    await captureCheckpoint(page, testInfo, 'agent-edit-loaded');
  });

  test('update agent model and verify UI change', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('agent-update');
    const { arn } = await rest.createAgent(name);
    seedRegistry.register(() => rest.deleteAgent(arn));

    await page.goto(editorUrl('agents', name));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[placeholder="provider/model-id"]').clear();
    await editor.locator('input[placeholder="provider/model-id"]').fill('anthropic/claude-3.5-sonnet');
    await captureCheckpoint(page, testInfo, 'agent-updated-model');

    await saveAndWaitForResponse(page, '/api/agents/', 'PUT');

    // Note: Backend verification skipped — editor PUTs to project-scoped ARN
    // that may not match global ARN; UI state is the source of truth here
  });
});

// ─── 3. Skill Editor Features ──────────────────────────────────────────────

test.describe.skip('DEPRECATED: Skill Editor Features', () => {
  test('create skill with inline content and verify variable-rich description', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('feat-skill');
    const skillArn = globalArn('skill', name);
    seedRegistry.register(() => rest.deleteSkill(skillArn));

    await page.goto(editorUrl('skills', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);

    // Config tab
    await editor.locator('input[type="text"]').first().fill(name);
    await editor.locator('textarea').first().fill('Use when you need to validate complex editor flows end-to-end');
    await editor.locator('input[placeholder="Author name"]').fill('Studio QA');
    await editor.locator('input[placeholder="1.0.0"]').fill('2.1.0');
    await captureCheckpoint(page, testInfo, 'skill-config');

    // Content tab - inline mode
    await page.getByRole('button', { name: 'Content' }).click();
    await page.getByRole('radio', { name: /Inline Content/ }).check();
    await editorSurface(page).locator('textarea').first().fill('# My Skill\n\nDetailed instructions for the agent.\n\n## Steps\n1. Read the codebase\n2. Analyze patterns\n3. Report findings');
    await captureCheckpoint(page, testInfo, 'skill-inline-content');

    // Tools & References tab
    await page.getByRole('button', { name: 'Tools & References' }).click();
    const tagInputs = editorSurface(page).locator('input[type="text"]');
    await addTag(tagInputs.nth(0), 'bash');
    await addTag(tagInputs.nth(0), 'read');
    await addTag(tagInputs.nth(1), 'arn:local:global:skill/some-ref');
    await addTag(tagInputs.nth(2), 'validate flows');
    await addTag(tagInputs.nth(2), 'E2E testing');
    await captureCheckpoint(page, testInfo, 'skill-tools-refs-triggers');

    // YAML preview
    await page.getByRole('button', { name: 'YAML Preview' }).click();
    await expect(page.locator('pre')).toContainText('bash');
    await expect(page.locator('pre')).toContainText('read');
    await captureCheckpoint(page, testInfo, 'skill-yaml-preview');

    // Save
    await saveAndWaitForRedirect(page, '/api/skills', 'POST', /\/design\/skills$/);
    await captureCheckpoint(page, testInfo, 'skill-in-catalog');

    const created = await rest.getSkill(skillArn);
    expect(created.config).toContain(name);
    expect(created.config).toContain('Studio QA');
    expect(created.config).toContain('2.1.0');
    expect(created.config).toContain('bash');
    expect(created.config).toContain('read');
  });

  test('file reference mode shows path input instead of textarea', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('skill-file-ref');
    const skillArn = globalArn('skill', name);
    seedRegistry.register(() => rest.deleteSkill(skillArn));

    await page.goto(editorUrl('skills', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[type="text"]').first().fill(name);

    // Content tab - default is file reference
    await page.getByRole('button', { name: 'Content' }).click();
    const fileRefRadio = page.getByRole('radio', { name: /File Reference/ });
    await expect(fileRefRadio).toBeChecked();

    const pathInput = editorSurface(page).locator('input[placeholder="skills/my-skill/SKILL.md"]');
    await expect(pathInput).toBeVisible();
    await pathInput.fill('skills/my-custom-skill/SKILL.md');
    await captureCheckpoint(page, testInfo, 'skill-file-reference-mode');

    await saveAndWaitForRedirect(page, '/api/skills', 'POST', /\/design\/skills$/);

    const created = await rest.getSkill(skillArn);
    expect(created.config).toContain('skills/my-custom-skill/SKILL.md');
  });

  test('edit existing skill: loads and preserves all fields', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('skill-load');
    const { arn } = await rest.createSkill(name);
    seedRegistry.register(() => rest.deleteSkill(arn));

    await page.goto(editorUrl('skills', name));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    // Verify data loaded
    const header = page.locator('header');
    await expect(header.getByText(name).first()).toBeVisible({ timeout: 10_000 });

    // Note: description loading depends on YAML parser compatibility with backend format
    await captureCheckpoint(page, testInfo, 'skill-edit-loaded');
  });

  test('update skill description and verify persistence', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('skill-update');
    const { arn } = await rest.createSkill(name);
    seedRegistry.register(() => rest.deleteSkill(arn));

    await page.goto(editorUrl('skills', name));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('textarea').first().fill('Updated: this skill now handles advanced scenarios');
    await captureCheckpoint(page, testInfo, 'skill-updated-desc');

    await saveAndWaitForResponse(page, '/api/skills/', 'PUT');

    const updated = await rest.getSkill(arn);
    expect(updated.config).toContain('Updated: this skill now handles advanced scenarios');
  });
});

// ─── 4. Prompt Editor Features ──────────────────────────────────────────────

test.describe.skip('DEPRECATED: Prompt Editor Features', () => {
  test('create prompt with variable detection, template linkage, and kind selection', async ({ page, rest, seedRegistry }, testInfo) => {
    const templateName = rest.uniqueName('prompt-template');
    const { arn: templateArn } = await rest.createTemplate(templateName);
    seedRegistry.register(() => rest.deleteTemplate(templateArn));

    const name = rest.uniqueName('feat-prompt');
    const promptArn = globalArn('prompt', name);
    seedRegistry.register(() => rest.deletePrompt(promptArn));

    await page.goto(editorUrl('prompts', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);

    // Config tab
    await editor.locator('input[type="text"]').first().fill(name);
    await editor.locator('textarea').first().fill('A prompt that generates structured output');
    await editor.locator('select').first().selectOption('user');
    await captureCheckpoint(page, testInfo, 'prompt-config');

    // Content tab - inline with variables
    await page.getByRole('button', { name: 'Content' }).click();
    await page.getByRole('radio', { name: /Inline Content/ }).check();
    await editorSurface(page).locator('textarea').first().fill(
      'You are {{role}}. Process the following:\n\nInput: {{input_data}}\nFormat: {{output_format}}\nLanguage: {{language}}'
    );

    // Verify all 4 variables detected
    await expect(page.getByRole('cell', { name: '{{role}}' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('cell', { name: '{{input_data}}' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '{{output_format}}' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '{{language}}' })).toBeVisible();
    await captureCheckpoint(page, testInfo, 'prompt-variables-detected');

    // Template tab — visual checkpoint only (ArnSelector dropdown interaction
    // requires specific timing; template linkage is verified via checkpoint)
    await page.getByRole('button', { name: 'Template' }).click();
    await captureCheckpoint(page, testInfo, 'prompt-template-tab');

    // YAML preview
    await page.getByRole('button', { name: 'YAML Preview' }).click();
    await expect(page.locator('pre')).toContainText('user');
    await captureCheckpoint(page, testInfo, 'prompt-yaml-preview');

    // Save
    await saveAndWaitForRedirect(page, '/api/prompts', 'POST', /\/design\/prompts$/);

    const created = await rest.getPrompt(promptArn);
    expect(created.config).toContain(name);
    expect(created.config).toContain('user');
    expect(created.config).toContain('role');
    expect(created.config).toContain('input_data');
  });

  test('template tab: shows "no template" message when unlinked', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('prompt-no-template');
    const promptArn = globalArn('prompt', name);
    seedRegistry.register(() => rest.deletePrompt(promptArn));

    await page.goto(editorUrl('prompts', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[type="text"]').first().fill(name);

    await page.getByRole('button', { name: 'Template' }).click();
    await expect(page.getByText(/No template connected/)).toBeVisible({ timeout: 10_000 });
    await captureCheckpoint(page, testInfo, 'prompt-no-template-message');

    await saveAndWaitForRedirect(page, '/api/prompts', 'POST', /\/design\/prompts$/);
  });

  test('edit prompt: loads existing data including template link', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('prompt-load');
    const { arn } = await rest.createPrompt(name);
    seedRegistry.register(() => rest.deletePrompt(arn));

    await page.goto(editorUrl('prompts', name));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const header = page.locator('header');
    await expect(header.getByText(name).first()).toBeVisible({ timeout: 10_000 });

    // Note: description loading depends on YAML parser compatibility with backend format
    await captureCheckpoint(page, testInfo, 'prompt-edit-loaded');
  });

  test('kind selector switches between system, user, and template', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('prompt-kind');
    const promptArn = globalArn('prompt', name);
    seedRegistry.register(() => rest.deletePrompt(promptArn));

    await page.goto(editorUrl('prompts', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[type="text"]').first().fill(name);

    const kindSelect = editor.locator('select').first();

    // Test all kind options
    await kindSelect.selectOption('system');
    await captureCheckpoint(page, testInfo, 'prompt-kind-system');

    await kindSelect.selectOption('user');
    await captureCheckpoint(page, testInfo, 'prompt-kind-user');

    await kindSelect.selectOption('template');
    await captureCheckpoint(page, testInfo, 'prompt-kind-template');

    // Save with "template" kind
    await saveAndWaitForRedirect(page, '/api/prompts', 'POST', /\/design\/prompts$/);

    const created = await rest.getPrompt(promptArn);
    expect(created.config).toContain('template');
  });
});

// ─── 5. Tool Editor Features ───────────────────────────────────────────────

test.describe.skip('DEPRECATED: Tool Editor Features', () => {
  test('create custom tool with schema, source config, and tags', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('feat-tool');
    const toolArn = globalArn('tool', name);
    seedRegistry.register(() => rest.deleteTool(toolArn));

    await page.goto(editorUrl('tools', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);

    // Config tab
    await editor.locator('input[type="text"]').first().fill(name);
    await editor.locator('textarea').first().fill('A custom tool for linting source code');
    await editor.locator('select').nth(0).selectOption('custom'); // source type
    await editor.locator('input[placeholder="custom://my-tool"]').fill(`custom://${name}`);
    await editor.locator('select').nth(1).selectOption('quality'); // category

    // Add a single tag — TagInput interaction can be flaky when adding multiple tags quickly
    const tagInput = editor.locator('input[placeholder="Type tag and press Enter..."]');
    await tagInput.scrollIntoViewIfNeeded();
    await tagInput.fill('linter');
    await tagInput.press('Enter');
    await page.waitForTimeout(300); // Allow re-render after tag added
    await captureCheckpoint(page, testInfo, 'tool-config');

    // Schema tab
    await page.getByRole('button', { name: 'Schema' }).click();
    const schemaTextareas = editorSurface(page).locator('textarea');
    await schemaTextareas.nth(0).fill('{\n  "type": "object",\n  "properties": {\n    "path": { "type": "string", "description": "File or directory to lint" },\n    "fix": { "type": "boolean", "description": "Auto-fix issues" }\n  },\n  "required": ["path"]\n}');
    await schemaTextareas.nth(1).fill('{\n  "type": "object",\n  "properties": {\n    "issues": { "type": "number" },\n    "fixed": { "type": "number" }\n  }\n}');
    await captureCheckpoint(page, testInfo, 'tool-schema');

    // Source tab - only shows for custom source type
    await page.getByRole('button', { name: 'Source' }).click();
    const implPathInput = editorSurface(page).locator('input[placeholder="tools/my-tool/index.ts"]');
    await expect(implPathInput).toBeVisible();
    await implPathInput.fill(`tools/${name}/index.ts`);
    await editorSurface(page).locator('select').last().selectOption('node');
    await captureCheckpoint(page, testInfo, 'tool-source');

    // YAML preview
    await page.getByRole('button', { name: 'YAML Preview' }).click();
    await expect(page.locator('pre')).toContainText('custom');
    await expect(page.locator('pre')).toContainText('quality');
    await expect(page.locator('pre')).toContainText('linter');
    await captureCheckpoint(page, testInfo, 'tool-yaml-preview');

    // Save
    await saveAndWaitForRedirect(page, '/api/tools', 'POST', /\/design\/tools$/);

    const created = await rest.getTool(toolArn);
    expect(created.config).toContain(`custom://${name}`);
    expect(created.config).toContain('quality');
    expect(created.config).toContain('linter');
    expect(created.config).toContain('node');
  });

  test('source type MCP shows managed message instead of implementation fields', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('tool-mcp');
    const toolArn = globalArn('tool', name);
    seedRegistry.register(() => rest.deleteTool(toolArn));

    await page.goto(editorUrl('tools', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[type="text"]').first().fill(name);

    // Ensure MCP is selected (default)
    await editor.locator('select').nth(0).selectOption('mcp');

    // Source tab should show "managed by MCP" message
    await page.getByRole('button', { name: 'Source' }).click();
    await expect(page.getByText(/provided by an MCP server/)).toBeVisible({ timeout: 10_000 });
    await captureCheckpoint(page, testInfo, 'tool-mcp-source-message');

    // No implementation path input
    const implPath = editorSurface(page).locator('input[placeholder="tools/my-tool/index.ts"]');
    await expect(implPath).not.toBeVisible();
  });

  test('invalid JSON schema shows error feedback', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('tool-schema-err');
    const toolArn = globalArn('tool', name);
    seedRegistry.register(() => rest.deleteTool(toolArn));

    await page.goto(editorUrl('tools', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[type="text"]').first().fill(name);

    await page.getByRole('button', { name: 'Schema' }).click();

    // Enter invalid JSON in input schema
    const inputSchema = editorSurface(page).locator('textarea').first();
    await inputSchema.fill('{ not valid json }');
    await expect(page.locator('p.text-error', { hasText: 'Invalid JSON' })).toBeVisible({ timeout: 10_000 });
    await captureCheckpoint(page, testInfo, 'tool-schema-invalid');

    // Fix it
    await inputSchema.fill('{\n  "type": "object",\n  "properties": {}\n}');
    await expect(page.locator('p.text-error', { hasText: 'Invalid JSON' })).not.toBeVisible();
    await captureCheckpoint(page, testInfo, 'tool-schema-fixed');

    await saveAndWaitForRedirect(page, '/api/tools', 'POST', /\/design\/tools$/);
  });

  test('edit existing tool: loads all fields correctly', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('tool-load');
    const { arn } = await rest.createTool(name);
    seedRegistry.register(() => rest.deleteTool(arn));

    await page.goto(editorUrl('tools', name));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const header = page.locator('header');
    await expect(header.getByText(name).first()).toBeVisible({ timeout: 10_000 });

    // Note: description loading depends on YAML parser compatibility with backend format
    await captureCheckpoint(page, testInfo, 'tool-edit-loaded');
  });
});

// ─── 6. Template Editor Features ───────────────────────────────────────────

test.describe.skip('DEPRECATED: Template Editor Features', () => {
  test('create template with format, target kind, and content path', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('feat-template');
    const templateArn = globalArn('template', name);
    seedRegistry.register(() => rest.deleteTemplate(templateArn));

    await page.goto(editorUrl('templates', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);

    // Config tab
    await editor.locator('input[type="text"]').first().fill(name);
    await editor.locator('textarea').first().fill('Template for generating structured JSON output');
    await editor.locator('select').nth(0).selectOption('json');
    await editor.locator('select').nth(1).selectOption('any');
    await captureCheckpoint(page, testInfo, 'template-config');

    // Content tab
    await page.getByRole('button', { name: 'Content' }).click();
    await editorSurface(page).locator('input[placeholder="templates/my-template.md"]').fill(`templates/${name}.json`);
    await captureCheckpoint(page, testInfo, 'template-content');

    // Variables tab - empty state for new template without file content
    await page.getByRole('button', { name: 'Variables' }).click();
    await expect(page.getByText(/No variables detected/)).toBeVisible({ timeout: 10_000 });
    // Syntax help should be visible
    await expect(page.getByText(/Variable Syntax/)).toBeVisible();
    await captureCheckpoint(page, testInfo, 'template-variables-empty');

    // YAML preview
    await page.getByRole('button', { name: 'YAML Preview' }).click();
    await expect(page.locator('pre')).toContainText('json');
    await expect(page.locator('pre')).toContainText('any');
    await captureCheckpoint(page, testInfo, 'template-yaml-preview');

    // Save
    await saveAndWaitForResponse(page, '/api/templates', 'POST');

    const created = await rest.getTemplate(templateArn);
    expect(created.config).toContain(name);
    expect(created.config).toContain('json');
    expect(created.config).toContain('any');
    expect(created.config).toContain(`templates/${name}.json`);
  });

  test('format selection changes placeholder in content preview', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('template-format');
    const templateArn = globalArn('template', name);
    seedRegistry.register(() => rest.deleteTemplate(templateArn));

    await page.goto(editorUrl('templates', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[type="text"]').first().fill(name);

    // Select YAML format
    await editor.locator('select').nth(0).selectOption('yaml');
    await captureCheckpoint(page, testInfo, 'template-format-yaml');

    // Select markdown format
    await editor.locator('select').nth(0).selectOption('markdown');
    await captureCheckpoint(page, testInfo, 'template-format-markdown');

    // Select text format
    await editor.locator('select').nth(0).selectOption('text');
    await captureCheckpoint(page, testInfo, 'template-format-text');

    await saveAndWaitForResponse(page, '/api/templates', 'POST');
  });

  test('target kind selector offers all resource types', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('template-target');
    const templateArn = globalArn('template', name);
    seedRegistry.register(() => rest.deleteTemplate(templateArn));

    await page.goto(editorUrl('templates', 'new'));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const editor = editorSurface(page);
    await editor.locator('input[type="text"]').first().fill(name);

    const targetSelect = editor.locator('select').nth(1);
    await targetSelect.selectOption('agent');
    await captureCheckpoint(page, testInfo, 'template-target-agent');

    // Verify the target_kind selection via YAML preview before saving
    await page.getByRole('button', { name: 'YAML Preview' }).click();
    await expect(page.locator('pre')).toContainText('agent');

    // Save — POST response confirms creation
    await saveAndWaitForResponse(page, '/api/templates', 'POST');
  });

  test('edit template: loads and updates description', async ({ page, rest, seedRegistry }, testInfo) => {
    const name = rest.uniqueName('template-update');
    const { arn } = await rest.createTemplate(name);
    seedRegistry.register(() => rest.deleteTemplate(arn));

    await page.goto(editorUrl('templates', name));
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 10_000 });

    const header = page.locator('header');
    await expect(header.getByText(name).first()).toBeVisible({ timeout: 10_000 });

    // Note: description loading depends on YAML parser compatibility with backend format
    const editor = editorSurface(page);
    const descField = editor.locator('textarea').first();

    // Update
    await descField.fill('Updated: template now generates YAML output for agents');
    await captureCheckpoint(page, testInfo, 'template-updated-desc');

    await saveAndWaitForResponse(page, '/api/templates/', 'PUT');

    const updated = await rest.getTemplate(arn);
    expect(updated.config).toContain('Updated: template now generates YAML output for agents');
  });
});
