/**
 * AgentExecutionListPage — /studio/projects/:projectId/observe/agent-executions
 * Lists recent agent executions with status filters.
 * "Recent activity on dashboards should be labeled `Recent Agent Executions`."
 */

import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExecutionApi } from '@/hooks/useExecutionApi';
import type { AgentExecutionRow } from '@/types/dashboard';

type StatusFilter = 'all' | 'running' | 'completed' | 'failed';

export function AgentExecutionListPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { listExecutions } = useExecutionApi();

  const [executions, setExecutions] = useState<AgentExecutionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const fetchExecutions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listExecutions({ limit: 50 });
      setExecutions(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load executions');
    } finally {
      setLoading(false);
    }
  }, [listExecutions]);

  const filtered = statusFilter === 'all'
    ? executions
    : executions.filter((e) => e.status === statusFilter);

  const statusBadge = (status: AgentExecutionRow['status']) => {
    const styles: Record<typeof status, string> = {
      running: 'text-blue-400 border-blue-400/30',
      completed: 'text-green-400 border-green-400/30',
      failed: 'text-red-400 border-red-400/30',
      pending: 'text-yellow-400 border-yellow-400/30',
      cancelled: 'text-text-muted border-border-default',
    };
    return (
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Agent Executions</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {projectId ? `Project: ${projectId}` : 'Observe'} — {filtered.length} executions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Status filter */}
          <div className="flex items-center gap-1 bg-bg-surface border border-border-subtle rounded p-0.5">
            {(['all', 'running', 'completed', 'failed'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize ${
                  statusFilter === f ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={fetchExecutions}
            disabled={loading}
            className="px-3 py-1.5 text-xs border border-border-default rounded hover:bg-bg-elevated transition-colors text-text-secondary"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 p-4 bg-accent-error/10 border border-accent-error/20 rounded text-accent-error text-sm">{error}</div>
        )}

        {loading && executions.length === 0 ? (
          <div className="text-center text-text-muted text-sm animate-pulse py-8">Loading executions...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
            <p className="text-text-muted text-sm">No executions found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((exec) => (
              <div
                key={exec.id}
                onClick={() => navigate(`/studio/projects/${projectId}/observe/agent-executions/${encodeURIComponent(exec.id)}`)}
                className="flex items-center gap-4 px-4 py-3 bg-bg-surface border border-border-subtle rounded-lg hover:border-accent/50 hover:bg-bg-elevated/50 transition-all cursor-pointer group"
              >
                {/* Status icon */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  exec.status === 'running' ? 'bg-blue-400 animate-pulse' :
                  exec.status === 'completed' ? 'bg-green-400' :
                  exec.status === 'failed' ? 'bg-red-400' :
                  'bg-text-muted'
                }`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors truncate">
                      {exec.workflowArn.split('/').pop() ?? exec.workflowArn}
                    </span>
                    {statusBadge(exec.status)}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="font-mono text-xs text-text-muted truncate">{exec.workflowArn}</span>
                    <span className="text-text-muted">·</span>
                    <span className="text-xs text-text-muted">{exec.agentArn.split('/').pop()}</span>
                  </div>
                </div>

                {/* Workspace */}
                <div className="text-xs text-text-muted flex-shrink-0">
                  {exec.workspaceName}
                </div>

                {/* Duration */}
                <div className="text-xs text-text-muted flex-shrink-0 font-mono w-16 text-right">
                  {formatDuration(exec.durationMs)}
                </div>

                {/* Time */}
                <div className="text-xs text-text-muted flex-shrink-0 w-28 text-right">
                  {formatTime(exec.startedAt)}
                </div>

                <span className="text-text-muted text-sm opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">→</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
