/**
 * OverviewPage — /studio/projects/:projectId/overview
 * Project overview with key metrics and recent activity.
 * Reuses ProjectDashboardPage layout adapted for the overview context.
 */

import { useParams } from 'react-router-dom';
import { useDashboard } from '@/hooks/useDashboard';

export function OverviewPage() {
  const { projectId } = useParams();
  const { loading } = useDashboard(projectId ?? 'default');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-on-surface)' }}>Project Overview</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-secondary)' }}>
          {projectId ? `Project: ${projectId}` : 'Overview'}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Workflows', value: '—', accent: 'blue' },
          { label: 'Agents', value: '—', accent: 'purple' },
          { label: 'Active Executions', value: '—', accent: 'green' },
          { label: 'Success Rate', value: '—', accent: 'cyan' },
        ].map(({ label, value, accent }) => (
          <div
            key={label}
            className="rounded-lg p-4 border-l-4"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-outline-variant)',
              borderLeftColor: accent === 'blue' ? 'var(--color-primary)' :
                              accent === 'purple' ? 'var(--color-secondary)' :
                              accent === 'green' ? 'var(--color-success)' :
                              'var(--color-info)',
            }}
          >
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-secondary)' }}>{label}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: 'var(--color-on-surface)' }}>
              {loading ? <span className="animate-pulse">—</span> : value}
            </div>
          </div>
        ))}
      </div>

      {/* Placeholder for detailed sections */}
      <div
        className="rounded-lg p-6"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-outline-variant)',
        }}
      >
        <p className="text-sm text-center" style={{ color: 'var(--color-secondary)' }}>
          Connect to your project data to see detailed metrics here.
        </p>
      </div>
    </div>
  );
}
