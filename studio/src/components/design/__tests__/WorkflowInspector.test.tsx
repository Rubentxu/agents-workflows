/**
 * WorkflowInspector — component and integration tests for inspector sync.
 * Tests verify onChange handlers fire correctly, local state updates, and patch generation.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import type { StageNodeData } from '../nodes/WorkflowStageNode';
import { WorkflowInspector } from '../inspector/WorkflowInspector';

const makeNode = (overrides: Partial<StageNodeData> = {}): Node<StageNodeData, 'stage'> => ({
  id: 'stage-1',
  type: 'stage',
  position: { x: 0, y: 0 },
  data: {
    id: 'stage-1',
    label: 'Stage 1',
    description: 'Test stage',
    agent: 'arn:local:global:agent/test',
    dependsOn: [],
    executionMode: 'sequential',
    ...overrides,
  },
});

const workflowWithStage = {
  spec: {
    stages: [
      {
        id: 'stage-1',
        agent: 'arn:local:global:agent/test',
        depends_on: [],
        description: 'Test stage',
        input: {},
        execution: { mode: 'sequential', retry: { max_attempts: 3, backoff_ms: 1000 } },
        conditions: [],
      },
    ],
  },
};

describe('WorkflowInspector', () => {
  describe('rendering', () => {
    it('renders stage id as readonly', () => {
      const onUpdate = vi.fn();
      const onClose = vi.fn();
      render(
        <WorkflowInspector
          node={makeNode()}
          workflow={workflowWithStage}
          onUpdate={onUpdate}
          onClose={onClose}
        />
      );

      const idInput = screen.getByLabelText('Stage ID');
      expect(idInput.getAttribute('readonly')).toBe('');
    });

    it('renders label field with current value', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={makeNode({ label: 'My Stage' })}
          workflow={workflowWithStage}
          onUpdate={onUpdate}
          onClose={vi.fn()}
        />
      );

      const labelInput = screen.getByLabelText('Label');
      expect(labelInput).toHaveProperty('value', 'My Stage');
    });

    it('renders retry config fields', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={makeNode()}
          workflow={workflowWithStage}
          onUpdate={onUpdate}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Retry Config')).toBeTruthy();
      expect(screen.getByLabelText('Max attempts')).toHaveProperty('value', '3');
      expect(screen.getByLabelText('Backoff (ms)')).toHaveProperty('value', '1000');
    });
  });

  describe('onChange handlers', () => {
    it('calls onUpdate when label changes', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={makeNode()}
          workflow={workflowWithStage}
          onUpdate={onUpdate}
          onClose={vi.fn()}
        />
      );

      const labelInput = screen.getByLabelText('Label');
      fireEvent.change(labelInput, { target: { value: 'New Label' } });

      expect(onUpdate).toHaveBeenCalledWith({ label: 'New Label' });
    });

    it('calls onUpdate when description changes', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={makeNode()}
          workflow={workflowWithStage}
          onUpdate={onUpdate}
          onClose={vi.fn()}
        />
      );

      const descInput = screen.getByLabelText('Description');
      fireEvent.change(descInput, { target: { value: 'New description' } });

      expect(onUpdate).toHaveBeenCalledWith({ description: 'New description' });
    });

    it('calls onUpdate when agent changes', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={makeNode()}
          workflow={workflowWithStage}
          onUpdate={onUpdate}
          onClose={vi.fn()}
        />
      );

      const agentInput = screen.getByLabelText('Agent ARN');
      fireEvent.change(agentInput, { target: { value: 'arn:local:global:agent/other' } });

      expect(onUpdate).toHaveBeenCalledWith({ agent: 'arn:local:global:agent/other' });
    });

    it('calls onUpdate when execution mode changes', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={makeNode()}
          workflow={workflowWithStage}
          onUpdate={onUpdate}
          onClose={vi.fn()}
        />
      );

      const select = screen.getByLabelText('Execution Mode');
      fireEvent.change(select, { target: { value: 'parallel' } });

      expect(onUpdate).toHaveBeenCalledWith({ executionMode: 'parallel' });
    });

    it('calls onUpdate when retry max_attempts changes (T4 root bug fix)', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={makeNode()}
          workflow={workflowWithStage}
          onUpdate={onUpdate}
          onClose={vi.fn()}
        />
      );

      const maxAttemptsInput = screen.getByLabelText('Max attempts');
      fireEvent.change(maxAttemptsInput, { target: { value: '5' } });

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          retry: expect.objectContaining({ maxAttempts: 5 }),
        })
      );
    });

    it('calls onUpdate when retry backoff_ms changes (T4 root bug fix)', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={makeNode()}
          workflow={workflowWithStage}
          onUpdate={onUpdate}
          onClose={vi.fn()}
        />
      );

      const backoffInput = screen.getByLabelText('Backoff (ms)');
      fireEvent.change(backoffInput, { target: { value: '2000' } });

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          retry: expect.objectContaining({ backoffMs: 2000 }),
        })
      );
    });
  });

  describe('local state', () => {
    it('updates local state when field changes without waiting for parent', () => {
      const onUpdate = vi.fn();
      render(
        <WorkflowInspector
          node={makeNode({ label: 'Original' })}
          workflow={workflowWithStage}
          onUpdate={onUpdate}
          onClose={vi.fn()}
        />
      );

      const labelInput = screen.getByLabelText('Label');
      fireEvent.change(labelInput, { target: { value: 'Changed' } });

      expect(labelInput).toHaveProperty('value', 'Changed');
    });
  });

  describe('onClose', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(
        <WorkflowInspector
          node={makeNode()}
          workflow={workflowWithStage}
          onUpdate={vi.fn()}
          onClose={onClose}
        />
      );

      const closeBtn = screen.getByRole('button', { name: '✕' });
      fireEvent.click(closeBtn);

      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe('applyStagePatch', () => {
  type TestStage = {
    id: string;
    description?: string;
    agent?: string;
    depends_on?: string[];
    execution: { mode: string; retry: { max_attempts: number; backoff_ms: number } };
  };

  function applyStagePatch(
    workflow: { stages: TestStage[] },
    stageId: string,
    patch: Partial<StageNodeData>
  ) {
    return {
      ...workflow,
      stages: workflow.stages.map((s) => {
        if (s.id !== stageId) return s;

        const retryPatch = patch.retry;
        const executionPatch = retryPatch
          ? {
              retry: {
                max_attempts: retryPatch.maxAttempts,
                backoff_ms: retryPatch.backoffMs,
              },
            }
          : {};

        return {
          ...s,
          id: patch.id ?? s.id,
          description: (patch as { description?: string }).description ?? s.description,
          agent: (patch as { agent?: string }).agent ?? s.agent,
          depends_on: (patch as { dependsOn?: string[] }).dependsOn ?? s.depends_on,
          execution: {
            ...s.execution,
            mode: (patch as { executionMode?: string }).executionMode as typeof s.execution.mode ?? s.execution.mode,
            ...executionPatch,
          },
        };
      }),
    };
  }

  it('applies retry patch to correct stage', () => {
    const workflow = {
      stages: [
        {
          id: 'stage-1',
          description: 'Test',
          agent: 'arn:local:global:agent/test',
          depends_on: [],
          execution: { mode: 'sequential' as const, retry: { max_attempts: 1, backoff_ms: 100 } },
        },
      ],
    };

    const result = applyStagePatch(workflow, 'stage-1', {
      retry: { maxAttempts: 5, backoffMs: 2000 },
    });

    expect(result.stages[0].execution.retry.max_attempts).toBe(5);
    expect(result.stages[0].execution.retry.backoff_ms).toBe(2000);
  });

  it('does not modify other stages', () => {
    const workflow = {
      stages: [
        {
          id: 'stage-1',
          description: 'Stage 1',
          agent: 'arn:local:global:agent/test',
          depends_on: [],
          execution: { mode: 'sequential' as const, retry: { max_attempts: 1, backoff_ms: 100 } },
        },
        {
          id: 'stage-2',
          description: 'Stage 2',
          agent: 'arn:local:global:agent/test',
          depends_on: [],
          execution: { mode: 'parallel' as const, retry: { max_attempts: 2, backoff_ms: 500 } },
        },
      ],
    };

    const result = applyStagePatch(workflow, 'stage-1', {
      description: 'Updated Stage 1',
    });

    expect(result.stages[0].description).toBe('Updated Stage 1');
    expect(result.stages[1].description).toBe('Stage 2');
    expect(result.stages[1].execution.mode).toBe('parallel');
  });
});
