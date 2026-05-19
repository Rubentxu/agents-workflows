import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInsightsApi, type Insight } from '@/hooks/useInsightsApi';
import { LoadingState } from '@/components/states/LoadingState';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';

type SeverityFilter = 'all' | 'info' | 'warning' | 'critical';

const SEVERITY_COLORS: Record<string, { text: string; bg: string }> = {
  critical: { text: 'var(--color-error)', bg: 'var(--color-error-container)' },
  warning: { text: 'var(--color-warning)', bg: 'var(--color-warning-container)' },
  info: { text: 'var(--color-info)', bg: 'var(--color-info-container)' },
};

function classifySeverity(insightType: string): string {
  const t = insightType.toLowerCase();
  if (t.includes('critical')) return 'critical';
  if (t.includes('warning') || t.includes('warn')) return 'warning';
  return 'info';
}

export function InsightsListPage() {
  const { projectId } = useParams();
  const { queryInsights, loading } = useInsightsApi();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const fetchInsights = useCallback(async () => {
    setError(null);
    try {
      const results = await queryInsights();
      setInsights(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insights');
    }
  }, [queryInsights]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const filtered = severityFilter === 'all'
    ? insights
    : insights.filter((i) => classifySeverity(i.insight_type) === severityFilter);

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-4"
        style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
      >
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            Insights
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-secondary)' }}>
            {projectId ? `Project: ${projectId}` : 'Observe'}
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
            {(['all', 'info', 'warning', 'critical'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSeverityFilter(f)}
                className="px-3 py-1 text-xs font-medium rounded capitalize transition-colors"
                aria-pressed={severityFilter === f}
                style={
                  severityFilter === f
                    ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)' }
                    : { color: 'var(--color-secondary)' }
                }
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={fetchInsights}
            disabled={loading}
            aria-busy={loading}
            className="px-3 py-1.5 text-xs rounded transition-colors"
            style={{
              border: '1px solid var(--color-outline)',
              color: 'var(--color-on-surface)',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4">
            <ErrorState
              title="Failed to load insights"
              message={error}
              onRetry={fetchInsights}
            />
          </div>
        )}

        {loading && insights.length === 0 ? (
          <LoadingState type="rows" count={5} />
        ) : filtered.length === 0 && !error ? (
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 7v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
            title="No insights found"
            description="Insights will appear here once agent executions produce structured event logs."
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((insight) => {
              const severity = classifySeverity(insight.insight_type);
              const sc = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.info;
              return (
                <div
                  key={insight.id}
                  className="flex items-start gap-4 px-4 py-3 rounded-lg"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                >
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded capitalize shrink-0"
                    style={{ color: sc.text, background: sc.bg }}
                  >
                    {insight.insight_type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono" style={{ color: 'var(--color-on-surface)' }}>
                      {insight.data}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="font-mono text-xs" style={{ color: 'var(--color-secondary)' }}>
                        {insight.execution_id}
                      </span>
                      {insight.stage_id && (
                        <span className="text-xs" style={{ color: 'var(--color-secondary)' }}>
                          &middot; stage: {insight.stage_id}
                        </span>
                      )}
                      <span className="text-xs ml-auto" style={{ color: 'var(--color-secondary)' }}>
                        {new Date(insight.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
