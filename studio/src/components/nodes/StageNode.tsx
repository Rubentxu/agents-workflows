import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface StageNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  agent: string;
  dependsOn: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

const statusStyles: Record<string, string> = {
  pending: 'bg-surface-container-high text-on-surface/60',
  running: 'bg-warning-container text-on-warning-container',
  completed: 'bg-success-container text-on-success-container',
  failed: 'bg-error-container text-on-error-container',
  skipped: 'bg-surface-container text-on-surface/40',
};

function StageNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as StageNodeData;
  const statusClass = statusStyles[nodeData.status] || statusStyles.pending;

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 min-w-[180px] shadow-md transition-all
        ${selected ? 'border-primary shadow-lg' : 'border-outline'}
        ${nodeData.status === 'running' ? 'animate-pulse' : ''}
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 border-2 border-primary bg-surface"
      />

      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-sm text-on-surface">{nodeData.label}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>
          {nodeData.status}
        </span>
      </div>

      {nodeData.description && (
        <p className="text-xs text-on-surface/50 mb-2 line-clamp-2">
          {nodeData.description}
        </p>
      )}

      <div className="text-xs text-primary truncate" title={nodeData.agent}>
        Agent: {nodeData.agent.split('/').pop()}
      </div>

      {nodeData.dependsOn && nodeData.dependsOn.length > 0 && (
        <div className="mt-1 text-xs text-on-surface/40">
          Depends on: {nodeData.dependsOn.join(', ')}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 border-2 border-primary bg-surface"
      />
    </div>
  );
}

export const StageNode = memo(StageNodeComponent);
