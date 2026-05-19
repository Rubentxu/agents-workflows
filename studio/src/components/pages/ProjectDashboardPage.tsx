/**
 * ProjectDashboardPage — /studio/projects/:projectId
 * The main project dashboard. Connected to MCP/insights data.
 */

import { useParams } from 'react-router-dom';
import { useDashboard } from '@/hooks/useDashboard';
import { useDashboardStore } from '@/stores/dashboardStore';

export function ProjectDashboardPage() {
  const { projectId } = useParams();
  const { loading, refetch } = useDashboard(projectId ?? '');
  const { workspaces, recentExecutions, recentWorkflows, health, loadingWorkflows, errors } =
    useDashboardStore();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            {projectId ?? 'Project'} Dashboard
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {projectId ? `Project: ${projectId}` : 'Overview'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <span className="text-xs text-text-muted animate-pulse">Loading...</span>
          )}
          <button
            onClick={refetch}
            className="px-3 py-1.5 text-xs border border-border-default rounded hover:bg-bg-elevated transition-colors text-text-secondary"
          >
            Refresh
          </button>
          <button className="px-4 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-accent/90 transition-colors">
            Create resource
          </button>
        </div>
      </div>

      {/* Health / Activity Strip */}
      <div className="grid grid-cols-7 gap-3">
        <HealthCard label="Active" value={health.activeExecutions} color="text-accent" />
        <HealthCard label="Failed" value={health.failedExecutions} color="text-accent-error" />
        <HealthCard
          label="Success Rate"
          value={`${health.successRate}%`}
          color="text-accent-success"
        />
        <HealthCard
          label="Avg Duration"
          value={health.avgDurationMs > 0 ? `${(health.avgDurationMs / 1000).toFixed(1)}s` : '—'}
          color="text-text-primary"
        />
        <HealthCard label="Queued" value={health.queued} color="text-text-muted" />
        <HealthCard label="Artifacts" value={health.artifactCount} color="text-text-primary" />
        <HealthCard label="Open Alerts" value={health.openAlerts} color="text-accent-warning" />
      </div>

      {/* Workspace Status Grid */}
      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Workspaces</h2>
        {errors.workspaces ? (
          <ErrorBanner message={errors.workspaces} />
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {workspaces.map((ws) => (
              <WorkspaceCard key={ws.id} workspace={ws} />
            ))}
          </div>
        )}
      </section>

      {/* Recent Agent Executions */}
      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Recent Agent Executions</h2>
        {errors.executions ? (
          <ErrorBanner message={errors.executions} />
        ) : recentExecutions.length === 0 ? (
          <EmptyState message="No agent executions yet. Agents report executions via MCP." />
        ) : (
          <div className="bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left px-4 py-2 text-text-muted font-medium text-xs">Agent</th>
                  <th className="text-left px-4 py-2 text-text-muted font-medium text-xs">Workflow</th>
                  <th className="text-left px-4 py-2 text-text-muted font-medium text-xs">Workspace</th>
                  <th className="text-left px-4 py-2 text-text-muted font-medium text-xs">Status</th>
                  <th className="text-left px-4 py-2 text-text-muted font-medium text-xs">Duration</th>
                </tr>
              </thead>
              <tbody>
                {recentExecutions.map((exec) => (
                  <ExecutionRow key={exec.id} exec={exec} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Workflow Catalog Preview */}
      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Workflow Catalog</h2>
        {errors.workflows ? (
          <ErrorBanner message={errors.workflows} />
        ) : loadingWorkflows ? (
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
            <span className="text-sm text-text-muted animate-pulse">Loading workflows...</span>
          </div>
        ) : recentWorkflows.length === 0 ? (
          <EmptyState message="No workflows found. Create one to get started." />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {recentWorkflows.map((wf) => (
              <WorkflowCard key={wf.id} node={wf} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HealthCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-3 text-center">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-text-muted mt-0.5">{label}</div>
    </div>
  );
}

function WorkspaceCard({ workspace }: { workspace: { id: string; name: string; status: string; activeExecutions: number; failedLast24h: number; lastExecution?: string } }) {
  const statusColor =
    workspace.status === 'healthy'
      ? 'bg-accent-success'
      : workspace.status === 'degraded'
      ? 'bg-accent-warning'
      : workspace.status === 'failing'
      ? 'bg-accent-error'
      : 'bg-text-muted';

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span className="font-medium text-text-primary text-sm">{workspace.name}</span>
      </div>
      <div className="text-xs text-text-muted space-y-0.5">
        <div>Active: {workspace.activeExecutions}</div>
        <div>Failed (24h): {workspace.failedLast24h}</div>
      </div>
    </div>
  );
}

function ExecutionRow({ exec }: { exec: { id: string; agentArn: string; workflowArn: string; workspaceName: string; status: string; durationMs?: number; startedAt: string } }) {
  const statusClass =
    exec.status === 'completed'
      ? 'bg-accent-success/10 text-accent-success'
      : exec.status === 'failed'
      ? 'bg-accent-error/10 text-accent-error'
      : exec.status === 'running' || exec.status === 'pending'
      ? 'bg-accent/10 text-accent'
      : 'bg-bg-elevated text-text-muted';

  const duration = exec.durationMs != null ? `${(exec.durationMs / 1000).toFixed(1)}s` : '—';

  return (
    <tr className="border-b border-border-subtle last:border-0 hover:bg-bg-elevated/50 transition-colors">
      <td className="px-4 py-2 text-text-primary font-mono text-xs truncate max-w-32">
        {exec.agentArn.split('/').pop()}
      </td>
      <td className="px-4 py-2 text-text-primary font-mono text-xs truncate max-w-32">
        {exec.workflowArn.split('/').pop()}
      </td>
      <td className="px-4 py-2 text-text-secondary text-xs">{exec.workspaceName}</td>
      <td className="px-4 py-2">
        <span className={`text-xs px-2 py-0.5 rounded ${statusClass}`}>{exec.status}</span>
      </td>
      <td className="px-4 py-2 text-text-muted text-xs">{duration}</td>
    </tr>
  );
}

function WorkflowCard({ node }: { node: { id: string; name: string; namespace: string; type: string; updated_at: string } }) {
  return (
    <a
      href={`/studio/projects/${node.namespace.split('/')[1]}/design/workflows`}
      className="block bg-bg-surface border border-border-subtle rounded-lg p-3 hover:border-accent transition-colors"
    >
      <div className="font-medium text-text-primary text-sm truncate">{node.name}</div>
      <div className="font-mono text-xs text-accent mt-0.5 truncate">{node.type}</div>
      <div className="text-xs text-text-muted mt-1">{node.namespace}</div>
    </a>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
      <p className="text-text-muted text-sm">{message}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-accent-error/5 border border-accent-error/20 rounded-lg p-4 text-center">
      <p className="text-accent-error text-sm">{message}</p>
    </div>
  );
}
