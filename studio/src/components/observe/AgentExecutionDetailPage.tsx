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
import { mcpRequest, parseToolResult } from '@/hooks/mcpClient';
import { LoadingState } from '@/components/states/LoadingState';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import type { AgentExecutionRow } from '@/types/dashboard';
import { ExecutionTimeline, type StageExecution } from './ExecutionTimeline';
import { LogViewer, type LogEntry } from './LogViewer';
import { SystemHealthPanel } from './SystemHealthPanel';

type Tab = 'overview' | 'graph' | 'timeline' | 'logs' | 'artifacts' | 'insights' | 'errors' | 'metrics' | 'events';

interface StageExecutionNode {
  id: string;
  stageId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
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
  failed: { bg: 'var(--color-error-container)', border: 'var(--color-error)' },
  running: { bg: 'var(--color-info-container)', border: 'var(--color-info)' },
  pending: { bg: 'var(--color-surface-container-high)', border: 'var(--color-outline)' },
  skipped: { bg: 'var(--color-surface-container)', border: 'var(--color-outline-variant)' },
};

const STATUS_DOT_COLORS: Record<string, string> = {
  completed: 'var(--color-success)',
  failed: 'var(--color-error)',
  running: 'var(--color-info)',
  pending: 'var(--color-warning)',
  aborted: 'var(--color-secondary)',
  paused: 'var(--color-tertiary)',
  skipped: 'var(--color-secondary)',
};

function deriveExecutionLogs(
  detail: Awaited<ReturnType<ReturnType<typeof useExecutionApi>['getExecution']>>,
  fallbackStartedAt: string,
  fallbackUpdatedAt: string,
): LogEntry[] {
  if (!detail) return [];

  const startedAt = detail.started_at ?? fallbackStartedAt;
  const updatedAt = detail.completed_at ?? fallbackUpdatedAt;
  const stageOutputs = detail.stage_outputs ?? {};
  const logs: LogEntry[] = [];

  if (detail.started_at) {
    logs.push({
      timestamp: startedAt,
      level: 'info',
      message: 'Execution started',
    });
  }

  for (const stageId of detail.completed_stages ?? []) {
    logs.push({
      timestamp: updatedAt,
      level: 'info',
      message: 'Stage completed',
      stage: stageId,
    });
  }

  if (detail.current_stage) {
    logs.push({
      timestamp: updatedAt,
      level: 'info',
      message: 'Stage running',
      stage: detail.current_stage,
    });
  }

  for (const [stageId, output] of Object.entries(stageOutputs)) {
    if (!output || typeof output !== 'object' || !('error' in output)) continue;
    const error = (output as { error?: unknown }).error;
    logs.push({
      timestamp: updatedAt,
      level: 'error',
      message: typeof error === 'string' && error.length > 0 ? error : 'Stage failed',
      stage: stageId,
    });
  }

  return logs;
}

export function AgentExecutionDetailPage() {
  const { projectId, executionId } = useParams();
  const navigate = useNavigate();
  const { listExecutions, getExecution } = useExecutionApi();

  const [execution, setExecution] = useState<AgentExecutionRow | null>(null);
  const [graph, setGraph] = useState<ExecutionGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading] = useState(false);

  const fetchExecution = useCallback(async () => {
    if (!executionId) return;
    setLoading(true);
    setError(null);
    try {
      const execDetail = await getExecution(executionId);
      const exec = execDetail
        ? {
            id: execDetail.arn,
            agentArn: execDetail.arn,
            workflowArn: execDetail.workflow_arn,
            workspaceName: execDetail.workspace_id,
            status: (execDetail.status ?? 'pending') as AgentExecutionRow['status'],
            durationMs:
              execDetail.started_at && execDetail.completed_at
                ? Math.max(new Date(execDetail.completed_at).getTime() - new Date(execDetail.started_at).getTime(), 0)
                : undefined,
            startedAt: execDetail.started_at ?? new Date(0).toISOString(),
            updatedAt: execDetail.completed_at ?? execDetail.started_at ?? new Date(0).toISOString(),
          }
        : (await listExecutions({ limit: 100 })).find((e) => e.id === executionId);
      if (!exec) {
        setError('Execution not found');
        return;
      }
      setExecution(exec);

      try {
        const detail = execDetail ?? await getExecution(executionId);
        if (!detail) {
          setGraph(null);
          return;
        }
        const completedStages: string[] = detail.completed_stages ?? [];
        const pendingStages: string[] = detail.pending_stages ?? [];
        const currentStage = detail.current_stage;
        const stageOutputs = detail.stage_outputs ?? {};

        setLogs(deriveExecutionLogs(detail, exec.startedAt, exec.updatedAt));

        // Fetch workflow DAG via MCP
        let dagNodes: Array<{ id: string; stage: string; depends_on: string[] }> = [];
        let dagEdges: Array<{ from: string; to: string }> = [];
        try {
          const dagResult = await mcpRequest('tools/call', {
            name: 'workflow_get_dag',
            arguments: { arn: exec.workflowArn },
          }) as { content?: { text: string }[] };
          const dag = parseToolResult(dagResult, '{}') as {
            nodes?: Array<{ id: string; stage: string; depends_on: string[] }>;
            edges?: Array<{ from: string; to: string }>;
          };
          dagNodes = dag?.nodes ?? [];
          dagEdges = dag?.edges ?? [];
        } catch {
          // DAG fetch failed — will show empty graph
        }

        if (dagNodes.length > 0) {
          // Build graph from DAG + execution data
          const realGraph: ExecutionGraph = {
            nodes: dagNodes.map((n) => {
              let status: StageExecutionNode['status'] = 'pending';
              if (completedStages.includes(n.stage)) {
                status = 'completed';
              } else if (pendingStages.includes(n.stage)) {
                status = 'pending';
              } else if (currentStage === n.stage) {
                status = 'running';
              }
              // Check for failed status from stage outputs
              const output = stageOutputs[n.stage];
              const hasError = output && typeof output === 'object' && 'error' in (output as Record<string, unknown>);
              if (hasError && status !== 'completed') {
                status = 'failed';
              }
              return {
                id: n.id,
                stageId: n.stage,
                status,
              };
            }),
            edges: dagEdges.map((e) => ({ from: e.from, to: e.to })),
          };
          setGraph(realGraph);
        } else {
          // No DAG data available — leave graph as null for empty state
          setGraph(null);
        }
      } catch {
        // Execution detail MCP call failed — leave graph as null for empty state
        setGraph(null);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load execution');
    } finally {
      setLoading(false);
    }
  }, [executionId, listExecutions, getExecution]);

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

  const stages: StageExecution[] = (graph?.nodes ?? []).map((n) => ({
    id: n.id,
    stageId: n.stageId,
    status: n.status,
    startedAt: n.startedAt,
    completedAt: n.completedAt,
    durationMs: n.durationMs,
    error: n.error,
  }));

  const selectedStageData = stages.find((s) => s.stageId === selectedStage || s.id === selectedStage);

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
    <div className="flex flex-col h-full" data-testid="execution-detail">
      <div
        className="flex items-center justify-between px-6 py-3"
        data-testid="execution-detail-header"
        style={{
          borderBottom: '1px solid var(--color-outline-variant)',
          background: 'var(--color-surface-container-low)',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/studio/projects/${projectId}/observe/agent-executions`)}
            data-testid="execution-detail-back"
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
          {execution?.startedAt && (
            <span className="text-xs font-mono" style={{ color: 'var(--color-secondary)' }}>
              Started {new Date(execution.startedAt).toLocaleString()}
            </span>
          )}
          {execution?.updatedAt && execution.updatedAt !== execution.startedAt && (
            <span className="text-xs font-mono" style={{ color: 'var(--color-secondary)' }}>
              Completed {new Date(execution.updatedAt).toLocaleString()}
            </span>
          )}
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
        data-testid="execution-detail-tabs"
        style={{
          borderBottom: '1px solid var(--color-outline-variant)',
          background: 'var(--color-surface-container-low)',
        }}
      >
        {(['overview', 'graph', 'timeline', 'logs', 'artifacts', 'insights', 'errors', 'metrics', 'events'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            data-testid={`execution-detail-tab-${tab}`}
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

      <div className="flex-1 overflow-auto" data-testid="execution-detail-content">
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
            {graph === null ? (
              <div className="flex items-center justify-center h-full p-6">
                <EmptyState
                  icon={
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M10 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="10" cy="13.5" r="0.75" fill="currentColor" />
                    </svg>
                  }
                  title="No execution graph data"
                  description="Execution DAG data is not available for this execution. The workflow may not have a DAG definition, or the data has not been generated yet."
                />
              </div>
            ) : rfNodes.length === 0 ? (
              <div className="flex items-center justify-center h-full p-6">
                <EmptyState
                  icon={
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M7 6h6M7 9h6M7 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  }
                  title="No stages in graph"
                  description="The workflow DAG has no stages to display."
                />
              </div>
            ) : (
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                fitView
              >
                <Background gap={16} color="var(--color-outline-variant)" />
                <Controls />
                <MiniMap />
              </ReactFlow>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="flex h-full">
            <div style={{ flex: 1, overflow: 'auto' }}>
              <ExecutionTimeline
                stages={stages}
                currentStage={selectedStage ?? undefined}
                onStageClick={(stageId) => setSelectedStage(stageId)}
              />
            </div>
            {selectedStageData && (
              <div
                style={{
                  width: '320px',
                  borderLeft: '1px solid var(--color-outline-variant)',
                  background: 'var(--color-surface)',
                  padding: '16px',
                  overflow: 'auto',
                }}
              >
                <h4
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--color-on-surface)',
                    marginBottom: '16px',
                  }}
                >
                  Stage Details
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--color-secondary)' }}>Name</div>
                    <div className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
                      {selectedStageData.stageId}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--color-secondary)' }}>Status</div>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded capitalize"
                      style={{
                        color: STATUS_DOT_COLORS[selectedStageData.status],
                        border: `1px solid ${STATUS_DOT_COLORS[selectedStageData.status]}`,
                      }}
                    >
                      {selectedStageData.status}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--color-secondary)' }}>Duration</div>
                    <div className="text-sm font-mono" style={{ color: 'var(--color-on-surface)' }}>
                      {formatDuration(selectedStageData.durationMs)}
                    </div>
                  </div>
                  {selectedStageData.startedAt && (
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'var(--color-secondary)' }}>Started</div>
                      <div className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                        {new Date(selectedStageData.startedAt).toLocaleString()}
                      </div>
                    </div>
                  )}
                  {selectedStageData.completedAt && (
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'var(--color-secondary)' }}>Completed</div>
                      <div className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                        {new Date(selectedStageData.completedAt).toLocaleString()}
                      </div>
                    </div>
                  )}
                  {selectedStageData.error && (
                    <div>
                      <div className="text-xs mb-1" style={{ color: 'var(--color-error)' }}>Error</div>
                      <div
                        style={{
                          padding: '8px',
                          borderRadius: '4px',
                          background: 'var(--color-error-container)',
                          border: '1px solid var(--color-error)',
                          fontSize: '12px',
                          color: 'var(--color-error)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {selectedStageData.error}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedStage(null)}
                  style={{
                    marginTop: '16px',
                    width: '100%',
                    padding: '8px',
                    borderRadius: '4px',
                    border: '1px solid var(--color-outline)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-on-surface)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div style={{ height: '100%' }}>
            {logs.length > 0 ? (
              <LogViewer
                executionId={executionId ?? ''}
                logs={logs}
                loading={logsLoading}
              />
            ) : (
              <div className="p-6">
                <EmptyState
                  icon={
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M6 8h8M6 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  }
                  title="No logs available for this execution"
                  description="This execution does not expose stage log data."
                />
              </div>
            )}
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
            {graph?.nodes.some((n) => n.status === 'failed') ? (
              <div className="space-y-4">
                {graph.nodes
                  .filter((n) => n.status === 'failed')
                  .map((node) => (
                    <div
                      key={node.id}
                      style={{
                        padding: '16px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--color-error-container)',
                        border: '1px solid var(--color-error)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: 'var(--color-error)',
                          }}
                        />
                        <span
                          className="text-sm font-semibold"
                          style={{ color: 'var(--color-error)' }}
                        >
                          {node.stageId}
                        </span>
                      </div>
                      {node.error && (
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            color: 'var(--color-error)',
                          }}
                        >
                          {node.error}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
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
            )}
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="p-6">
            <SystemHealthPanel />
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
