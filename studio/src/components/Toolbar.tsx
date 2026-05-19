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
    <div className="h-14 px-4 flex items-center justify-between bg-white border-b border-gray-200">
      {/* Left: Title */}
      <div className="flex items-center gap-4">
        <h1 className="font-semibold text-gray-800">Workflow Studio</h1>
        {workflow && (
          <span className="text-sm text-gray-500">
            {workflow.name} v{workflow.version}
          </span>
        )}
      </div>

      {/* Center: Workflow actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleViewWorkflow}
          disabled={!selectedNodeId || loading}
          className="px-3 py-1.5 text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {action === 'view' ? 'Loading...' : 'View Workflow'}
        </button>
        <button
          onClick={handleGeneratePlan}
          disabled={!selectedNodeId || loading}
          className="px-3 py-1.5 text-sm bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {action === 'plan' ? 'Generating...' : 'Generate Plan'}
        </button>
      </div>

      {/* Right: Status */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">
          {selectedNodeId ? `Selected: ${selectedNodeId.split('/').pop()}` : 'No selection'}
        </span>
        <div
          className={`w-2 h-2 rounded-full ${
            loading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'
          }`}
        />
      </div>
    </div>
  );
}
