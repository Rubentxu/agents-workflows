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

import { useCallback, useEffect, useState } from 'react';
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
import { useMcpTools } from '@/hooks/useMcpTools';
import { LoadingState } from '@/components/states/LoadingState';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';

type NodeKind = 'workflow' | 'agent' | 'skill' | 'prompt' | 'tool' | 'template' | 'execution' | 'artifact' | 'stage' | 'insight';

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
  workflow: { bg: 'color-mix(in srgb, var(--color-primary) 10%, transparent)', border: 'var(--color-primary)', text: 'text-primary' },
  agent: { bg: 'color-mix(in srgb, var(--color-secondary) 10%, transparent)', border: 'var(--color-secondary)', text: 'text-secondary' },
  skill: { bg: 'color-mix(in srgb, var(--color-success) 10%, transparent)', border: 'var(--color-success)', text: 'text-success' },
  prompt: { bg: 'color-mix(in srgb, var(--color-info) 10%, transparent)', border: 'var(--color-info)', text: 'text-info' },
  tool: { bg: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', border: 'var(--color-warning)', text: 'text-warning' },
  template: { bg: 'color-mix(in srgb, var(--color-info) 10%, transparent)', border: 'var(--color-info)', text: 'text-info' },
  execution: { bg: 'color-mix(in srgb, var(--color-warning) 10%, transparent)', border: 'var(--color-warning)', text: 'text-warning' },
  artifact: { bg: 'color-mix(in srgb, #14B8A6 10%, transparent)', border: '#14B8A6', text: 'text-[color:#14B8A6]' },
  stage: { bg: 'color-mix(in srgb, #64748B 10%, transparent)', border: '#64748B', text: 'text-[color:#64748B]' },
  insight: { bg: 'color-mix(in srgb, #EC4899 10%, transparent)', border: '#EC4899', text: 'text-[color:#EC4899]' },
};

export function DependenciesPage() {
  const { projectId } = useParams();
  const { listNodes, listEdges: fetchEdges } = useMcpTools();
  const [selectedNode, setSelectedNode] = useState<DepNode | null>(null);
  const [nodes, setNodes] = useState<DepNode[]>([]);
  const [edges, setEdges] = useState<DepEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
        try {
          const [registryNodes, registryEdges] = await Promise.all([
            listNodes(undefined, { throwOnError: true }),
            fetchEdges(undefined, { throwOnError: true }),
          ]);

        if (cancelled) return;

        // Map RegistryNode[] → DepNode[]
        const kindMap: Record<string, NodeKind> = {
          workflow: 'workflow',
          agent: 'agent',
          skill: 'skill',
          prompt: 'prompt',
          tool: 'tool',
          template: 'template',
          execution: 'execution',
          artifact: 'artifact',
          stage: 'stage',
          insight: 'insight',
        };
        const mappedNodes: DepNode[] = registryNodes.map((rn) => {
          const kind = kindMap[rn.type] ?? 'workflow';
          return {
            id: rn.id,
            name: rn.name,
            kind,
            arn: rn.id,
          };
        });

        // Map edges response → DepEdge[]
        const mappedEdges: DepEdge[] = registryEdges.map((re) => ({
          from: re.from_id,
          to: re.to_id,
          label: re.relationship_type,
        }));

        setNodes(mappedNodes);
        setEdges(mappedEdges);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dependencies');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [listNodes, fetchEdges]);

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
    stage: 'Stage', insight: 'Insight',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">Dependencies</h1>
          <p className="text-sm text-secondary mt-0.5">
            {projectId ? `Project: ${projectId}` : 'Registry'} — {nodes.length} resources, {edges.length} relationships
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4">
          {Object.entries(KIND_COLORS).map(([kind, colors]) => (
            <div key={kind} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: colors.bg, border: `1.5px solid ${colors.border}` }} />
              <span className={`text-[10px] ${colors.text}`}>{kindLabel[kind as NodeKind]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <LoadingState type="detail" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-2xl">
              <ErrorState title="Failed to load dependencies" message={error} />
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="13.5" r="0.75" fill="currentColor" />
                </svg>
              }
              title="No dependency data"
              description="No registry nodes or edges found. Add resources to the registry to see dependencies."
            />
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden mt-4 min-h-[640px]">
            {/* Graph */}
            <div className="flex-1 min-h-[640px]">
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                onNodeClick={handleNodeClick}
                fitView
                className="bg-background"
              >
                <Background gap={20} color="var(--color-border-subtle)" />
                <Controls className="!border-outline-variant !bg-surface" />
                <MiniMap
                  className="!border-outline-variant !bg-surface"
                  nodeColor={(n) => {
                    const depNode = nodes.find((dn) => dn.id === n.id);
                    if (!depNode) return 'var(--color-secondary)';
                    return KIND_COLORS[depNode.kind].border;
                  }}
                />
              </ReactFlow>
            </div>

            {/* Detail panel */}
            {selectedNode && (
              <div className="w-72 border-l border-outline-variant bg-surface flex flex-col overflow-hidden min-h-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full`} style={{ background: KIND_COLORS[selectedNode.kind].border }} />
                    <span className={`text-xs font-medium ${KIND_COLORS[selectedNode.kind].text}`}>
                      {kindLabel[selectedNode.kind]}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-secondary hover:text-on-surface text-sm transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-4">
                  <div>
                    <div className="text-xs text-secondary mb-1">Name</div>
                    <div className="text-sm font-medium text-on-surface">{selectedNode.name}</div>
                  </div>

                  <div>
                    <div className="text-xs text-secondary mb-1">ARN</div>
                    <div className="text-xs font-mono text-secondary bg-surface-container rounded px-2 py-1.5 break-all">
                      {selectedNode.arn}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-secondary mb-1">Type</div>
                    <div className="text-sm text-on-surface">{kindLabel[selectedNode.kind]}</div>
                  </div>

                  {/* Inbound dependencies */}
                  <div>
                    <div className="text-xs text-secondary mb-2">Inbound ({edges.filter(e => e.to === selectedNode.id).length})</div>
                    <div className="space-y-1">
                      {edges.filter(e => e.to === selectedNode.id).map((e) => {
                        const src = nodes.find(n => n.id === e.from);
                        return (
                          <div key={`${e.from}-${e.to}`} className="flex items-center gap-2 text-xs">
                            <span className="text-secondary font-mono truncate max-w-[120px]">{src?.name}</span>
                            {e.label && <span className="text-secondary">→ {e.label}</span>}
                          </div>
                        );
                      })}
                      {edges.filter(e => e.to === selectedNode.id).length === 0 && (
                        <div className="text-xs text-secondary italic">None</div>
                      )}
                    </div>
                  </div>

                  {/* Outbound dependencies */}
                  <div>
                    <div className="text-xs text-secondary mb-2">Outbound ({edges.filter(e => e.from === selectedNode.id).length})</div>
                    <div className="space-y-1">
                      {edges.filter(e => e.from === selectedNode.id).map((e) => {
                        const tgt = nodes.find(n => n.id === e.to);
                        return (
                          <div key={`${e.from}-${e.to}`} className="flex items-center gap-2 text-xs">
                            <span className="text-secondary font-mono truncate max-w-[120px]">{tgt?.name}</span>
                            {e.label && <span className="text-secondary">→ {e.label}</span>}
                          </div>
                        );
                      })}
                      {edges.filter(e => e.from === selectedNode.id).length === 0 && (
                        <div className="text-xs text-secondary italic">None</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
