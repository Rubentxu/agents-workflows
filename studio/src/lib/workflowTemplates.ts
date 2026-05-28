import { buildArn } from '@/types/manifest';
import type { Stage, Workflow } from '@/types/workflow';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  stages: Omit<Stage, 'agent'>[];
  execution: { mode: 'sequential' | 'parallel'; on_failure: 'abort' | 'continue' | 'retry' };
}

function createStage(
  id: string,
  description: string,
  depends_on: string[] = []
): Omit<Stage, 'agent'> {
  return {
    id,
    depends_on,
    description,
    input: {},
    output: { artifacts: [] },
    execution: { mode: 'sequential', retry: { max_attempts: 1, backoff_ms: 0 } },
    conditions: [],
    metrics: [],
  };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'full-sdd',
    name: 'Full SDD Lifecycle',
    description: 'Complete Spec-Driven Development with all 8 canonical stages.',
    stages: [
      createStage('explore', 'Explore the problem space, constraints, and current behavior.'),
      createStage('propose', 'Create a change proposal with goals, scope, and tradeoffs.', ['explore']),
      createStage('design', 'Turn the proposal into an implementation design.', ['propose']),
      createStage('spec', 'Write the delta specs and acceptance scenarios.', ['design']),
      createStage('tasks', 'Break the change into concrete implementation tasks.', ['spec']),
      createStage('apply', 'Implement the approved tasks in the codebase.', ['tasks']),
      createStage('verify', 'Validate behavior, tests, and spec compliance.', ['apply']),
      createStage('archive', 'Archive the change and sync the final SDD artifacts.', ['verify']),
    ],
    execution: { mode: 'sequential', on_failure: 'abort' },
  },
  {
    id: 'quick-path',
    name: 'Quick Path',
    description: 'Lean path for small, low-risk changes that still need verification.',
    stages: [
      createStage('explore', 'Clarify the task and inspect the existing implementation.'),
      createStage('tasks', 'Define the minimum implementation work required.', ['explore']),
      createStage('apply', 'Implement the changes directly in the codebase.', ['tasks']),
      createStage('verify', 'Run targeted validation before shipping.', ['apply']),
    ],
    execution: { mode: 'sequential', on_failure: 'abort' },
  },
  {
    id: 'bugfix',
    name: 'Bugfix Flow',
    description: 'Focused workflow for reproducing, fixing, and validating a defect.',
    stages: [
      createStage('explore', 'Reproduce the bug and isolate the root cause.'),
      createStage('design', 'Decide the safest fix and regression strategy.', ['explore']),
      createStage('apply', 'Implement the fix with minimal blast radius.', ['design']),
      createStage('verify', 'Prove the bug is fixed and guard against regressions.', ['apply']),
    ],
    execution: { mode: 'sequential', on_failure: 'abort' },
  },
  {
    id: 'architecture-change',
    name: 'Architecture Change',
    description: 'Structured path for broader refactors and architecture evolution.',
    stages: [
      createStage('explore', 'Map the current architecture and existing constraints.'),
      createStage('propose', 'Define the intended architectural change and rationale.', ['explore']),
      createStage('design', 'Design module boundaries, contracts, and migration path.', ['propose']),
      createStage('spec', 'Capture requirements and scenarios for the new structure.', ['design']),
      createStage('tasks', 'Sequence implementation slices and migration work.', ['spec']),
      createStage('apply', 'Execute the architecture changes incrementally.', ['tasks']),
      createStage('verify', 'Validate behavior, contracts, and maintainability outcomes.', ['apply']),
      createStage('archive', 'Record the architectural delta and resulting decisions.', ['verify']),
    ],
    execution: { mode: 'sequential', on_failure: 'abort' },
  },
  {
    id: 'blank',
    name: 'Blank Canvas',
    description: 'Start with an empty workflow and compose stages manually.',
    stages: [],
    execution: { mode: 'sequential', on_failure: 'abort' },
  },
];

export function getWorkflowTemplate(templateId: string | null | undefined): WorkflowTemplate | null {
  if (!templateId) return null;
  return WORKFLOW_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function instantiateWorkflowFromTemplate(
  templateId: string | null | undefined,
  scope: string,
  name: string
): Workflow {
  const template = getWorkflowTemplate(templateId);
  const stages = (template?.stages ?? []).map((stage) => ({
    ...stage,
    agent: buildArn(scope, 'Agent', `sdd-${stage.id}`),
  }));

  return {
    arn: buildArn(scope, 'Workflow', name),
    name,
    scope,
    version: '1.0',
    description: template?.description ?? '',
    labels: {},
    annotations: {},
    agents: {},
    skills: {},
    stages,
    execution: template?.execution ?? { mode: 'sequential', on_failure: 'abort' },
    metrics: { streaming: false, interval_ms: 5000, channels: [] },
  };
}
