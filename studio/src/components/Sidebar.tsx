import { useState } from 'react';
import { useMcpTools } from '@/hooks/useMcpTools';
import { useWorkflowEditorStore } from '@/stores/workflowEditorStore';
import { useRegistryCacheStore } from '@/stores/registryCacheStore';

export function Sidebar() {
  const [activeTab, setActiveTab] = useState<'workflows' | 'nodes'>('workflows');
  const { listWorkflows, listNodes, loading } = useMcpTools();
  const setSelectedNodeId = useWorkflowEditorStore((state) => state.setSelectedNodeId);

  const handleRefresh = async () => {
    if (activeTab === 'workflows') {
      await listWorkflows();
    } else {
      await listNodes();
    }
  };

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('workflows')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'workflows'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Workflows
        </button>
        <button
          onClick={() => setActiveTab('nodes')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'nodes'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Registry
        </button>
      </div>

      {/* Refresh button */}
      <div className="px-4 py-2 border-b border-gray-100">
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="w-full py-2 px-3 text-sm bg-gray-100 hover:bg-gray-200 rounded font-medium text-gray-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'workflows' ? (
          <WorkflowList onNodeClick={handleNodeClick} />
        ) : (
          <RegistryList onNodeClick={handleNodeClick} />
        )}
      </div>
    </div>
  );
}

interface WorkflowListProps {
  onNodeClick: (nodeId: string) => void;
}

function WorkflowList({ onNodeClick }: WorkflowListProps) {
  const nodes = useRegistryCacheStore((state) => state.nodes);
  const workflows = nodes.filter((n) => n.type === 'workflow');

  if (workflows.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-400">
        No workflows found.
        <br />
        Click Refresh to load.
      </div>
    );
  }

  return (
    <div className="py-2">
      {workflows.map((workflow) => (
        <button
          key={workflow.id}
          onClick={() => onNodeClick(workflow.id)}
          className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="font-medium text-sm text-gray-800 truncate">
            {workflow.name}
          </div>
          <div className="font-mono text-xs text-indigo-600 truncate mt-0.5">
            {workflow.id}
          </div>
        </button>
      ))}
    </div>
  );
}

interface RegistryListProps {
  onNodeClick: (nodeId: string) => void;
}

function RegistryList({ onNodeClick }: RegistryListProps) {
  const nodes = useRegistryCacheStore((state) => state.nodes);

  if (nodes.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-400">
        No registry nodes found.
        <br />
        Click Refresh to load.
      </div>
    );
  }

  // Group by type
  const grouped = nodes.reduce(
    (acc, node) => {
      if (!acc[node.type]) {
        acc[node.type] = [];
      }
      acc[node.type].push(node);
      return acc;
    },
    {} as Record<string, typeof nodes>
  );

  const typeOrder = ['workflow', 'agent', 'skill', 'tool', 'prompt', 'resource'];

  return (
    <div className="py-2">
      {typeOrder
        .filter((type) => grouped[type]?.length > 0)
        .map((type) => (
          <div key={type}>
            <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50">
              {type}s ({grouped[type].length})
            </div>
            {grouped[type].map((node) => (
              <button
                key={node.id}
                onClick={() => onNodeClick(node.id)}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium text-sm text-gray-800 truncate">
                  {node.name}
                </div>
                <div className="font-mono text-xs text-gray-400 truncate mt-0.5">
                  {node.namespace}
                </div>
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}
