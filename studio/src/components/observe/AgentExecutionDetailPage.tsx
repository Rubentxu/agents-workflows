/**
 * AgentExecutionDetailPage — /studio/projects/:projectId/observe/agent-executions/:executionId
 * Full detail view for a single agent execution.
 * Behaves like a timeline/debugger — shows observed behavior, not workflow definition.
 * "Agent Execution Graph is observed behavior and is separate from the Workflow DAG definition."
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useExecutionApi } from '@/hooks/useExecutionApi';
import type { AgentExecutionRow } from '@/types/dashboard';

type Tab = 'overview' | 'graph' | 'artifacts' | 'insights' | 'errors' | 'metrics' | 'events';

interface StageExecutionNode {
  id: string;
  stageId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  durationMs?: number;
  output?: unknown;
  error?: string;
}

interface ExecutionGraph {
  nodes: StageExecutionNode[];
  edges: Array<{ from: string; to: string }>;
}

export function AgentExecutionDetailPage() {
  const { projectId, executionId } = useParams();
  const navigate = useNavigate();
  const { listExecutions } = useExecutionApi();

  const [execution, setExecution] = useState<AgentExecutionRow | null>(null);
  const [graph, setGraph] = useState<ExecutionGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const fetchExecution = useCallback(async () => {
    if (!executionId) return;
    setLoading(true);
    setError(null);
    try {
      const all = await listExecutions({ limit: 100 });
      const exec = all.find((e) => e.id === executionId);
      if (!exec) {
        setError('Execution not found');
        return;
      }
      setExecution(exec);

      // Build mock observed graph from execution data
      // In production this would come from execution details API
      const mockGraph: ExecutionGraph = {
        nodes: [
          { id: '1', stageId: 'explore', status: 'completed', durationMs: 1200 },
          { id: '2', stageId: 'propose', status: 'completed', durationMs: 800, startedAt: exec.startedAt },
          { id: '3', stageId: 'spec', status: exec.status === 'failed' ? 'failed' : 'completed', durationMs: 3400, error: exec.status === 'failed' ? 'Spec validation error' : undefined },
          { id: '4', stageId: 'apply', status: 'pending', startedAt: undefined },
        ],
        edges: [
          { from: '1', to: '2' },
          { from: '2', to: '3' },
          { from: '3', to: '4' },
        ],
      };
      setGraph(mockGraph);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load execution');
    } finally {
      setLoading(false);
    }
  }, [executionId, listExecutions]);

  useEffect(() => { fetchExecution(); }, [fetchExecution]);

  // Build ReactFlow nodes from execution graph
  const rfNodes: Node[] = (graph?.nodes ?? []).map((n, i) => ({
    id: n.id,
    type: 'default',
    position: { x: (i % 3) * 250, y: Math.floor(i / 3) * 150 },
    data: {
      label: n.stageId,
      status: n.status,
      durationMs: n.durationMs,
      error: n.error,
    },
    style: {
      background: n.status === 'completed' ? 'rgba(34,197,94,0.1)' :
                  n.status === 'failed' ? 'rgba(239,68,68,0.1)' :
                  n.status === 'running' ? 'rgba(59,130,246,0.1)' :
                  'rgba(107,114,128,0.1)',
      border: `2px solid ${
        n.status === 'completed' ? '#22c55e' :
        n.status === 'failed' ? '#ef4444' :
        n.status === 'running' ? '#3b82f6' :
        '#6b7280'
      }`,
      borderRadius: '8px',
      padding: '12px',
      minWidth: '140px',
    },
  }));

  const rfEdges: Edge[] = (graph?.edges ?? []).map((e) => ({
    id: `${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    type: 'smoothstep',
    animated: graph?.nodes.find(n => n.id === e.to)?.status === 'running',
    style: { strokeWidth: 2 },
  }));

  const statusColor = (status: string) => ({
    completed: 'text-green-400',
    failed: 'text-red-400',
    running: 'text-blue-400',
    pending: 'text-yellow-400',
    skipped: 'text-text-muted',
  }[status] ?? 'text-text-muted');

  const formatDuration = (ms?: number) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-text-muted text-sm animate-pulse">Loading execution...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border-subtle bg-bg-elevated/30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/studio/projects/${projectId}/observe/agent-executions`)}
            className="text-text-muted hover:text-text-primary transition-colors text-sm"
          >
            ← Agent Executions
          </button>
          <div className="w-px h-4 bg-border-subtle" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-text-primary font-mono truncate max-w-md">
                {executionId}
              </h1>
              {execution && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded border capitalize ${statusColor(execution.status)} border-current`}>
                  {execution.status}
                </span>
              )}
            </div>
            {execution && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-text-muted font-mono truncate max-w-xs">{execution.workflowArn}</span>
                <span className="text-text-muted">·</span>
                <span className="text-xs text-text-muted">{execution.workspaceName}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {execution?.durationMs && (
            <span className="text-xs text-text-muted font-mono">
              {formatDuration(execution.durationMs)}
            </span>
          )}
          <button
            onClick={fetchExecution}
            className="px-3 py-1.5 text-xs border border-border-default rounded hover:bg-bg-elevated text-text-secondary"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-accent-error/10 border border-accent-error/20 rounded text-accent-error text-sm">{error}</div>
      )}

      {/* Tab nav */}
      <div className="flex px-6 border-b border-border-subtle bg-bg-elevated/20 overflow-x-auto">
        {(['overview', 'graph', 'artifacts', 'insights', 'errors', 'metrics', 'events'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview' && execution && (
          <div className="p-6 space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Status', value: execution.status },
                { label: 'Duration', value: formatDuration(execution.durationMs) },
                { label: 'Started', value: new Date(execution.startedAt).toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="bg-bg-surface border border-border-subtle rounded-lg p-4">
                  <div className="text-xs text-text-muted mb-1">{label}</div>
                  <div className="text-sm font-medium text-text-primary capitalize">{value}</div>
                </div>
              ))}
            </div>

            {/* Resource references */}
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
              <h3 className="text-xs font-semibold text-text-muted uppercase mb-3">Resource References</h3>
              <div className="space-y-2">
                {[
                  { label: 'Workflow', value: execution.workflowArn },
                  { label: 'Agent', value: execution.agentArn },
                  { label: 'Workspace', value: execution.workspaceName },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs text-text-muted w-20">{label}</span>
                    <span className="text-xs font-mono text-accent truncate">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stage timeline */}
            {graph && (
              <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
                <h3 className="text-xs font-semibold text-text-muted uppercase mb-3">Stage Timeline</h3>
                <div className="space-y-2">
                  {graph.nodes.map((node, i) => (
                    <div key={node.id} className="flex items-center gap-4">
                      {/* Connector line */}
                      <div className="w-4 flex justify-center">
                        {i < graph.nodes.length - 1 && (
                          <div className="w-px h-6 bg-border-subtle" />
                        )}
                      </div>
                      {/* Node */}
                      <div className={`flex-1 flex items-center gap-3 px-3 py-2 rounded border ${
                        node.status === 'completed' ? 'border-green-400/30 bg-green-400/5' :
                        node.status === 'failed' ? 'border-red-400/30 bg-red-400/5' :
                        node.status === 'running' ? 'border-blue-400/30 bg-blue-400/5' :
                        'border-border-subtle bg-bg-elevated/30'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${
                          node.status === 'completed' ? 'bg-green-400' :
                          node.status === 'failed' ? 'bg-red-400' :
                          node.status === 'running' ? 'bg-blue-400 animate-pulse' :
                          'bg-text-muted'
                        }`} />
                        <span className="text-sm font-medium text-text-primary flex-1">{node.stageId}</span>
                        {node.durationMs && <span className="text-xs text-text-muted font-mono">{formatDuration(node.durationMs)}</span>}
                        {node.error && <span className="text-xs text-red-400">{node.error}</span>}
                        <span className={`text-[10px] font-medium capitalize ${statusColor(node.status)}`}>{node.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'graph' && (
          <div className="h-full">
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              fitView
              className="bg-bg-canvas"
            >
              <Background gap={16} color="var(--color-border-subtle)" />
              <Controls className="!border-border-subtle !bg-bg-surface" />
              <MiniMap className="!border-border-subtle !bg-bg-surface" />
            </ReactFlow>
          </div>
        )}

        {activeTab === 'artifacts' && (
          <div className="p-6">
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
              <p className="text-text-muted text-sm">No artifacts yet.</p>
            </div>
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="p-6">
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
              <p className="text-text-muted text-sm">No insights recorded for this execution.</p>
            </div>
          </div>
        )}

        {activeTab === 'errors' && (
          <div className="p-6">
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
              <p className="text-text-muted text-sm">No errors recorded.</p>
            </div>
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="p-6">
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
              <p className="text-text-muted text-sm">Metrics view — coming soon.</p>
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="p-6">
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
              <p className="text-text-muted text-sm">Raw events — coming soon.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
