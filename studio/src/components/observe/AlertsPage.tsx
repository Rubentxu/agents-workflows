/**
 * AlertsPage — /studio/projects/:projectId/observe/alerts
 * "Alert states are open, acknowledged, and resolved.
 *  Alert severities are info, warning, and critical."
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

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

export function AlertsPage() {
  const { projectId } = useParams();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState<AlertState | 'all'>('open');

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stateFilter !== 'all') params.set('state', stateFilter);
      const res = await fetch(`/api/alerts?${params}`);
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
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [stateFilter]);

  const filtered = stateFilter === 'all' ? alerts : alerts.filter(a => a.state === stateFilter);

  const severityBadge = (s: AlertSeverity) => ({
    info: 'text-blue-400 border-blue-400/30',
    warning: 'text-yellow-400 border-yellow-400/30',
    critical: 'text-red-400 border-red-400/30',
  }[s]);

  const stateBadge = (s: AlertState) => ({
    open: 'text-red-400 border-red-400/30 bg-red-400/5',
    acknowledged: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5',
    resolved: 'text-green-400 border-green-400/30 bg-green-400/5',
  }[s]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Alerts</h1>
          <p className="text-sm text-text-muted mt-0.5">{projectId ? `Project: ${projectId}` : 'Observe'}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-bg-surface border border-border-subtle rounded p-0.5">
            {(['all', 'open', 'acknowledged', 'resolved'] as const).map(f => (
              <button key={f} onClick={() => setStateFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded capitalize transition-colors ${stateFilter === f ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'}`}>
                {f}
              </button>
            ))}
          </div>
          <button onClick={fetchAlerts} disabled={loading}
            className="px-3 py-1.5 text-xs border border-border-default rounded hover:bg-bg-elevated text-text-secondary">
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 && !loading ? (
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
            <p className="text-text-muted text-sm">No {stateFilter === 'all' ? '' : stateFilter} alerts.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(alert => (
              <div key={alert.id} className="flex items-center gap-4 px-4 py-3 bg-bg-surface border border-border-subtle rounded-lg">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize ${severityBadge(alert.severity)}`}>
                  {alert.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary">{alert.message}</div>
                  {alert.source && <div className="text-xs text-text-muted font-mono mt-0.5">{alert.source}</div>}
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize ${stateBadge(alert.state)}`}>
                  {alert.state}
                </span>
                <span className="text-xs text-text-muted">{new Date(alert.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
