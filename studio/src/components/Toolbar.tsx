import { useState } from 'react';
import { useMcpTools } from '@/hooks/useMcpTools';
import { useWorkflowEditorStore } from '@/stores/workflowEditorStore';

export function Toolbar() {
  const workflow = useWorkflowEditorStore((state) => state.workflow);
  const selectedNodeId = useWorkflowEditorStore((state) => state.selectedNodeId);
  const { getWorkflow, generateExecutionPlan, loading } = useMcpTools();
  const [action, setAction] = useState<string | null>(null);

  const handleViewWorkflow = async () => {
    if (!selectedNodeId) return;
    setAction('view');
    await getWorkflow(selectedNodeId);
    setAction(null);
  };

  const handleGeneratePlan = async () => {
    if (!selectedNodeId) return;
    setAction('plan');
    await generateExecutionPlan(selectedNodeId);
    setAction(null);
  };

  return (
    <div className="h-14 px-4 flex items-center justify-between bg-surface border-b border-outline">
      <div className="flex items-center gap-4">
        <h1 className="font-semibold text-on-surface">Workflow Studio</h1>
        {workflow && (
          <span className="text-sm text-on-surface/50">
            {workflow.name} v{workflow.version}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleViewWorkflow}
          disabled={!selectedNodeId || loading}
          className="px-3 py-1.5 text-sm bg-primary-container hover:bg-primary-container/80 text-on-primary-container rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {action === 'view' ? 'Loading...' : 'View Workflow'}
        </button>
        <button
          onClick={handleGeneratePlan}
          disabled={!selectedNodeId || loading}
          className="px-3 py-1.5 text-sm bg-success-container hover:bg-success-container/80 text-on-success-container rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {action === 'plan' ? 'Generating...' : 'Generate Plan'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-on-surface/40">
          {selectedNodeId ? `Selected: ${selectedNodeId.split('/').pop()}` : 'No selection'}
        </span>
        <div
          className={`w-2 h-2 rounded-full ${
            loading ? 'bg-warning animate-pulse' : 'bg-success'
          }`}
        />
      </div>
    </div>
  );
}
