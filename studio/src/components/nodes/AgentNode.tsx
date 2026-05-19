import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface AgentNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  model: string;
}

function AgentNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as AgentNodeData;

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 min-w-[150px] shadow-md transition-all
        ${selected ? 'border-primary shadow-lg' : 'border-outline-variant'}
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 border-2 border-primary bg-surface"
      />

      <div className="font-semibold text-sm text-on-surface mb-1">
        {nodeData.label}
      </div>

      {nodeData.description && (
        <p className="text-xs text-on-surface/50 mb-2 line-clamp-2">
          {nodeData.description}
        </p>
      )}

      <div className="text-xs text-primary">
        Model: {nodeData.model}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 border-2 border-primary bg-surface"
      />
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
