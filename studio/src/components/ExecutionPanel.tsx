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
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Generate an execution plan to see the steps here
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        <h2 className="font-semibold text-gray-800">Execution Plan</h2>
        <p className="text-xs text-gray-500 mt-1">
          {executionPlan.total_steps} steps in {executionPlan.parallel_groups.length} parallel groups
        </p>
      </div>

      {/* Steps list */}
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

      {/* Execute button */}
      <div className="p-4 bg-white border-t border-gray-200">
        <button
          onClick={onExecute}
          disabled={isExecuting}
          className={`
            w-full py-2 px-4 rounded-lg font-medium text-white transition-all
            ${isExecuting
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
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
        bg-white rounded-lg border p-3 transition-all
        ${isSelected ? 'border-indigo-500 shadow-md' : 'border-gray-200'}
      `}
    >
      {/* Step header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
          {index + 1}
        </span>
        <span className="font-medium text-sm text-gray-800">
          {step.stage_id}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-600 mb-2">{step.description}</p>

      {/* Agent */}
      <div className="text-xs text-indigo-600 mb-2">
        Agent: {step.agent_arn.split('/').pop()}
      </div>

      {/* Dependencies */}
      {step.depends_on.length > 0 && (
        <div className="text-xs text-gray-400 mb-2">
          Depends on: {step.depends_on.join(', ')}
        </div>
      )}

      {/* Badges */}
      <div className="flex gap-2 mt-2">
        {hasConditions && (
          <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
            {step.conditions.length} condition(s)
          </span>
        )}
        {hasRetry && (
          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
            Retry ×{step.retry_config.max_attempts}
          </span>
        )}
      </div>

      {/* Output contract */}
      {step.output_contract && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            Output: {step.output_contract.result_field}
            {step.output_contract.artifacts.length > 0 && (
              <span className="text-gray-400 ml-1">
                ({step.output_contract.artifacts.map(a => a.name).join(', ')})
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
