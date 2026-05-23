import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExecutionApi } from '@/hooks/useExecutionApi';
import { LoadingState } from '@/components/states/LoadingState';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import type { AgentExecutionRow } from '@/types/dashboard';

type StatusFilter = 'all' | 'running' | 'completed' | 'failed';

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; dotPulse?: boolean }> = {
  running: { bg: 'var(--color-info-container)', text: 'var(--color-on-info-container)', dot: 'var(--color-info)', dotPulse: true },
  completed: { bg: 'var(--color-success-container)', text: 'var(--color-on-success-container)', dot: 'var(--color-success)' },
  failed: { bg: 'var(--color-error-container)', text: 'var(--color-on-error-container)', dot: 'var(--color-error)' },
  pending: { bg: 'var(--color-warning-container)', text: 'var(--color-on-warning-container)', dot: 'var(--color-warning)' },
  aborted: { bg: 'var(--color-secondary-container)', text: 'var(--color-on-secondary-container)', dot: 'var(--color-secondary)' },
  paused: { bg: 'var(--color-tertiary-container)', text: 'var(--color-on-tertiary-container)', dot: 'var(--color-tertiary)' },
};

export function AgentExecutionListPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { listExecutions } = useExecutionApi();

  const [executions, setExecutions] = useState<AgentExecutionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [hasFetched, setHasFetched] = useState(false);

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
      setHasFetched(true);
    }
  }, [listExecutions]);

  const filtered = statusFilter === 'all'
    ? executions
    : executions.filter((e) => e.status === statusFilter);

  useEffect(() => {
    void fetchExecutions();
  }, [fetchExecutions]);

  const formatDuration = (ms?: number) => {
    if (!ms) return '\u2014';
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
      <div
        data-testid="agent-executions-header"
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-4"
        style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
      >
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            Agent Executions
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-secondary)' }}>
            {projectId ? `Project: ${projectId}` : 'Observe'} \u2014 {filtered.length} executions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1 rounded p-0.5"
            style={{
              background: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
            }}
          >
            {(['all', 'running', 'completed', 'failed'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                data-testid={`agent-executions-filter-${f}`}
                className="px-3 py-1 text-xs font-medium rounded transition-colors capitalize"
                aria-pressed={statusFilter === f}
                style={
                  statusFilter === f
                    ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)' }
                    : { color: 'var(--color-on-surface)' }
                }
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={fetchExecutions}
            disabled={loading}
            data-testid="agent-executions-refresh"
            className="px-3 py-1.5 text-xs rounded transition-colors"
            aria-busy={loading}
            style={{
              border: '1px solid var(--color-outline)',
              color: 'var(--color-on-surface)',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4">
            <ErrorState
              title="Failed to load executions"
              message={error}
              onRetry={fetchExecutions}
            />
          </div>
        )}

        {loading && !hasFetched ? (
          <LoadingState type="rows" count={6} />
        ) : filtered.length === 0 && !error ? (
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6 8h8M6 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
              title="No agent executions yet"
              description="Agent executions will appear here once they are run. Executions are reported by agents through MCP."
              testId="agent-executions-empty-state"
            />
        ) : (
          <div className="space-y-2" role="list" aria-label="Agent executions" data-testid="agent-executions-list">
            {filtered.map((exec) => {
              const sc = STATUS_COLORS[exec.status] ?? STATUS_COLORS.aborted;
              return (
                <div
                  key={exec.id}
                  role="listitem"
                  onClick={() => navigate(`/studio/projects/${projectId}/observe/agent-executions/${encodeURIComponent(exec.id)}`)}
                  data-testid={`agent-executions-row-${exec.id}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 py-3 rounded-lg cursor-pointer group"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-outline-variant)',
                    transition: 'border-color 120ms, background 120ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                    e.currentTarget.style.background = 'var(--color-surface-container)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-outline-variant)';
                    e.currentTarget.style.background = 'var(--color-surface)';
                  }}
                >
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.dotPulse ? 'animate-pulse' : ''}`}
                    style={{ background: sc.dot }}
                    aria-hidden="true"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--color-on-surface)' }}>
                        {exec.workflowArn.split('/').pop() ?? exec.workflowArn}
                      </span>
                        <span
                          className="text-[11px] font-medium px-1.5 py-0.5 rounded capitalize"
                          style={{
                            color: sc.text,
                            background: sc.bg,
                        }}
                        aria-label={`Status: ${exec.status}`}
                      >
                        {exec.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                      <span className="font-mono text-xs truncate max-w-full sm:max-w-[200px]" style={{ color: 'var(--color-secondary)' }}>
                        {exec.workflowArn}
                      </span>
                      <span style={{ color: 'var(--color-outline)' }} className="hidden sm:inline">&middot;</span>
                      <span className="text-xs" style={{ color: 'var(--color-secondary)' }}>
                        {exec.agentArn.split('/').pop()}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-row sm:flex-col items-start sm:items-end gap-3 sm:gap-1 text-xs" style={{ color: 'var(--color-secondary)' }}>
                    <span className="sm:hidden" aria-label="Workspace">{exec.workspaceName}</span>
                    <span className="hidden sm:inline">{exec.workspaceName}</span>
                    <span className="font-mono w-16 sm:w-auto sm:text-right">{formatDuration(exec.durationMs)}</span>
                    <span className="w-28 sm:w-auto sm:text-right">{formatTime(exec.startedAt)}</span>
                  </div>

                  <span
                    className="text-sm flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block"
                    style={{ color: 'var(--color-primary)' }}
                    aria-hidden="true"
                  >
                    &rarr;
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
