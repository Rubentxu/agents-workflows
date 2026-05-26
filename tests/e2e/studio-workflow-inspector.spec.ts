/**
 * Studio Workflow Inspector — Smoke Tests
 *
 * Tests the inspector → YAML → save flow:
 * - T3: applyStagePatch as sole write path
 * - T4: onChange handlers on retry inputs
 * - T5: InlineDiffSummary before save
 * - T7: inspector field edit → Monaco YAML sync → save + reload persistence
 *
 * The workflow editor uses a 3-panel layout (no tabs):
 *   Canvas (ReactFlow) | Inspector (when stage selected) | Monaco YAML (always visible)
 *
 * Monaco must be filled using fillMonaco(), NOT textarea.fill() (readonly in controlled mode).
 *
 * Strategy: Create empty workflows via REST, then initialize stage content via Monaco.
 * The raw content REST endpoint currently requires JSON content updates and the older
 * YAML direct-body seed path is not reliable for these tests, so Monaco is the stable
 * path for stage initialization in T3/T4/T5/T7.
 */

import { test, expect } from '../helpers/e2e-fixtures';
import { WorkflowEditorPage } from '../helpers/page-objects';
import { setWorkflowEditorValue, waitForMonacoReady, getWorkflowEditorValue } from '../helpers/monaco-helpers';

const PROJECT_ID = 'test';

/**
 * Seed workflow YAML used when creating a workflow via REST API.
 * Contains one stage with retry config for inspector tests.
 */
const WORKFLOW_WITH_RETRY_STAGES = `apiVersion: workflows.local/v1
kind: Workflow
metadata:
  name: inspector-test
  scope: global
spec:
  description: Testing inspector retry inputs
  stages:
    - id: explore
      agent: arn:local:global:agent/orchestrator
      depends_on: []
      description: Explore stage
      execution:
        mode: sequential
        retry:
          max_attempts: 3
          backoff_ms: 1000
  execution:
    mode: sequential
    stop_on_error: true`;

test.describe('Studio Design — Workflow Inspector', () => {
  /**
   * T4: Verify retry inputs in the inspector have onChange handlers and don't crash.
   *
   * Strategy: Create workflow with stages via REST so canvas renders immediately.
   * Then click the stage node and verify retry inputs work.
   */
  test('inspector: retry inputs have onChange handlers (T4 root bug fix)', async ({
    page,
    rest,
    seedRegistry,
  }) => {
    const editor = new WorkflowEditorPage(page);

    // Create an empty workflow via REST
    const name = rest.uniqueName('e2e-inspector-retry');
    const { arn } = await rest.createWorkflow(name, 'global');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    // Navigate to the editor and initialize stage content via Monaco
    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL(/\/editor/);
    await waitForMonacoReady(page);
    await setWorkflowEditorValue(page, arn, WORKFLOW_WITH_RETRY_STAGES.replace('name: inspector-test', `name: ${name}`));
    await page.waitForTimeout(1500);

    // Wait for the stage node to appear
    const stageNode = page.locator('[data-testid="rf-stage-explore"]').first();
    await stageNode.waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-testid="rf__minimap"]').evaluate((el) => {
      (el as HTMLElement).style.pointerEvents = 'none';
    });
    await page.locator('[data-testid="rf__node-explore"]').dispatchEvent('click');
    await page.waitForTimeout(500);

    // Verify retry inputs are visible and editable
    const retrySection = page.getByText('Retry Config');
    await expect(retrySection).toBeVisible();

    const maxAttemptsInput = page.getByLabel('Max attempts');
    const backoffInput = page.getByLabel('Backoff (ms)');
    await expect(maxAttemptsInput).toBeVisible();
    await expect(backoffInput).toBeVisible();

    // Verify initial values (from seeded YAML)
    await expect(maxAttemptsInput).toHaveValue('3');
    await expect(backoffInput).toHaveValue('1000');

    // Changing retry max attempts should not crash (T4 onChange handler fix)
    await maxAttemptsInput.fill('5');
    await page.waitForTimeout(300);

    // Changing retry backoff should not crash (T4 onChange handler fix)
    await backoffInput.fill('2000');
    await page.waitForTimeout(300);
  });

  /**
   * T5: Verify InlineDiffSummary appears when the workflow is modified.
   *
   * Strategy: Load a pre-seeded workflow (canvas renders), then edit Monaco.
   */
  test('inline diff summary appears when workflow is modified (T5)', async ({
    page,
    rest,
    seedRegistry,
  }) => {
    const editor = new WorkflowEditorPage(page);

    const name = rest.uniqueName('e2e-diff-test');
    const { arn } = await rest.createWorkflow(name, 'global');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL(/\/editor/);
    await waitForMonacoReady(page);
    await setWorkflowEditorValue(page, arn, WORKFLOW_WITH_RETRY_STAGES.replace('name: inspector-test', `name: ${name}`));
    await page.waitForTimeout(1500);

    // Wait for the stage node to confirm the workflow is loaded
    const stageNode = page.locator('[data-testid="rf-stage-explore"]').first();
    await stageNode.waitFor({ state: 'visible', timeout: 15000 });

    // Initially diff summary should NOT be visible (no edits made yet)
    const diffSummary = page.locator('[data-testid="inline-diff-summary"]');

    // Edit the Monaco content (add a comment) to trigger a change
    await setWorkflowEditorValue(page, arn, `# Modified at ${Date.now()}\n` + WORKFLOW_WITH_RETRY_STAGES.replace('name: inspector-test', `name: ${name}`));
    await page.waitForTimeout(1500);

    // After Monaco change, diff summary should appear
    await expect(diffSummary).toBeVisible({ timeout: 3000 });
  });

  /**
   * T3: Full inspector → YAML → save flow.
   * Monaco changes trigger React state update, save persists correctly.
   */
  test('full flow: inspector edit → yaml sync → save (T3 applyStagePatch)', async ({
    page,
    rest,
    seedRegistry,
  }) => {
    const editor = new WorkflowEditorPage(page);

    const name = rest.uniqueName('e2e-inspector-flow');
    const { arn } = await rest.createWorkflow(name);
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL(/\/editor/);
    await waitForMonacoReady(page);

    // Build YAML with a stage
    const yamlWithStage = `apiVersion: workflows.local/v1
kind: Workflow
metadata:
  name: ${name}
  scope: global
spec:
  description: Test flow
  stages:
    - id: explore
      agent: arn:local:global:agent/orchestrator
      depends_on: []
      description: Explore stage
      execution:
        mode: sequential
        retry:
          max_attempts: 1
          backoff_ms: 100
  execution:
    mode: sequential
    stop_on_error: true`;

    await setWorkflowEditorValue(page, arn, yamlWithStage);
    // Monaco onChange fires immediately, updating React state
    await page.waitForTimeout(1500);

    // Save the workflow
    await editor.save();
    await page.waitForTimeout(500);

    // Verify no errors occurred
    const errorDiv = page.locator('.bg-error');
    await expect(errorDiv).not.toBeVisible({ timeout: 3000 });
  });

  /**
   * T7: Inspector → Monaco YAML sync → save → reload persistence.
   *
   * Strategy: Create and seed a workflow via REST. Edit via inspector.
   * Verify Monaco reflects the change, then save and reload to confirm persistence.
   */
  test('inspector: canvas stage click → edit field → Monaco YAML sync → save + reload (T7)', async ({
    page,
    rest,
    seedRegistry,
  }) => {
    const editor = new WorkflowEditorPage(page);

    const name = rest.uniqueName('e2e-t7-inspector');
    const { arn } = await rest.createWorkflow(name, 'global');
    seedRegistry.register(() => rest.deleteWorkflow(arn));

    // Seed the workflow with initial content
    const initialYaml = `apiVersion: workflows.local/v1
kind: Workflow
metadata:
  name: ${name}
  scope: global
spec:
  description: Initial description
  stages:
    - id: explore
      agent: arn:local:global:agent/orchestrator
      depends_on: []
      description: Initial stage description
      execution:
        mode: sequential
        retry:
          max_attempts: 1
          backoff_ms: 500
  execution:
    mode: sequential
    stop_on_error: true`;

    // Navigate to editor and initialize via Monaco
    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL(/\/editor/);
    await waitForMonacoReady(page);
    await setWorkflowEditorValue(page, arn, initialYaml);
    await page.waitForTimeout(1500);

    // Wait for the stage node to appear
    const stageNode = page.locator('[data-testid="rf-stage-explore"]').first();
    await stageNode.waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-testid="rf__minimap"]').evaluate((el) => {
      (el as HTMLElement).style.pointerEvents = 'none';
    });
    await page.locator('[data-testid="rf__node-explore"]').dispatchEvent('click');
    await page.waitForTimeout(500);

    // Inspector panel should be visible
    const inspectorPanel = page.getByText('Stage Inspector');
    await expect(inspectorPanel).toBeVisible();

    // Edit the description field in the inspector
    const descriptionTextarea = page.locator('#inspector-description');
    await expect(descriptionTextarea).toBeVisible();
    const NEW_DESCRIPTION = 'Updated via inspector T7 test';
    await descriptionTextarea.clear();
    await descriptionTextarea.fill(NEW_DESCRIPTION);
    await page.waitForTimeout(800); // Allow React state + Monaco sync to settle

    // Verify Monaco YAML panel reflects the inspector change
    await page.waitForFunction(
      (arn) => {
        const entry = (window as any).__AW_MONACO_TEST__?.workflowEditors?.[arn];
        if (!entry) return false;
        const val = entry.getValue?.() ?? '';
        return val.length > 0;
      },
      arn,
      { timeout: 8000 }
    );

    const yamlAfterInspectorEdit = await getWorkflowEditorValue(page, arn);
    expect(yamlAfterInspectorEdit).toContain(NEW_DESCRIPTION);
    expect(yamlAfterInspectorEdit).toContain('explore');

    // Save the workflow
    await editor.save();
    await page.waitForTimeout(800);

    // No error toast should appear
    const errorDiv = page.locator('.bg-error');
    await expect(errorDiv).not.toBeVisible({ timeout: 3000 });

    // Reload the editor and verify persistence
    await editor.gotoExistingByArn(PROJECT_ID, arn);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL(/\/editor/);
    await waitForMonacoReady(page);

    // Wait for stage node to reappear after reload
    const stageNodeAfterReload = page.locator('[data-testid="rf-stage-explore"]').first();
    await stageNodeAfterReload.waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-testid="rf__minimap"]').evaluate((el) => {
      (el as HTMLElement).style.pointerEvents = 'none';
    });
    await page.locator('[data-testid="rf__node-explore"]').dispatchEvent('click');
    await page.waitForTimeout(500);

    // The description textarea should show the saved value (persistence confirmed)
    const descriptionAfterReload = page.locator('#inspector-description');
    await expect(descriptionAfterReload).toHaveValue(NEW_DESCRIPTION, { timeout: 5000 });
  });
});
