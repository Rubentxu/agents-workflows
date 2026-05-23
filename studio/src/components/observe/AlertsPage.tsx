import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { LoadingState } from '@/components/states/LoadingState';
import { EmptyState } from '@/components/states/EmptyState';
import { restApiUrl } from '@/lib/apiBase';

type AlertSeverity = 'info' | 'warning' | 'critical';
type AlertState = 'open' | 'acknowledged' | 'resolved';

interface Alert {
  id: string;
  message: string;
  severity: AlertSeverity;
  state: AlertState;
  source?: string;
  createdAt: string;
}

const SEVERITY_STYLES: Record<AlertSeverity, { text: string; bg: string }> = {
  info: { text: 'var(--color-info)', bg: 'var(--color-info-container)' },
  warning: { text: 'var(--color-warning)', bg: 'var(--color-warning-container)' },
  critical: { text: 'var(--color-error)', bg: 'var(--color-error-container)' },
};

const STATE_STYLES: Record<AlertState, { text: string; bg: string; border: string }> = {
  open: { text: 'var(--color-error)', bg: 'var(--color-error-container)', border: 'var(--color-error)' },
  acknowledged: { text: 'var(--color-warning)', bg: 'var(--color-warning-container)', border: 'var(--color-warning)' },
  resolved: { text: 'var(--color-success)', bg: 'var(--color-success-container)', border: 'var(--color-success)' },
};

export function AlertsPage() {
  const { projectId } = useParams();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<AlertState | 'all'>('open');

  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (stateFilter !== 'all') params.set('state', stateFilter);
      const res = await fetch(restApiUrl(`/alerts?${params}`));
      if (!res.ok) throw new Error('Failed to fetch alerts');
      const data = await res.json();
      const mapped: Alert[] = (data.alerts ?? []).map((a: Record<string, unknown>) => ({
        id: String(a.id),
        message: String(a.message),
        severity: a.severity as AlertSeverity,
        state: a.state as AlertState,
        source: a.source as string | undefined,
        createdAt: String(a.created_at),
      }));
      setAlerts(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts');
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [stateFilter]);

  const filtered = stateFilter === 'all' ? alerts : alerts.filter(a => a.state === stateFilter);

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-4"
        style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
      >
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>Alerts</h1>
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
            {(['all', 'open', 'acknowledged', 'resolved'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStateFilter(f)}
                className="px-3 py-1 text-xs font-medium rounded capitalize transition-colors"
                aria-pressed={stateFilter === f}
                style={
                  stateFilter === f
                    ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)' }
                    : { color: 'var(--color-secondary)' }
                }
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={fetchAlerts}
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
        {loading && alerts.length === 0 ? (
          <LoadingState type="rows" count={4} />
        ) : filtered.length === 0 && !error ? (
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L18 16H2L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                <path d="M10 8v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="10" cy="13" r="0.75" fill="currentColor" />
              </svg>
            }
            title={stateFilter === 'all' ? 'No alerts' : `No ${stateFilter} alerts`}
            description={
              stateFilter === 'open'
                ? 'There are no open alerts. New alerts will appear here when triggered.'
                : stateFilter === 'acknowledged'
                ? 'No acknowledged alerts at this time.'
                : stateFilter === 'resolved'
                ? 'No resolved alerts in the current view.'
                : 'Alerts will appear here when triggered by system conditions.'
            }
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((alert) => {
              const ss = SEVERITY_STYLES[alert.severity];
              const st = STATE_STYLES[alert.state];
              return (
                <div
                  key={alert.id}
                  className="flex items-center gap-4 px-4 py-3 rounded-lg"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                >
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded capitalize shrink-0"
                    style={{ color: ss.text, background: ss.bg }}
                  >
                    {alert.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: 'var(--color-on-surface)' }}>{alert.message}</div>
                    {alert.source && (
                      <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--color-secondary)' }}>
                        {alert.source}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded capitalize shrink-0"
                    style={{ color: st.text, background: st.bg, border: `1px solid ${st.border}` }}
                  >
                    {alert.state}
                  </span>
                  <span className="text-xs shrink-0" style={{ color: 'var(--color-secondary)' }}>
                    {new Date(alert.createdAt).toLocaleString()}
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
