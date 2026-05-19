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
        ${selected ? 'border-emerald-500 shadow-lg' : 'border-emerald-200'}
      `}
    >
      {/* Input handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 border-2 border-emerald-500 bg-white"
      />

      {/* Header */}
      <div className="font-semibold text-sm text-gray-800 mb-1">
        {nodeData.label}
      </div>

      {/* Description */}
      {nodeData.description && (
        <p className="text-xs text-gray-500 mb-2 line-clamp-2">
          {nodeData.description}
        </p>
      )}

      {/* Model */}
      <div className="text-xs text-emerald-600">
        Model: {nodeData.model}
      </div>

      {/* Output handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 border-2 border-emerald-500 bg-white"
      />
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
