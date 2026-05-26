import { useExecutionStore } from '@/stores/executionStore';
import { useWorkflowEditorStore } from '@/stores/workflowEditorStore';
import type { ExecutionStep } from '@/types';

interface ExecutionPanelProps {
  onExecute?: () => void;
}

export function ExecutionPanel({ onExecute }: ExecutionPanelProps) {
  const executionPlan = useExecutionStore((state) => state.executionPlan);
  const isExecuting = useExecutionStore((state) => state.isExecuting);
  const selectedNodeId = useWorkflowEditorStore((state) => state.selectedNodeId);

  if (!executionPlan) {
    return (
      <div className="h-full flex items-center justify-center text-on-surface/40 text-sm">
        Generate an execution plan to see the steps here
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface-container">
      <div className="px-4 py-3 bg-surface border-b border-outline">
        <h2 className="font-semibold text-on-surface">Execution Plan</h2>
        <p className="text-xs text-on-surface/50 mt-1">
          {executionPlan.total_steps} steps in {executionPlan.parallel_groups.length} parallel groups
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {executionPlan.execution_order.map((step, index) => (
          <ExecutionStepCard
            key={step.step_id}
            step={step}
            index={index}
            isSelected={step.stage_id === selectedNodeId}
          />
        ))}
      </div>

      <div className="p-4 bg-surface border-t border-outline">
        <button
          onClick={onExecute}
          disabled={isExecuting}
          className={`
            w-full py-2 px-4 rounded-lg font-medium text-on-primary transition-all
            ${isExecuting
              ? 'bg-surface-container-highest cursor-not-allowed'
              : 'bg-primary hover:bg-primary/90 active:bg-primary/80'
            }
          `}
        >
          {isExecuting ? 'Executing...' : 'Execute Workflow'}
        </button>
      </div>
    </div>
  );
}

interface ExecutionStepCardProps {
  step: ExecutionStep;
  index: number;
  isSelected: boolean;
}

function ExecutionStepCard({ step, index, isSelected }: ExecutionStepCardProps) {
  const hasConditions = step.conditions && step.conditions.length > 0;
  const hasRetry = step.retry_config.max_attempts > 1;

  return (
    <div
      className={`
        bg-surface rounded-lg border p-3 transition-all
        ${isSelected ? 'border-primary shadow-md' : 'border-outline'}
      `}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-container text-on-primary-container text-xs font-bold">
          {index + 1}
        </span>
        <span className="font-medium text-sm text-on-surface">
          {step.stage_id}
        </span>
      </div>

      <p className="text-xs text-on-surface/60 mb-2">{step.description}</p>

      <div className="text-xs text-primary mb-2">
        Agent: {step.agent_arn.split('/').pop()}
      </div>

      {(Array.isArray(step.depends_on) ? step.depends_on : []).length > 0 && (
        <div className="text-xs text-on-surface/40 mb-2">
          Depends on: {(Array.isArray(step.depends_on) ? step.depends_on : []).join(', ')}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        {hasConditions && (
          <span className="text-xs px-2 py-0.5 bg-warning-container text-on-warning-container rounded">
            {step.conditions.length} condition(s)
          </span>
        )}
        {hasRetry && (
          <span className="text-xs px-2 py-0.5 bg-info-container text-on-info-container rounded">
            Retry ×{step.retry_config.max_attempts}
          </span>
        )}
      </div>

      {step.output_contract && (
        <div className="mt-2 pt-2 border-t border-outline-variant">
          <span className="text-xs text-on-surface/50">
            Output: {step.output_contract.result_field}
            {step.output_contract.artifacts.length > 0 && (
              <span className="text-on-surface/40 ml-1">
                ({step.output_contract.artifacts.map(a => a.name).join(', ')})
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
