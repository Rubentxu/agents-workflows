/**
 * WorkflowStageNode — custom ReactFlow node for workflow stages.
 * Displays stage id, agent, description, and execution mode badge.
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface StageNodeData extends Record<string, unknown> {
  id: string;
  label: string;
  description?: string;
  agent?: string;
  dependsOn?: string[];
  executionMode?: string;
}

function WorkflowStageNodeComponent(props: NodeProps) {
  const data = props.data as StageNodeData;
  const selected = props.selected ?? false;

  return (
    <div
      className={`relative px-4 py-3 min-w-[180px] rounded-lg border-2 transition-all ${
        selected
          ? 'border-accent bg-accent/10 shadow-lg shadow-accent/20'
          : 'border-border-default bg-bg-surface hover:border-accent/50'
      }`}
    >
      {/* Input handle (top) */}
      {data.dependsOn && data.dependsOn.length > 0 && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2.5 !h-2.5 !bg-accent !border-2 !border-bg-surface"
        />
      )}

      {/* Stage header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-text-primary truncate">{data.label}</div>
          {data.description && (
            <div className="text-[10px] text-text-muted mt-0.5 line-clamp-2">{data.description}</div>
          )}
        </div>
        {data.executionMode && (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary border border-border-subtle flex-shrink-0">
            {data.executionMode}
          </span>
        )}
      </div>

      {/* Agent */}
      {data.agent && (
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[9px] text-text-muted">Agent:</span>
          <span className="text-[9px] text-accent font-mono truncate">{data.agent.split('/').pop()}</span>
        </div>
      )}

      {/* Dependencies */}
      {data.dependsOn && data.dependsOn.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-[9px] text-text-muted">deps:</span>
          <span className="text-[9px] text-text-secondary">{data.dependsOn.length}</span>
        </div>
      )}

      {/* Output handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-accent !border-2 !border-bg-surface"
      />
    </div>
  );
}

export const WorkflowStageNode = memo(WorkflowStageNodeComponent);
