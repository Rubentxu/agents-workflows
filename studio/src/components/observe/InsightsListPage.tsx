/**
 * InsightsListPage — /studio/projects/:projectId/observe/insights
 * Lists insights from agent executions.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInsightsApi, type Insight } from '@/hooks/useInsightsApi';

export function InsightsListPage() {
  const { projectId } = useParams();
  const { queryInsights, loading } = useInsightsApi();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');

  const fetchInsights = useCallback(async () => {
    const results = await queryInsights();
    setInsights(results);
  }, [queryInsights]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const filtered = severityFilter === 'all'
    ? insights
    : insights.filter((i) => {
        // severity is encoded in insight_type field
        const t = i.insight_type.toLowerCase();
        return t.includes(severityFilter);
      });

  const severityBadge = (insightType: string) => {
    const t = insightType.toLowerCase();
    if (t.includes('critical')) return 'text-red-400 border-red-400/30';
    if (t.includes('warning') || t.includes('warn')) return 'text-yellow-400 border-yellow-400/30';
    return 'text-blue-400 border-blue-400/30';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Insights</h1>
          <p className="text-sm text-text-muted mt-0.5">{projectId ? `Project: ${projectId}` : 'Observe'}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-bg-surface border border-border-subtle rounded p-0.5">
            {(['all', 'info', 'warning', 'critical'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSeverityFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded capitalize transition-colors ${
                  severityFilter === f ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={fetchInsights}
            disabled={loading}
            className="px-3 py-1.5 text-xs border border-border-default rounded hover:bg-bg-elevated text-text-secondary"
          >
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 && !loading ? (
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
            <p className="text-text-muted text-sm">No insights found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((insight) => (
              <div
                key={insight.id}
                className="flex items-start gap-4 px-4 py-3 bg-bg-surface border border-border-subtle rounded-lg"
              >
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize ${severityBadge(insight.insight_type)}`}
                >
                  {insight.insight_type}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary font-mono">{insight.data}</div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="font-mono text-xs text-text-muted">{insight.execution_id}</span>
                    {insight.stage_id && (
                      <span className="text-xs text-text-muted">· stage: {insight.stage_id}</span>
                    )}
                    <span className="text-xs text-text-muted ml-auto">
                      {new Date(insight.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
