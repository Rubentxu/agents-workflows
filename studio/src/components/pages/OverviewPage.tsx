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
        <h1 className="text-xl font-semibold text-on-surface">Project Overview</h1>
        <p className="text-sm text-secondary mt-1">
          {projectId ? `Project: ${projectId}` : 'Overview'}
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Workflows', value: '—', accent: 'blue' },
          { label: 'Agents', value: '—', accent: 'purple' },
          { label: 'Active Executions', value: '—', accent: 'green' },
          { label: 'Success Rate', value: '—', accent: 'cyan' },
        ].map(({ label, value, accent }) => (
          <div
            key={label}
            className={`bg-surface border border-outline-variant rounded-lg p-4 border-l-4 ${
              accent === 'blue' ? 'border-l-primary' :
              accent === 'purple' ? 'border-l-secondary' :
              accent === 'green' ? 'border-l-success' :
              'border-l-info'
            }`}
          >
            <div className="text-xs text-secondary uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold text-on-surface mt-1">
              {loading ? <span className="animate-pulse">—</span> : value}
            </div>
          </div>
        ))}
      </div>

      {/* Placeholder for detailed sections */}
      <div className="bg-surface border border-outline-variant rounded-lg p-6">
        <p className="text-sm text-secondary text-center">
          Connect to your project data to see detailed metrics here.
        </p>
      </div>
    </div>
  );
}
