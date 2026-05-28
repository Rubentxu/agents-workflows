# Tasks: studio-monaco-professional-ux-parity

**Change**: studio-monaco-professional-ux-parity
**Phase**: TASKS
**Status**: Ready for implementation
**Date**: 2026-05-25

---

## Executive Summary

**Problem**: `WorkflowInspector` retry inputs (lines 145–159) are read-only — no `onChange` handlers. `StageNodeData` lacks retry fields. `workflowToYaml` is duplicated. No inline diff before save.

**Solution**: 5 coordinated changes addressing 5 SPEC requirements:
- R1: Inspector retry fields → shared patch pipeline
- R2: `applyStagePatch` as sole write path
- R3: Inline advisory diff summary before save
- R4: Monaco YAML reflects inspector edits in same render cycle (ALREADY WORKS — D4 confirmed)
- R5: Playwright smoke + Vitest coverage

**Open Questions Requiring User Validation** (from auto-grill):
- **O1**: InlineDiffSummary counts-only vs field-level old/new — OS 0.72, recommendation: counts only
- **O2**: Validation in patch vs inspector — OS 0.68, recommendation: validation in inspector
- **O3**: InlineDiffSummary trigger — OS 0.65, recommendation: any field change

---

## Execution Order

| Step | Candidate | Risk | Files Touched | Net Lines |
|------|-----------|------|---------------|-----------|
| 1 | T1 (StageNodeData retry) | Zero | 1 | +6 / -0 |
| 2 | T2 (workflowToYaml seam) | Low | 3 | +10 / -28 |
| 3 | T3 (applyStagePatch) | Low | 1 | +35 / -0 |
| 4 | T4 (WorkflowInspector onChange) | Medium | 1 | +20 / -5 |
| 5 | T5 (InlineDiffSummary) | Low | 1 | +45 / -0 |
| 6 | T6 (Vitest coverage) | Zero | 1 | +120 / -0 |
| 7 | T7 (Playwright smoke) | Zero | 1 | +80 / -0 |

---

## T1: Extend StageNodeData with Retry Fields

**Goal**: Add `retry: { max_attempts: number; backoff_ms: number }` to `StageNodeData` interface.

### Files

| File | What |
|------|------|
| `studio/src/components/design/nodes/WorkflowStageNode.tsx:9-16` | Extend `StageNodeData` |

### Tasks

- [ ] **T1.1** In `studio/src/components/design/nodes/WorkflowStageNode.tsx`, extend `StageNodeData` interface:
  ```typescript
  // BEFORE (lines 9-16)
  export interface StageNodeData extends Record<string, unknown> {
    id: string;
    label: string;
    description?: string;
    agent?: string;
    dependsOn?: string[];
    executionMode?: string;
  }

  // AFTER
  export interface StageNodeData extends Record<string, unknown> {
    id: string;
    label: string;
    description?: string;
    agent?: string;
    dependsOn?: string[];
    executionMode?: string;
    retry: { max_attempts: number; backoff_ms: number };
  }
  ```

- [ ] **T1.2** Verify TypeScript compiles:
  ```bash
  cd studio && npx tsc --noEmit
  # Expected: no errors related to StageNodeData
  ```

---

## T2: Extract workflowToYaml to Shared Utility

**Goal**: Consolidate duplicate `workflowToYaml` and `manifestToWorkflow` into `studio/src/components/design/utils/workflowSerialization.ts`.

### Files

| File | What |
|------|------|
| `studio/src/components/design/utils/workflowSerialization.ts` | **NEW** — shared seam |
| `studio/src/components/design/WorkflowYamlEditor.tsx` | Remove local definitions (export remains) |
| `studio/src/components/design/WorkflowEditorPage.tsx` | Remove local `workflowToYaml`, import from utils |

### Tasks

- [ ] **T2.1** Create `studio/src/components/design/utils/workflowSerialization.ts`:
  ```typescript
  import * as yaml from 'js-yaml';
  import type { Workflow } from '@/types/workflow';
  import type { WorkflowManifest } from '@/types/manifest.workflow';
  import { API_VERSION } from '@/types/manifest';

  export function workflowToYaml(workflow: Workflow | null): string {
    if (!workflow) return '';
    const manifest: WorkflowManifest = {
      apiVersion: API_VERSION,
      kind: 'Workflow',
      metadata: {
        uid: '',
        name: workflow.name,
        scope: 'global',
        labels: {},
        annotations: {},
      },
      spec: {
        description: workflow.description,
        stages: workflow.stages,
        agents: workflow.agents,
        skills: workflow.skills,
        execution: workflow.execution as unknown as { mode: string; stop_on_error: boolean },
        metrics: workflow.metrics as { streaming: boolean; interval_ms: number; channels: string[] },
      },
    };
    return yaml.dump(manifest, { indent: 2, lineWidth: -1, noRefs: true });
  }

  export function manifestToWorkflow(manifest: WorkflowManifest): Workflow {
    return {
      arn: `arn:local:${manifest.metadata.scope}:workflow/${manifest.metadata.name}`,
      name: manifest.metadata.name,
      version: '1.0',
      description: manifest.spec.description ?? '',
      agents: manifest.spec.agents ?? {},
      skills: manifest.spec.skills ?? {},
      stages: manifest.spec.stages ?? [],
      execution: {
        mode: (manifest.spec.execution?.mode as Workflow['execution']['mode']) ?? 'sequential',
        stop_on_error: manifest.spec.execution?.stop_on_error ?? true,
      },
      metrics: manifest.spec.metrics ?? { streaming: false, interval_ms: 5000, channels: [] },
    };
  }
  ```

- [ ] **T2.2** In `studio/src/components/design/WorkflowYamlEditor.tsx`:
  - Remove the local `workflowToYaml` function (lines 45-67)
  - Remove the local `manifestToWorkflow` function (lines 69-84)
  - Add import: `import { workflowToYaml, manifestToWorkflow } from './utils/workflowSerialization';`
  - Keep the file as the **canonical export point** (tests import from here)

- [ ] **T2.3** In `studio/src/components/design/WorkflowEditorPage.tsx`:
  - Remove the local `workflowToYaml` function (lines 117-139)
  - Add import: `import { workflowToYaml } from './utils/workflowSerialization';`

- [ ] **T2.4** Verify:
  ```bash
  cd studio && npx tsc --noEmit
  # Check existing test imports still work
  grep -r "from.*WorkflowYamlEditor.*workflowToYaml" studio/src/
  # Expected: test files import from WorkflowYamlEditor (canonical export)
  ```

---

## T3: Implement applyStagePatch

**Goal**: Create `applyStagePatch(stageId, patch)` as the sole write path for all stage mutations from the inspector.

### Files

| File | What |
|------|------|
| `studio/src/components/design/WorkflowEditorPage.tsx` | Add `applyStagePatch` function, refactor `onUpdate` |

### Tasks

- [ ] **T3.1** Add `StagePatch` type and `applyStagePatch` function to `WorkflowEditorPage.tsx`:
  ```typescript
  type StagePatch = {
    retry?: { max_attempts?: number; backoff_ms?: number };
    label?: string;
    description?: string;
    agent?: string;
    dependsOn?: string[];
    executionMode?: string;
  };

  function applyStagePatch(
    stageId: string,
    patch: StagePatch
  ): (workflow: Workflow) => Workflow {
    return (workflow: Workflow): Workflow => {
      const stageIndex = workflow.stages.findIndex((s) => s.id === stageId);
      if (stageIndex === -1) return workflow;

      const updatedStages = [...workflow.stages];
      const stage = { ...updatedStages[stageIndex] };

      if (patch.label !== undefined) stage.label = patch.label;
      if (patch.description !== undefined) stage.description = patch.description;
      if (patch.agent !== undefined) stage.agent = patch.agent;
      if (patch.dependsOn !== undefined) stage.depends_on = patch.dependsOn;
      if (patch.executionMode !== undefined) {
        stage.execution = { ...stage.execution, mode: patch.executionMode as Stage['execution']['mode'] };
      }
      if (patch.retry !== undefined) {
        stage.execution = {
          ...stage.execution,
          retry: { ...stage.execution.retry, ...patch.retry },
        };
      }

      updatedStages[stageIndex] = stage;
      return { ...workflow, stages: updatedStages };
    };
  }
  ```

- [ ] **T3.2** Refactor the `onUpdate` prop in `WorkflowEditorPage.tsx` (lines 378-409) to use `applyStagePatch`:
  - Replace the inline stage mutation logic with:
    ```typescript
    onUpdate={(patch) => {
      if (!workflow || !selectedNodeId) return;
      setWorkflow((prev) => {
        if (!prev) return prev;
        return applyStagePatch(selectedNodeId, patch)(prev);
      });
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId
            ? { ...n, data: { ...n.data, ...patch } }
            : n
        )
      );
    }}
    ```

- [ ] **T3.3** Verify:
  ```bash
  cd studio && npx tsc --noEmit
  ```

---

## T4: Add onChange Handlers to WorkflowInspector

**Goal**: Fix the root bug — retry inputs (lines 145-159) lack `onChange`. All inspector fields must propagate through the shared patch pipeline.

### Files

| File | What |
|------|------|
| `studio/src/components/design/inspector/WorkflowInspector.tsx` | Add `onChange` to retry inputs, refactor `handleChange` |

### Tasks

- [ ] **T4.1** Extend `localData` state to include retry:
  ```typescript
  // BEFORE (lines 32-35)
  const [localData, setLocalData] = useState<StageNodeData>({
    ...node.data,
    ...stageData,
  });

  // AFTER — include retry from stageData.execution.retry
  const [localData, setLocalData] = useState<StageNodeData>({
    ...node.data,
    ...stageData,
    retry: stageData?.execution?.retry ?? { max_attempts: 1, backoff_ms: 1000 },
  });
  ```

- [ ] **T4.2** Add `handleRetryChange` function:
  ```typescript
  const handleRetryChange = useCallback((field: 'max_attempts' | 'backoff_ms', value: number) => {
    const updated = {
      ...localData,
      retry: { ...localData.retry, [field]: value },
    };
    setLocalData(updated);
    onUpdate({ retry: updated.retry });
  }, [localData, onUpdate]);
  ```

- [ ] **T4.3** Update retry inputs to use `onChange`:
  ```typescript
  // BEFORE (lines 145-159) — NO onChange
  <input
    type="number"
    min={1}
    value={stageData.execution?.retry?.max_attempts ?? 1}
    // ... no onChange
  />

  // AFTER — uses localData.retry and handleRetryChange
  <input
    type="number"
    min={1}
    value={localData.retry.max_attempts}
    onChange={(e) => handleRetryChange('max_attempts', Number(e.target.value))}
    className="w-full text-sm bg-surface border border-outline-variant rounded px-2 py-1.5 text-on-surface outline-none focus:border-primary"
  />
  ```

- [ ] **T4.4** Update `executionMode` select to use `localData` (not `stageData`):
  ```typescript
  // BEFORE (line 110)
  value={localData.executionMode ?? stageData?.execution?.mode ?? 'sequential'}

  // AFTER — use localData consistently
  value={localData.executionMode ?? 'sequential'}
  ```

- [ ] **T4.5** Verify:
  ```bash
  cd studio && npx tsc --noEmit
  grep -n "onChange" studio/src/components/design/inspector/WorkflowInspector.tsx | wc -l
  # Expected: > 0 (was 0 for retry inputs)
  ```

---

## T5: InlineDiffSummary Component

**Goal**: Show advisory diff summary before save (non-blocking) in the save button area.

### Files

| File | What |
|------|------|
| `studio/src/components/design/WorkflowInlineDiffSummary.tsx` | **NEW** — advisory diff component |
| `studio/src/components/design/WorkflowEditorPage.tsx` | Add dirty state tracking, integrate InlineDiffSummary |
| `studio/src/components/design/WorkflowYamlEditor.tsx` | (Optional) inject diff summary into YAML panel header |

### Tasks

- [ ] **T5.1** Create `studio/src/components/design/WorkflowInlineDiffSummary.tsx`:
  ```typescript
  interface DiffChange {
    stageId: string;
    changeType: 'added' | 'removed' | 'modified';
    changedFields?: string[];
  }

  interface InlineDiffSummaryProps {
    changes: DiffChange[];
    totalStagesBefore: number;
    totalStagesAfter: number;
    onDismiss?: () => void;
  }

  export function InlineDiffSummary({
    changes,
    totalStagesBefore,
    totalStagesAfter,
    onDismiss,
  }: InlineDiffSummaryProps) {
    if (changes.length === 0 && totalStagesBefore === totalStagesAfter) return null;

    const added = changes.filter((c) => c.changeType === 'added');
    const removed = changes.filter((c) => c.changeType === 'removed');
    const modified = changes.filter((c) => c.changeType === 'modified');

    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-surface-container/50 border border-outline-variant rounded text-xs">
        <div className="flex items-center gap-2">
          {added.length > 0 && (
            <span className="text-success">+{added.length} added</span>
          )}
          {removed.length > 0 && (
            <span className="text-error">-{removed.length} removed</span>
          )}
          {modified.length > 0 && (
            <span className="text-warning">{modified.length} modified</span>
          )}
          {totalStagesBefore !== totalStagesAfter && (
            <span className="text-secondary">
              stages: {totalStagesBefore} → {totalStagesAfter}
            </span>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-secondary hover:text-on-surface ml-auto text-[10px]"
          >
            ✕
          </button>
        )}
      </div>
    );
  }
  ```

- [ ] **T5.2** In `WorkflowEditorPage.tsx`, add dirty state tracking:
  ```typescript
  const [originalWorkflow, setOriginalWorkflow] = useState<Workflow | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  // On workflow load, store original
  useEffect(() => {
    if (workflow && !originalWorkflow) {
      setOriginalWorkflow(workflow);
    }
  }, [workflow, originalWorkflow]);

  // Compute diff when save is clicked
  const handleSave = useCallback(async () => {
    if (!workflow || !originalWorkflow) return;
    const changes = computeChanges(originalWorkflow, workflow);
    setShowDiff(true);
    // ... existing save logic
  }, [workflow, originalWorkflow]);
  ```

- [ ] **T5.3** Integrate `InlineDiffSummary` into the save button area (header):
  ```tsx
  // In the header div, after the Save button
  {showDiff && (
    <InlineDiffSummary
      changes={computeChanges(originalWorkflow, workflow)}
      totalStagesBefore={originalWorkflow?.stages.length ?? 0}
      totalStagesAfter={workflow?.stages.length ?? 0}
      onDismiss={() => setShowDiff(false)}
    />
  )}
  ```

- [ ] **T5.4** Implement `computeChanges` utility:
  ```typescript
  function computeChanges(original: Workflow, current: Workflow): DiffChange[] {
    const changes: DiffChange[] = [];
    const originalIds = new Set(original.stages.map((s) => s.id));
    const currentIds = new Set(current.stages.map((s) => s.id));

    // Added
    for (const stage of current.stages) {
      if (!originalIds.has(stage.id)) {
        changes.push({ stageId: stage.id, changeType: 'added' });
      }
    }

    // Removed
    for (const stage of original.stages) {
      if (!currentIds.has(stage.id)) {
        changes.push({ stageId: stage.id, changeType: 'removed' });
      }
    }

    // Modified
    for (const currentStage of current.stages) {
      const originalStage = original.stages.find((s) => s.id === currentStage.id);
      if (originalStage) {
        const changedFields: string[] = [];
        if (originalStage.description !== currentStage.description) changedFields.push('description');
        if (originalStage.agent !== currentStage.agent) changedFields.push('agent');
        if (JSON.stringify(originalStage.execution) !== JSON.stringify(currentStage.execution)) {
          changedFields.push('execution');
        }
        if (changedFields.length > 0) {
          changes.push({ stageId: currentStage.id, changeType: 'modified', changedFields });
        }
      }
    }

    return changes;
  }
  ```

- [ ] **T5.5** Verify:
  ```bash
  cd studio && npx tsc --noEmit
  ```

---

## T6: Vitest Component/Integration Tests

**Goal**: Cover `WorkflowInspector` retry onChange, `applyStagePatch` atomicity, and round-trip YAML fidelity.

### Files

| File | What |
|------|------|
| `studio/src/components/design/__tests__/workflowInspector.test.tsx` | **NEW** — component tests |
| `studio/src/components/design/__tests__/workflowRoundTrip.test.ts` | **NEW** — applyStagePatch + YAML round-trip |

### Tasks

- [ ] **T6.1** Create `studio/src/components/design/__tests__/workflowInspector.test.tsx`:
  ```typescript
  import { render, screen, fireEvent } from '@testing-library/react';
  import { WorkflowInspector } from '../inspector/WorkflowInspector';

  const mockNode = {
    id: 'build',
    type: 'stage' as const,
    data: { id: 'build', label: 'build', retry: { max_attempts: 1, backoff_ms: 1000 } },
    selected: true,
  };

  const mockWorkflow = {
    spec: {
      stages: [{
        id: 'build',
        agent: 'arn:local:global:agent/test',
        depends_on: [],
        description: 'build stage',
        input: {},
        execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 1000 } },
        conditions: [],
      }],
    },
  };

  describe('WorkflowInspector', () => {
    it('renders retry max_attempts input with correct value', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={mockNode as any}
          workflow={mockWorkflow}
          onUpdate={onUpdate}
          onClose={() => {}}
        />
      );
      const input = screen.getByLabelText(/max attempts/i);
      expect(input).toHaveValue(1);
    });

    it('calls onUpdate when retry max_attempts changes', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={mockNode as any}
          workflow={mockWorkflow}
          onUpdate={onUpdate}
          onClose={() => {}}
        />
      );
      const input = screen.getByLabelText(/max attempts/i);
      fireEvent.change(input, { target: { value: '5' } });
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ retry: { max_attempts: 5, backoff_ms: 1000 } })
      );
    });

    it('calls onUpdate when retry backoff_ms changes', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={mockNode as any}
          workflow={mockWorkflow}
          onUpdate={onUpdate}
          onClose={() => {}}
        />
      );
      const input = screen.getByLabelText(/backoff/i);
      fireEvent.change(input, { target: { value: '2000' } });
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ retry: { max_attempts: 1, backoff_ms: 2000 } })
      );
    });

    it('calls onUpdate when description changes', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={mockNode as any}
          workflow={mockWorkflow}
          onUpdate={onUpdate}
          onClose={() => {}}
        />
      );
      const textarea = screen.getByLabelText(/description/i);
      fireEvent.change(textarea, { target: { value: 'new description' } });
      expect(onUpdate).toHaveBeenCalledWith({ description: 'new description' });
    });
  });
  ```

- [ ] **T6.2** Create `studio/src/components/design/__tests__/workflowRoundTrip.test.ts`:
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { workflowToYaml, manifestToWorkflow } from '../utils/workflowSerialization';
  import type { Workflow, WorkflowManifest } from '@/types/manifest.workflow';
  import { API_VERSION } from '@/types/manifest';

  const sampleWorkflow: Workflow = {
    arn: 'arn:local:global:workflow/test',
    name: 'test',
    version: '1.0',
    description: 'Test workflow',
    agents: {},
    skills: {},
    stages: [{
      id: 'build',
      agent: 'arn:local:global:agent/test',
      depends_on: [],
      description: 'build stage',
      input: {},
      output: { artifacts: [] },
      execution: { mode: 'sequential', retry: { max_attempts: 3, backoff_ms: 2000 } },
      conditions: [],
      metrics: [],
    }],
    execution: { mode: 'sequential', stop_on_error: true },
    metrics: { streaming: false, interval_ms: 5000, channels: [] },
  };

  describe('workflowToYaml', () => {
    it('serializes retry fields correctly', () => {
      const yaml = workflowToYaml(sampleWorkflow);
      expect(yaml).toContain('max_attempts: 3');
      expect(yaml).toContain('backoff_ms: 2000');
    });

    it('round-trips through manifestToWorkflow preserving retry', () => {
      const yaml = workflowToYaml(sampleWorkflow);
      const manifest = yaml.load(yaml) as WorkflowManifest;
      const roundTripped = manifestToWorkflow(manifest);
      expect(roundTripped.stages[0].execution.retry.max_attempts).toBe(3);
      expect(roundTripped.stages[0].execution.retry.backoff_ms).toBe(2000);
    });
  });
  ```

- [ ] **T6.3** Verify:
  ```bash
  cd studio && npm run test -- --run studio/src/components/design/__tests__/
  # Expected: all tests pass
  ```

---

## T7: Playwright Smoke Test

**Goal**: E2E smoke test — inspector edit propagates to YAML and persists.

### Files

| File | What |
|------|------|
| `studio/e2e/inspector-sync.spec.ts` | **NEW** — Playwright smoke |

### Tasks

- [ ] **T7.1** Create `studio/e2e/inspector-sync.spec.ts`:
  ```typescript
  import { test, expect } from '@playwright/test';
  import { createMockWorkflow, waitForMonaco } from './helpers';

  test.describe('Inspector → YAML → Save smoke', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/studio/projects/app/design/workflows/e2e-inspector-sync');
      await waitForMonaco(page);
    });

    test('inspector retry edit propagates to YAML', async ({ page }) => {
      // Select first stage node
      const stageNode = page.locator('.react-flow__node').first();
      await stageNode.click();

      // Inspector should appear
      await expect(page.getByText('Stage Inspector')).toBeVisible();

      // Edit max_attempts
      const maxAttemptsInput = page.getByLabel(/max attempts/i);
      await maxAttemptsInput.fill('5');

      // YAML should reflect change
      const yamlEditor = page.locator('.monaco-editor');
      await expect(yamlEditor).toContainText('max_attempts: 5');
    });

    test('save persists workflow', async ({ page }) => {
      // Make a change
      const stageNode = page.locator('.react-flow__node').first();
      await stageNode.click();
      const descTextarea = page.getByLabel(/description/i);
      await descTextarea.fill('smoke test description');

      // Save
      await page.getByRole('button', { name: 'Save' }).click();

      // Verify success (no error shown)
      await expect(page.locator('.text-error')).not.toBeVisible();
    });
  });
  ```

- [ ] **T7.2** Verify:
  ```bash
  cd studio && npx playwright test e2e/inspector-sync.spec.ts
  # Expected: all tests pass
  ```

---

## Cross-Cutting Verification

After all tasks:

```bash
cd studio && npx tsc --noEmit
npm run lint  # if available
npx vitest run studio/src/components/design/__tests__/
npx playwright test e2e/inspector-sync.spec.ts
```

---

## Open Questions (Require User Validation)

| # | Question | Options | OS Score | Recommendation |
|---|----------|---------|----------|----------------|
| O1 | InlineDiffSummary — show field-level old/new or counts only? | A: Counts only / B: Field-level old/new | 0.72 | **A** — counts only; field detail on stage click |
| O2 | Validation in applyStagePatch or inspector? | A: Patch function / B: Inspector / C: No validation | 0.68 | **B** — inspector handles UX validation; patch is pure |
| O3 | What triggers InlineDiffSummary display? | A: Any field change / B: Only pre-save / C: On stage selection | 0.65 | **A** — advisory on every change; dismissible |

**If user disagrees with recommendations**, adjust the implementation accordingly before proceeding to T5.

---

## Entropy Budget

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| StageNodeData fields | 6 | 7 | +1 |
| workflowToYaml copies | 2 | 1 | -1 |
| applyStagePatch lines | 0 | 35 | +35 |
| InlineDiffSummary lines | 0 | 45 | +45 |
| Test coverage lines | 0 | 200 | +200 |
| New connascence pairs | 0 | 2 | +2 |

---

## Phase Contract

```typescript
{
  status: "complete",
  executive_summary: "5 requirements from SPEC addressed: (R1) StageNodeData extended with retry, (R2) applyStagePatch sole write path, (R3) InlineDiffSummary advisory diff, (R4) Monaco same-cycle sync confirmed working, (R5) Vitest + Playwright coverage added. 3 open questions need user validation before T5 implementation.",
  artifacts: [
    "openspec/changes/studio-monaco-professional-ux-parity/TASKS.md",
    "openspec/changes/studio-monaco-professional-ux-parity/SPEC.md",
    "openspec/changes/studio-monaco-professional-ux-parity/DESIGN.md"
  ],
  next_recommended: "sdd-apply",
  risks: [
    { id: "R1", description: "Feedback loop between Monaco and canvas", severity: "medium", mitigation: "isExternalUpdateRef pattern confirmed working" },
    { id: "R2", description: "workflowToYaml breaking change during extraction", severity: "low", mitigation: "in-place refactor + test verification" },
    { id: "R3", description: "Open questions O1-O3 need user validation before T5", severity: "medium", mitigation: "pending user input" }
  ],
  skill_resolution: {
    "entropy-sdd": "Protocol C executed — bottleneck optimal across all interfaces",
    "auto-grill": "3 open questions escalated with OS scores 0.65-0.72"
  },
  ready_for_apply: "yes — pending O1-O3 validation"
}
```
