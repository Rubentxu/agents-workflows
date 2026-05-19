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
import { LoadingState } from '@/components/states/LoadingState';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
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

const STATUS_NODE_STYLES: Record<string, { bg: string; border: string }> = {
  completed: { bg: 'var(--color-success-container)', border: 'var(--color-success)' },
  failed: { bg: 'var(--color-error-container)', border: 'var(--color-color-error)' },
  running: { bg: 'var(--color-info-container)', border: 'var(--color-info)' },
  pending: { bg: 'var(--color-surface-container-high)', border: 'var(--color-outline)' },
  skipped: { bg: 'var(--color-surface-container)', border: 'var(--color-outline-variant)' },
};

const STATUS_DOT_COLORS: Record<string, string> = {
  completed: 'var(--color-success)',
  failed: 'var(--color-error)',
  running: 'var(--color-info)',
  pending: 'var(--color-warning)',
  skipped: 'var(--color-secondary)',
};

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

  const rfNodes: Node[] = (graph?.nodes ?? []).map((n, i) => {
    const style = STATUS_NODE_STYLES[n.status] ?? STATUS_NODE_STYLES.pending;
    return {
      id: n.id,
      type: 'default',
      position: { x: (i % 3) * 250, y: Math.floor(i / 3) * 150 },
      data: { label: n.stageId, status: n.status, durationMs: n.durationMs, error: n.error },
      style: {
        background: style.bg,
        border: `2px solid ${style.border}`,
        borderRadius: '8px',
        padding: '12px',
        minWidth: '140px',
      },
    };
  });

  const rfEdges: Edge[] = (graph?.edges ?? []).map((e) => ({
    id: `${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    type: 'smoothstep',
    animated: graph?.nodes.find(n => n.id === e.to)?.status === 'running',
    style: { strokeWidth: 2, stroke: 'var(--color-outline)' },
  }));

  const formatDuration = (ms?: number) => {
    if (!ms) return '\u2014';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="w-full max-w-2xl">
          <LoadingState type="detail" />
        </div>
      </div>
    );
  }

  if (error && !execution) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="w-full max-w-2xl">
          <ErrorState
            title="Failed to load execution"
            message={error}
            onRetry={fetchExecution}
          />
        </div>
      </div>
    );
  }

  const statusColorForExec = (status: string) =>
    STATUS_DOT_COLORS[status] ?? STATUS_DOT_COLORS.skipped;

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-6 py-3"
        style={{
          borderBottom: '1px solid var(--color-outline-variant)',
          background: 'var(--color-surface-container-low)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/studio/projects/${projectId}/observe/agent-executions`)}
            className="text-sm transition-colors"
            style={{ color: 'var(--color-secondary)' }}
          >
            &larr; Agent Executions
          </button>
          <div style={{ width: '1px', height: '16px', background: 'var(--color-outline-variant)' }} />
          <div>
            <div className="flex items-center gap-2">
              <h1
                className="text-base font-semibold font-mono truncate max-w-md"
                style={{ color: 'var(--color-on-surface)' }}
              >
                {executionId}
              </h1>
              {execution && (
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded capitalize"
                  style={{
                    color: statusColorForExec(execution.status),
                    border: `1px solid ${statusColorForExec(execution.status)}`,
                  }}
                >
                  {execution.status}
                </span>
              )}
            </div>
            {execution && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono truncate max-w-xs" style={{ color: 'var(--color-secondary)' }}>
                  {execution.workflowArn}
                </span>
                <span style={{ color: 'var(--color-outline)' }}>&middot;</span>
                <span className="text-xs" style={{ color: 'var(--color-secondary)' }}>
                  {execution.workspaceName}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {execution?.durationMs && (
            <span className="text-xs font-mono" style={{ color: 'var(--color-secondary)' }}>
              {formatDuration(execution.durationMs)}
            </span>
          )}
          <button
            onClick={fetchExecution}
            className="px-3 py-1.5 text-xs rounded transition-colors"
            style={{ border: '1px solid var(--color-outline)', color: 'var(--color-on-surface)' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4">
          <ErrorState title="Error" message={error} onRetry={fetchExecution} />
        </div>
      )}

      <div
        className="flex px-6 overflow-x-auto"
        style={{
          borderBottom: '1px solid var(--color-outline-variant)',
          background: 'var(--color-surface-container-low)',
        }}
      >
        {(['overview', 'graph', 'artifacts', 'insights', 'errors', 'metrics', 'events'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
            style={{
              borderBottomColor: activeTab === tab ? 'var(--color-primary)' : 'transparent',
              color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-secondary)',
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'overview' && execution && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Status', value: execution.status },
                { label: 'Duration', value: formatDuration(execution.durationMs) },
                { label: 'Started', value: new Date(execution.startedAt).toLocaleString() },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-lg p-4"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                >
                  <div className="text-xs mb-1" style={{ color: 'var(--color-secondary)' }}>{label}</div>
                  <div className="text-sm font-medium capitalize" style={{ color: 'var(--color-on-surface)' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div
              className="rounded-lg p-4"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
            >
              <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--color-secondary)' }}>
                Resource References
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Workflow', value: execution.workflowArn },
                  { label: 'Agent', value: execution.agentArn },
                  { label: 'Workspace', value: execution.workspaceName },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs w-20" style={{ color: 'var(--color-secondary)' }}>{label}</span>
                    <span className="text-xs font-mono truncate" style={{ color: 'var(--color-primary)' }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {graph && (
              <div
                className="rounded-lg p-4"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
              >
                <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--color-secondary)' }}>
                  Stage Timeline
                </h3>
                <div className="space-y-2">
                  {graph.nodes.map((node, i) => {
                    const ns = STATUS_NODE_STYLES[node.status] ?? STATUS_NODE_STYLES.pending;
                    return (
                      <div key={node.id} className="flex items-center gap-4">
                        <div className="w-4 flex justify-center">
                          {i < graph.nodes.length - 1 && (
                            <div style={{ width: '1px', height: '24px', background: 'var(--color-outline-variant)' }} />
                          )}
                        </div>
                        <div
                          className="flex-1 flex items-center gap-3 px-3 py-2 rounded"
                          style={{
                            border: `1px solid ${ns.border}`,
                            background: ns.bg,
                          }}
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${node.status === 'running' ? 'animate-pulse' : ''}`}
                            style={{ background: STATUS_DOT_COLORS[node.status] ?? STATUS_DOT_COLORS.skipped }}
                          />
                          <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-on-surface)' }}>
                            {node.stageId}
                          </span>
                          {node.durationMs && (
                            <span className="text-xs font-mono" style={{ color: 'var(--color-secondary)' }}>
                              {formatDuration(node.durationMs)}
                            </span>
                          )}
                          {node.error && (
                            <span className="text-xs" style={{ color: 'var(--color-error)' }}>{node.error}</span>
                          )}
                          <span
                            className="text-[10px] font-medium capitalize"
                            style={{ color: STATUS_DOT_COLORS[node.status] ?? STATUS_DOT_COLORS.skipped }}
                          >
                            {node.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'graph' && (
          <div className="h-full" style={{ background: 'var(--color-background)' }}>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              fitView
            >
              <Background gap={16} color="var(--color-outline-variant)" />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>
        )}

        {activeTab === 'artifacts' && (
          <div className="p-6">
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M7 6h6M7 9h6M7 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              title="No artifacts yet"
              description="Artifacts produced during execution stages will appear here."
            />
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="p-6">
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 7v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              title="No insights recorded"
              description="Insights from this execution's stages will appear here once available."
            />
          </div>
        )}

        {activeTab === 'errors' && (
          <div className="p-6">
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="13.5" r="0.75" fill="currentColor" />
                </svg>
              }
              title="No errors recorded"
              description="This execution completed without errors."
            />
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="p-6">
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 16V8M8 16V4M12 16V10M16 16V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              title="Metrics coming soon"
              description="Execution-level metrics visualization is under development."
            />
          </div>
        )}

        {activeTab === 'events' && (
          <div className="p-6">
            <EmptyState
              icon={
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 5h12M4 10h12M4 15h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              title="Raw events coming soon"
              description="A raw event timeline for this execution is under development."
            />
          </div>
        )}
      </div>
    </div>
  );
}
