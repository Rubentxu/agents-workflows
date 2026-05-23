import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDashboard } from '@/hooks/useDashboard';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { KpiGrid } from '@/components/states/KpiGrid';
import { LoadingState } from '@/components/states/LoadingState';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import type { AgentExecutionRow, WorkspaceStatus, RegistryNode } from '@/types';

type TimeWindow = '1h' | '24h' | '7d' | '30d';

const TIME_WINDOWS: TimeWindow[] = ['1h', '24h', '7d', '30d'];

const STATUS_BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  running: { bg: 'var(--color-primary-container)', color: 'var(--color-on-primary-container)' },
  pending: { bg: 'var(--color-warning-container)', color: 'var(--color-on-warning-container)' },
  completed: { bg: 'var(--color-success-container)', color: 'var(--color-on-success-container)' },
  failed: { bg: 'var(--color-error-container)', color: 'var(--color-on-error-container)' },
  aborted: { bg: 'var(--color-secondary-container)', color: 'var(--color-on-secondary-container)' },
  paused: { bg: 'var(--color-tertiary-container)', color: 'var(--color-on-tertiary-container)' },
  cancelled: { bg: 'var(--color-secondary-container)', color: 'var(--color-on-secondary-container)' },
};

const WS_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  healthy: { bg: 'var(--color-success-container)', color: 'var(--color-on-success-container)', label: 'Healthy' },
  degraded: { bg: 'var(--color-warning-container)', color: 'var(--color-on-warning-container)', label: 'Degraded' },
  failing: { bg: 'var(--color-error-container)', color: 'var(--color-on-error-container)', label: 'Failing' },
  idle: { bg: 'var(--color-secondary-container)', color: 'var(--color-on-secondary-container)', label: 'Idle' },
};

export function ProjectDashboardPage() {
  const { projectId } = useParams();
  const { loading, refetch } = useDashboard(projectId ?? '');
  const {
    workspaces,
    recentExecutions,
    recentWorkflows,
    health,
    loadingWorkspaces,
    loadingExecutions,
    loadingWorkflows,
    errors,
  } = useDashboardStore();
  const { activeWorkspace } = useWorkspaceContext();
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');

  const isAllWorkspaces = activeWorkspace === null;

  const filteredExecutions = isAllWorkspaces
    ? recentExecutions
    : recentExecutions.filter((e) => e.workspaceName === activeWorkspace.name);

  const filteredWorkspaces = isAllWorkspaces
    ? workspaces
    : workspaces.filter((ws) => ws.name === activeWorkspace.name);

  const filteredHealth = isAllWorkspaces
    ? health
    : {
        ...health,
        activeExecutions: filteredExecutions.filter((e) => e.status === 'running').length,
        failedExecutions: filteredExecutions.filter((e) => e.status === 'failed').length,
        successRate: calculateSuccessRate(filteredExecutions),
        queued: filteredExecutions.filter((e) => e.status === 'pending').length,
      };

  const kpiItems = [
    {
      icon: <PulseIcon />,
      value: filteredHealth.activeExecutions,
      label: 'Active',
      status: 'default' as const,
      loading: loading,
    },
    {
      icon: <XCircleIcon />,
      value: filteredHealth.failedExecutions,
      label: 'Failed',
      status: 'error' as const,
      loading: loading,
    },
    {
      icon: <CheckCircleIcon />,
      value: `${filteredHealth.successRate}%`,
      label: 'Success Rate',
      status: 'success' as const,
      loading: loading,
    },
    {
      icon: <ClockIcon />,
      value: filteredHealth.avgDurationMs > 0 ? `${(filteredHealth.avgDurationMs / 1000).toFixed(1)}s` : '--',
      label: 'Avg Duration',
      status: 'default' as const,
      loading: loading,
    },
    {
      icon: <QueueIcon />,
      value: filteredHealth.queued,
      label: 'Queued',
      status: 'warning' as const,
      loading: loading,
    },
    {
      icon: <ArtifactIcon />,
      value: filteredHealth.artifactCount,
      label: 'Artifacts',
      status: 'info' as const,
      loading: loading,
    },
    {
      icon: <AlertIcon />,
      value: filteredHealth.openAlerts,
      label: 'Open Alerts',
      status: 'error' as const,
      loading: loading,
    },
  ];

  return (
    <div className="space-y-6" data-testid="project-dashboard">
      <DashboardHeader
        projectName={projectId ?? 'Project'}
        projectId={projectId ?? ''}
        loading={loading}
        timeWindow={timeWindow}
        onTimeWindowChange={setTimeWindow}
        onRefresh={refetch}
        activeWorkspaceName={activeWorkspace?.name}
      />

      <section aria-labelledby="kpi-summary-title" data-testid="dashboard-kpi-section">
        <h2 id="kpi-summary-title" className="sr-only">Operational summary</h2>
        {loading ? (
          <LoadingState type="cards" count={7} />
        ) : (
          <KpiGrid items={kpiItems} />
        )}
      </section>

      <WorkspacesPanel
        workspaces={filteredWorkspaces}
        loading={loadingWorkspaces}
        error={errors.workspaces}
        onRetry={refetch}
      />

      <RecentExecutionsPanel
        executions={filteredExecutions}
        loading={loadingExecutions}
        error={errors.executions}
        onRetry={refetch}
      />

      <WorkflowCatalogPanel
        workflows={recentWorkflows}
        loading={loadingWorkflows}
        error={errors.workflows}
        onRetry={refetch}
        projectId={projectId ?? ''}
      />
    </div>
  );
}

function calculateSuccessRate(executions: AgentExecutionRow[]): number {
  if (executions.length === 0) return 0;
  const completed = executions.filter((e) => e.status === 'completed').length;
  return Math.round((completed / executions.length) * 100);
}

function DashboardHeader({
  projectName,
  projectId,
  loading,
  timeWindow,
  onTimeWindowChange,
  onRefresh,
  activeWorkspaceName,
}: {
  projectName: string;
  projectId: string;
  loading: boolean;
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
  onRefresh: () => void;
  activeWorkspaceName?: string;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" data-testid="dashboard-header">
      <div>
        <h1
          className="text-xl font-semibold"
          style={{ color: 'var(--color-on-surface)' }}
        >
          {activeWorkspaceName ? `${activeWorkspaceName} Dashboard` : `${projectName} Dashboard`}
        </h1>
        <p
          className="text-sm mt-1"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          {activeWorkspaceName ? `Workspace: ${activeWorkspaceName}` : `Project: ${projectId || 'Overview'}`}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <TimeWindowSelector
          value={timeWindow}
          onChange={onTimeWindowChange}
        />
        <button
          onClick={onRefresh}
          disabled={loading}
          data-testid="dashboard-refresh"
          className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          style={{
            border: '1px solid var(--color-outline)',
            color: 'var(--color-primary)',
            background: 'transparent',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1v5h5" />
            <path d="M2.5 10.5a6 6 0 1 0 1.2-5.7L1 6" />
          </svg>
          Refresh
        </button>
        <button
          data-testid="dashboard-create-workflow"
          className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
          style={{
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
          }}
        >
          Create Workflow
        </button>
      </div>
    </header>
  );
}

function TimeWindowSelector({
  value,
  onChange,
}: {
  value: TimeWindow;
  onChange: (w: TimeWindow) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--color-outline-variant)' }}
    >
      {TIME_WINDOWS.map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className="px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: value === w ? 'var(--color-primary-container)' : 'transparent',
            color: value === w ? 'var(--color-on-primary-container)' : 'var(--color-on-surface-variant)',
          }}
        >
          {w}
        </button>
      ))}
    </div>
  );
}

function WorkspacesPanel({
  workspaces,
  loading,
  error,
  onRetry,
}: {
  workspaces: WorkspaceStatus[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="workspaces-title">
      <div className="panel-card">
        <div className="panel-card__header">
          <h2
            id="workspaces-title"
            className="text-base font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Workspaces
          </h2>
          <button
            data-testid="dashboard-create-workspace"
            className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
            style={{
              background: 'var(--color-primary-container)',
              color: 'var(--color-on-primary-container)',
            }}
          >
            Create Workspace
          </button>
        </div>

        {error ? (
          <ErrorState
            title="Workspace data unavailable"
            message="Unable to load workspaces due to an API error."
            details={error}
            onRetry={onRetry}
          />
        ) : loading ? (
          <LoadingState type="cards" count={3} />
        ) : workspaces.length === 0 ? (
          <EmptyState
            testId="dashboard-workspaces-empty"
            icon={<WsIcon />}
            title="No workspaces yet"
            description="Create a workspace to start organizing agentic workflows."
            action={{ label: 'Create Workspace', onClick: () => {} }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="dashboard-workspaces-grid">
            {workspaces.map((ws) => (
              <WorkspaceCard key={ws.id} workspace={ws} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function WorkspaceCard({ workspace }: { workspace: WorkspaceStatus }) {
  const statusStyle = WS_STATUS_STYLES[workspace.status] ?? WS_STATUS_STYLES.idle;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: statusStyle.bg }}
        />
        <span
          className="font-medium text-sm truncate"
          style={{ color: 'var(--color-on-surface)' }}
        >
          {workspace.name}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            background: statusStyle.bg,
            color: statusStyle.color,
          }}
        >
          {statusStyle.label}
        </span>
      </div>
      <div
        className="text-xs space-y-1"
        style={{ color: 'var(--color-on-surface-variant)' }}
      >
        <div className="flex justify-between">
          <span>Active executions</span>
          <span style={{ color: 'var(--color-on-surface)' }}>{workspace.activeExecutions}</span>
        </div>
        <div className="flex justify-between">
          <span>Failed (24h)</span>
          <span style={{ color: workspace.failedLast24h > 0 ? 'var(--color-error)' : 'var(--color-on-surface)' }}>
            {workspace.failedLast24h}
          </span>
        </div>
        {workspace.lastExecution && (
          <div className="flex justify-between">
            <span>Last activity</span>
            <span>{formatRelativeTime(workspace.lastExecution)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RecentExecutionsPanel({
  executions,
  loading,
  error,
  onRetry,
}: {
  executions: AgentExecutionRow[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="executions-title">
      <div className="panel-card">
        <div className="panel-card__header">
          <h2
            id="executions-title"
            className="text-base font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Recent Agent Executions
          </h2>
          {executions.length > 0 && (
            <button
              data-testid="dashboard-view-all-executions"
              className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
              style={{
                border: '1px solid var(--color-outline)',
                color: 'var(--color-primary)',
                background: 'transparent',
              }}
            >
              View All
            </button>
          )}
        </div>

        {error ? (
          <ErrorState
            title="Execution data unavailable"
            message="Unable to load recent executions due to an API error."
            details={error}
            onRetry={onRetry}
          />
        ) : loading ? (
          <LoadingState type="rows" count={5} />
        ) : executions.length === 0 ? (
          <EmptyState
            testId="dashboard-executions-empty"
            icon={<ExecIcon />}
            title="No agent executions yet"
            description="Agent executions will appear here once they are run."
            action={{ label: 'View Agent Executions', onClick: () => {} }}
          />
        ) : (
          <div className="overflow-x-auto" data-testid="dashboard-executions-table">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                  <ThCell>Execution</ThCell>
                  <ThCell>Agent</ThCell>
                  <ThCell>Workflow</ThCell>
                  <ThCell>Status</ThCell>
                  <ThCell>Duration</ThCell>
                  <ThCell>Started</ThCell>
                </tr>
              </thead>
              <tbody>
                {executions.map((exec) => (
                  <ExecutionRow key={exec.id} exec={exec} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function ThCell({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="text-left px-4 py-2 font-medium text-xs"
      style={{ color: 'var(--color-on-surface-variant)' }}
    >
      {children}
    </th>
  );
}

function ExecutionRow({ exec }: { exec: AgentExecutionRow }) {
  const badge = STATUS_BADGE_STYLES[exec.status] ?? STATUS_BADGE_STYLES.aborted;
  const duration = exec.durationMs != null ? `${(exec.durationMs / 1000).toFixed(1)}s` : '--';

  return (
    <tr
      data-testid={`dashboard-execution-row-${exec.id}`}
      className="transition-colors"
      style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-surface-container-high)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <td
        className="px-4 py-2.5 font-mono text-xs truncate max-w-32"
        style={{ color: 'var(--color-on-surface)' }}
      >
        {(exec.id ?? '').length > 12 ? (exec.id ?? '').slice(0, 12) : (exec.id ?? '--')}
      </td>
      <td
        className="px-4 py-2.5 font-mono text-xs truncate max-w-32"
        style={{ color: 'var(--color-on-surface)' }}
      >
        {exec.agentArn.split('/').pop()}
      </td>
      <td
        className="px-4 py-2.5 font-mono text-xs truncate max-w-32"
        style={{ color: 'var(--color-on-surface)' }}
      >
        {exec.workflowArn.split('/').pop()}
      </td>
      <td className="px-4 py-2.5">
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1"
          style={{ background: badge.bg, color: badge.color }}
        >
          {(exec.status === 'running') && (
            <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: badge.color }} />
          )}
          {capitalize(exec.status)}
        </span>
      </td>
      <td
        className="px-4 py-2.5 text-xs"
        style={{ color: 'var(--color-on-surface-variant)' }}
      >
        {duration}
      </td>
      <td
        className="px-4 py-2.5 text-xs"
        style={{ color: 'var(--color-on-surface-variant)' }}
      >
        {formatRelativeTime(exec.startedAt)}
      </td>
    </tr>
  );
}

function WorkflowCatalogPanel({
  workflows,
  loading,
  error,
  onRetry,
  projectId,
}: {
  workflows: RegistryNode[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
  projectId: string;
}) {
  return (
    <section aria-labelledby="workflows-title">
      <div className="panel-card">
        <div className="panel-card__header">
          <h2
            id="workflows-title"
            className="text-base font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            Workflows
          </h2>
          <button
            className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
            style={{
              background: 'var(--color-primary-container)',
              color: 'var(--color-on-primary-container)',
            }}
          >
            Create Workflow
          </button>
        </div>

        {error ? (
          <ErrorState
            title="Workflow data unavailable"
            message="Unable to load workflows due to an API error."
            details={error}
            onRetry={onRetry}
          />
        ) : loading ? (
          <LoadingState type="cards" count={3} />
        ) : workflows.length === 0 ? (
          <EmptyState
            testId="dashboard-workflows-empty"
            icon={<WorkflowIcon />}
            title="No workflows found"
            description="Create your first workflow to get started."
            action={{ label: 'Create Workflow', onClick: () => {} }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="dashboard-workflows-grid">
            {workflows.map((wf) => (
              <WorkflowCatalogCard key={wf.id} workflow={wf} projectId={projectId} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function WorkflowCatalogCard({ workflow, projectId }: { workflow: RegistryNode; projectId: string }) {
  const desc = workflow.config_json
    ? (() => {
        try {
          const c = JSON.parse(workflow.config_json);
          return c.description ?? '';
        } catch {
          return '';
        }
      })()
    : '';

  return (
    <a
      href={`/studio/projects/${projectId}/design/workflows`}
      className="card block transition-colors"
      style={{ textDecoration: 'none' }}
    >
      <div
        className="font-medium text-sm truncate mb-1"
        style={{ color: 'var(--color-on-surface)' }}
      >
        {workflow.name}
      </div>
      {desc && (
        <p
          className="text-xs mb-2 line-clamp-2"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          {desc}
        </p>
      )}
      <div className="flex items-center gap-2 mt-2">
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            background: 'var(--color-primary-container)',
            color: 'var(--color-on-primary-container)',
          }}
        >
          {workflow.type}
        </span>
        <span
          className="text-xs"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          Updated {formatRelativeTime(workflow.updated_at)}
        </span>
      </div>
    </a>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function PulseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3" fill="currentColor" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 7.5L12.5 12.5M12.5 7.5L7.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 10L9 12L13 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 7V10L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="5" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="10" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="15" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ArtifactIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 4H12L16 8V16H4V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 4V8H16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 3L18 17H2L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="14.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

function WsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ExecIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M5 4H15V16H5V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 8H12M8 11H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function WorkflowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="4" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="14" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 10H8V6M8 14V10H14" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
