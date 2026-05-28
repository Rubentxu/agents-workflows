/**
 * WorkflowInspector — right panel for editing selected stage properties.
 * Part of the WorkflowEditor hybrid editing surface.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Node } from '@xyflow/react';
import type { StageNodeData } from '../nodes/WorkflowStageNode';
import { useMcpTools } from '@/hooks/useMcpTools';
import { parseArn } from '@/types/manifest';
import type { RegistryNode } from '@/types';

interface WorkflowInspectorProps {
  node: Node<StageNodeData, 'stage'>;
  workflow: {
    spec?: {
      stages?: Array<{
        id: string;
        agent: string;
        depends_on: string[];
        description: string;
        input: Record<string, unknown>;
        execution: { mode: string; retry: { max_attempts: number; backoff_ms: number } };
        conditions: Array<{ when: string; operator: string; value: unknown }>;
      }>;
    };
  } | null;
  onUpdate: (data: Partial<StageNodeData>) => void;
  onClose: () => void;
  onDeleteStage?: (stageId: string) => void;
}

function AgentArnAutocomplete({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { listAgents } = useMcpTools();
  const [agents, setAgents] = useState<RegistryNode[]>([]);
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load agents on mount
  useEffect(() => {
    let mounted = true;
    listAgents().then((list) => {
      if (mounted) setAgents(list);
    });
    return () => { mounted = false; };
  }, [listAgents]);

  // Sync input with external value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Filter agents by input
  const filteredAgents = agents.filter((agent) => {
    const search = inputValue.toLowerCase();
    return (
      agent.name.toLowerCase().includes(search) ||
      (agent.namespace?.toLowerCase().includes(search) ?? false) ||
      agent.id.toLowerCase().includes(search)
    );
  });

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSelectedIndex(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredAgents.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        const agent = filteredAgents[selectedIndex];
        if (agent) {
          onChange(agent.id);
          setInputValue(agent.id);
          setIsOpen(false);
          setSelectedIndex(-1);
        }
      }
    },
    [filteredAgents, selectedIndex, onChange]
  );

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id="inspector-agent"
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
          setSelectedIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="arn:local:global:agent/..."
        className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary font-mono"
      />
      {isOpen && filteredAgents.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface border border-outline-variant rounded-lg shadow-lg max-h-48 overflow-auto"
        >
          {filteredAgents.slice(0, 10).map((agent, index) => {
            const parsed = parseArn(agent.id);
            const scope = parsed?.scope ?? 'unknown';
            return (
              <button
                key={agent.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2 ${
                  index === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-surface-container-hover text-on-surface'
                }`}
                onClick={() => {
                  onChange(agent.id);
                  setInputValue(agent.id);
                  setIsOpen(false);
                  setSelectedIndex(-1);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate">{agent.name}</span>
                  <span className="text-[10px] text-secondary font-mono truncate">{agent.id}</span>
                </div>
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-secondary">
                  {scope}
                </span>
              </button>
            );
          })}
          {filteredAgents.length > 10 && (
            <div className="px-3 py-1.5 text-[10px] text-secondary border-t border-outline-variant">
              +{filteredAgents.length - 10} more agents
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgentArnStatus({ agentArn, agents }: { agentArn: string; agents: RegistryNode[] }) {
  if (!agentArn) return null;

  const agentExists = agents.some((agent) => agent.id === agentArn);

  if (agentExists) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-success mt-1">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 8l3 3 5-5" />
        </svg>
        Agent resolved
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-[10px] text-warning mt-1">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 1v10M8 13v1" />
        <circle cx="8" cy="8" r="6" />
      </svg>
      Agent not found in current scope — create it or verify the ARN
    </div>
  );
}

export function WorkflowInspector({ node, workflow, onUpdate, onClose, onDeleteStage }: WorkflowInspectorProps) {
  const stageData = workflow?.spec?.stages?.find((s) => s.id === node.id);
  const { listAgents } = useMcpTools();
  const [agents, setAgents] = useState<RegistryNode[]>([]);

  // Load agents for status check
  useEffect(() => {
    let mounted = true;
    listAgents().then((list) => {
      if (mounted) setAgents(list);
    });
    return () => { mounted = false; };
  }, [listAgents]);

  const [localData, setLocalData] = useState<StageNodeData>({
    ...node.data,
    ...stageData,
    retry: stageData?.execution?.retry
      ? {
          maxAttempts: stageData.execution.retry.max_attempts,
          backoffMs: stageData.execution.retry.backoff_ms,
        }
      : undefined,
  });

  const handleChange = useCallback((field: keyof StageNodeData, value: unknown) => {
    const updated = { ...localData, [field]: value };
    setLocalData(updated);
    onUpdate({ [field]: value });
  }, [localData, onUpdate]);

  return (
    <div className="w-80 border-l border-outline-variant bg-surface flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">Stage Inspector</h3>
          <p className="text-xs text-secondary font-mono mt-0.5">{node.id}</p>
        </div>
        <div className="flex items-center gap-1">
          {onDeleteStage && (
            <button
              onClick={() => {
                if (confirm(`Delete stage '${node.id}'? This will remove all connected edges.`)) {
                  onDeleteStage(node.id);
                }
              }}
              className="text-error hover:text-error/80 transition-colors text-xs px-2 py-1 rounded hover:bg-error/10"
              title="Delete stage"
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            className="text-secondary hover:text-on-surface transition-colors text-sm"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Stage ID (readonly) */}
        <div>
          <label htmlFor="inspector-stage-id" className="block text-xs font-medium text-secondary mb-1">Stage ID</label>
          <input
            id="inspector-stage-id"
            type="text"
            value={localData.id}
            readOnly
            className="w-full text-sm bg-surface-container border border-outline-variant rounded px-3 py-2 text-secondary outline-none font-mono"
          />
        </div>

        {/* Label */}
        <div>
          <label htmlFor="inspector-label" className="block text-xs font-medium text-secondary mb-1">Label</label>
          <input
            id="inspector-label"
            type="text"
            value={localData.label}
            onChange={(e) => handleChange('label', e.target.value)}
            className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="inspector-description" className="block text-xs font-medium text-secondary mb-1">Description</label>
          <textarea
            id="inspector-description"
            value={localData.description ?? ''}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={2}
            className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none"
          />
        </div>

        {/* Agent */}
        <div>
          <label htmlFor="inspector-agent" className="block text-xs font-medium text-secondary mb-1">Agent ARN</label>
          <AgentArnAutocomplete
            value={localData.agent ?? stageData?.agent ?? ''}
            onChange={(value) => handleChange('agent', value)}
          />
          <AgentArnStatus
            agentArn={localData.agent ?? stageData?.agent ?? ''}
            agents={agents}
          />
        </div>

        {/* Execution mode */}
        <div>
          <label htmlFor="inspector-execution-mode" className="block text-xs font-medium text-secondary mb-1">Execution Mode</label>
          <select
            id="inspector-execution-mode"
            value={localData.executionMode ?? stageData?.execution?.mode ?? 'sequential'}
            onChange={(e) => handleChange('executionMode', e.target.value)}
            className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-secondary outline-none focus:border-primary"
          >
            <option value="sequential">Sequential</option>
            <option value="parallel">Parallel</option>
            <option value="batch">Batch</option>
          </select>
        </div>

        {/* Dependencies */}
        <div>
          <label htmlFor="inspector-depends-on" className="block text-xs font-medium text-secondary mb-1">Depends On</label>
          <input
            id="inspector-depends-on"
            type="text"
            value={(localData.dependsOn ?? (Array.isArray(stageData?.depends_on) ? stageData.depends_on : []) ?? []).join(', ')}
            onChange={(e) =>
              handleChange(
                'dependsOn',
                e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
              )
            }
            placeholder="stage1, stage2"
            className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary font-mono"
          />
          <p className="text-[10px] text-secondary mt-1">Comma-separated stage IDs</p>
        </div>

        {/* Retry config */}
        {stageData && (
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Retry Config</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="inspector-retry-max-attempts" className="block text-[10px] text-secondary mb-0.5">Max attempts</label>
                <input
                  id="inspector-retry-max-attempts"
                  type="number"
                  min={1}
                  value={stageData.execution?.retry?.max_attempts ?? 1}
                  onChange={(e) =>
                    handleChange('retry', {
                      ...localData.retry,
                      maxAttempts: parseInt(e.target.value, 10) || 1,
                      backoffMs: localData.retry?.backoffMs ?? stageData.execution?.retry?.backoff_ms ?? 1000,
                    })
                  }
                  className="w-full text-sm bg-surface border border-outline-variant rounded px-2 py-1.5 text-on-surface outline-none focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="inspector-retry-backoff-ms" className="block text-[10px] text-secondary mb-0.5">Backoff (ms)</label>
                <input
                  id="inspector-retry-backoff-ms"
                  type="number"
                  min={0}
                  value={stageData.execution?.retry?.backoff_ms ?? 1000}
                  onChange={(e) =>
                    handleChange('retry', {
                      ...localData.retry,
                      maxAttempts: localData.retry?.maxAttempts ?? stageData.execution?.retry?.max_attempts ?? 1,
                      backoffMs: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-full text-sm bg-surface border border-outline-variant rounded px-2 py-1.5 text-on-surface outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
