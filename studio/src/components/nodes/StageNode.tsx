import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface StageNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  agent: string;
  dependsOn: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-200 text-gray-600',
  running: 'bg-yellow-200 text-yellow-700',
  completed: 'bg-green-200 text-green-700',
  failed: 'bg-red-200 text-red-700',
  skipped: 'bg-gray-100 text-gray-400',
};

function StageNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as StageNodeData;
  const statusClass = statusColors[nodeData.status] || statusColors.pending;

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 min-w-[180px] shadow-md transition-all
        ${selected ? 'border-indigo-500 shadow-lg' : 'border-gray-200'}
        ${nodeData.status === 'running' ? 'animate-pulse' : ''}
      `}
    >
      {/* Input handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 border-2 border-indigo-500 bg-white"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-sm text-gray-800">{nodeData.label}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>
          {nodeData.status}
        </span>
      </div>

      {/* Description */}
      {nodeData.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">
          {nodeData.description}
        </p>
      )}

      {/* Agent reference */}
      <div className="text-xs text-indigo-600 truncate" title={nodeData.agent}>
        Agent: {nodeData.agent.split('/').pop()}
      </div>

      {/* Dependencies */}
      {nodeData.dependsOn && nodeData.dependsOn.length > 0 && (
        <div className="mt-1 text-xs text-gray-400">
          Depends on: {nodeData.dependsOn.join(', ')}
        </div>
      )}

      {/* Output handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 border-2 border-indigo-500 bg-white"
      />
    </div>
  );
}

export const StageNode = memo(StageNodeComponent);
