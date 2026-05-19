/**
 * DependenciesPage — /studio/projects/:projectId/registry/dependencies
 * Shows a graph of resource relationships by ARN.
 *
 * Dependencies include:
 * - Workflows to Agents
 * - Workflows to Skills, Prompts, and Tools where applicable
 * - Agents to Prompts, Skills, and Tools
 * - Templates to target resource kinds
 * - Overrides to origin resources
 * - Agent Executions to used resource ARNs
 * - Artifacts to Agent Executions
 * - Insights to Agent Executions and stages
 */

import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

type NodeKind = 'workflow' | 'agent' | 'skill' | 'prompt' | 'tool' | 'template' | 'execution' | 'artifact';

interface DepNode {
  id: string;
  name: string;
  kind: NodeKind;
  arn: string;
}

interface DepEdge {
  from: string;
  to: string;
  label?: string;
}

const KIND_COLORS: Record<NodeKind, { bg: string; border: string; text: string }> = {
  workflow: { bg: 'rgba(59,130,246,0.1)', border: '#3b82f6', text: 'text-blue-400' },
  agent: { bg: 'rgba(168,85,247,0.1)', border: '#a855f7', text: 'text-purple-400' },
  skill: { bg: 'rgba(34,197,94,0.1)', border: '#22c55e', text: 'text-green-400' },
  prompt: { bg: 'rgba(59,130,246,0.1)', border: '#3b82f6', text: 'text-blue-400' },
  tool: { bg: 'rgba(249,115,22,0.1)', border: '#f97316', text: 'text-orange-400' },
  template: { bg: 'rgba(6,182,212,0.1)', border: '#06b6d4', text: 'text-cyan-400' },
  execution: { bg: 'rgba(234,179,8,0.1)', border: '#eab308', text: 'text-yellow-400' },
  artifact: { bg: 'rgba(236,72,153,0.1)', border: '#ec4899', text: 'text-pink-400' },
};

export function DependenciesPage() {
  const { projectId } = useParams();
  const [selectedNode, setSelectedNode] = useState<DepNode | null>(null);

  // Mock dependency data — in production, fetched from MCP/registry
  const [nodes] = useState<DepNode[]>([
    { id: 'wf-1', name: 'sdd-full', kind: 'workflow', arn: 'arn:local:global:workflow/sdd-full' },
    { id: 'wf-2', name: 'quick-test', kind: 'workflow', arn: 'arn:local:project/app:workflow/quick-test' },
    { id: 'ag-1', name: 'orchestrator', kind: 'agent', arn: 'arn:local:global:agent/orchestrator' },
    { id: 'ag-2', name: 'coder', kind: 'agent', arn: 'arn:local:global:agent/coder' },
    { id: 'sk-1', name: 'sdd-explore', kind: 'skill', arn: 'arn:local:global:skill/sdd-explore' },
    { id: 'sk-2', name: 'sdd-apply', kind: 'skill', arn: 'arn:local:global:skill/sdd-apply' },
    { id: 'pr-1', name: 'system-prompt', kind: 'prompt', arn: 'arn:local:global:prompt/system-prompt' },
    { id: 'pr-2', name: 'review-prompt', kind: 'prompt', arn: 'arn:local:global:prompt/review-prompt' },
    { id: 'tl-1', name: 'filesystem', kind: 'tool', arn: 'arn:local:global:tool/filesystem' },
    { id: 'ex-1', name: 'exec-001', kind: 'execution', arn: 'arn:local:workspace/abc:execution/run-001' },
    { id: 'ar-1', name: 'report.md', kind: 'artifact', arn: 'arn:local:workspace/abc:artifact/report' },
  ]);

  const [edges] = useState<DepEdge[]>([
    { from: 'wf-1', to: 'ag-1', label: 'uses' },
    { from: 'wf-1', to: 'sk-1', label: 'requires' },
    { from: 'wf-1', to: 'sk-2', label: 'requires' },
    { from: 'wf-2', to: 'ag-2', label: 'uses' },
    { from: 'ag-1', to: 'pr-1', label: 'prompt' },
    { from: 'ag-1', to: 'sk-1', label: 'skill' },
    { from: 'ag-1', to: 'tl-1', label: 'tool' },
    { from: 'ag-2', to: 'pr-2', label: 'prompt' },
    { from: 'ag-2', to: 'sk-2', label: 'skill' },
    { from: 'ex-1', to: 'wf-1', label: 'workflow' },
    { from: 'ex-1', to: 'ag-1', label: 'agent' },
    { from: 'ar-1', to: 'ex-1', label: 'produced_by' },
  ]);

  const rfNodes: Node[] = nodes.map((n, i) => {
    const colors = KIND_COLORS[n.kind];
    return {
      id: n.id,
      type: 'default',
      position: {
        x: (i % 4) * 280 + 50,
        y: Math.floor(i / 4) * 180 + 50,
      },
      data: { label: n.name, kind: n.kind, arn: n.arn },
      style: {
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: '8px',
        padding: '12px 16px',
        minWidth: '140px',
      },
    };
  });

  const rfEdges: Edge[] = edges.map((e) => ({
    id: `${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    label: e.label,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
    style: { strokeWidth: 1.5 },
  }));

  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    const depNode = nodes.find((n) => n.id === node.id);
    setSelectedNode(depNode ?? null);
  }, [nodes]);

  const kindLabel: Record<NodeKind, string> = {
    workflow: 'Workflow', agent: 'Agent', skill: 'Skill', prompt: 'Prompt',
    tool: 'Tool', template: 'Template', execution: 'Execution', artifact: 'Artifact',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Dependencies</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {projectId ? `Project: ${projectId}` : 'Registry'} — {nodes.length} resources, {edges.length} relationships
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4">
          {Object.entries(KIND_COLORS).slice(0, 7).map(([kind, colors]) => (
            <div key={kind} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: colors.bg, border: `1.5px solid ${colors.border}` }} />
              <span className={`text-[10px] ${colors.text}`}>{kindLabel[kind as NodeKind]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph */}
        <div className="flex-1">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodeClick={handleNodeClick}
            fitView
            className="bg-bg-canvas"
          >
            <Background gap={20} color="var(--color-border-subtle)" />
            <Controls className="!border-border-subtle !bg-bg-surface" />
            <MiniMap
              className="!border-border-subtle !bg-bg-surface"
              nodeColor={(n) => {
                const depNode = nodes.find((dn) => dn.id === n.id);
                if (!depNode) return '#6b7280';
                return KIND_COLORS[depNode.kind].border;
              }}
            />
          </ReactFlow>
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <div className="w-72 border-l border-border-subtle bg-bg-surface flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full`} style={{ background: KIND_COLORS[selectedNode.kind].border }} />
                <span className={`text-xs font-medium ${KIND_COLORS[selectedNode.kind].text}`}>
                  {kindLabel[selectedNode.kind]}
                </span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-text-muted hover:text-text-primary text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div>
                <div className="text-xs text-text-muted mb-1">Name</div>
                <div className="text-sm font-medium text-text-primary">{selectedNode.name}</div>
              </div>

              <div>
                <div className="text-xs text-text-muted mb-1">ARN</div>
                <div className="text-xs font-mono text-text-secondary bg-bg-elevated rounded px-2 py-1.5 break-all">
                  {selectedNode.arn}
                </div>
              </div>

              <div>
                <div className="text-xs text-text-muted mb-1">Type</div>
                <div className="text-sm text-text-primary">{kindLabel[selectedNode.kind]}</div>
              </div>

              {/* Inbound dependencies */}
              <div>
                <div className="text-xs text-text-muted mb-2">Inbound ({edges.filter(e => e.to === selectedNode.id).length})</div>
                <div className="space-y-1">
                  {edges.filter(e => e.to === selectedNode.id).map((e) => {
                    const src = nodes.find(n => n.id === e.from);
                    return (
                      <div key={`${e.from}-${e.to}`} className="flex items-center gap-2 text-xs">
                        <span className="text-text-muted font-mono truncate max-w-[120px]">{src?.name}</span>
                        {e.label && <span className="text-text-muted">→ {e.label}</span>}
                      </div>
                    );
                  })}
                  {edges.filter(e => e.to === selectedNode.id).length === 0 && (
                    <div className="text-xs text-text-muted italic">None</div>
                  )}
                </div>
              </div>

              {/* Outbound dependencies */}
              <div>
                <div className="text-xs text-text-muted mb-2">Outbound ({edges.filter(e => e.from === selectedNode.id).length})</div>
                <div className="space-y-1">
                  {edges.filter(e => e.from === selectedNode.id).map((e) => {
                    const tgt = nodes.find(n => n.id === e.to);
                    return (
                      <div key={`${e.from}-${e.to}`} className="flex items-center gap-2 text-xs">
                        <span className="text-text-muted font-mono truncate max-w-[120px]">{tgt?.name}</span>
                        {e.label && <span className="text-text-muted">→ {e.label}</span>}
                      </div>
                    );
                  })}
                  {edges.filter(e => e.from === selectedNode.id).length === 0 && (
                    <div className="text-xs text-text-muted italic">None</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
