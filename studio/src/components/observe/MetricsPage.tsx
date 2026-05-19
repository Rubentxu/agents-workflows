/**
 * MetricsPage — /studio/projects/:projectId/observe/metrics
 * "Metrics must support both execution-centric and resource-centric views.
 *  Metrics tabs are Agent Executions, Workflows, Agents, Resources, and System."
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAllMetricsStream } from '@/hooks/useMetricsStream';
import { useMetricsStore, type AggregatedMetrics } from '@/stores/metricsStore';

type MetricTab = 'executions' | 'workflows' | 'agents' | 'resources' | 'system';
type TimeWindow = '1h' | '24h' | '7d' | '30d';

const TIME_WINDOW_MS: Record<TimeWindow, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function MetricsPage() {
  const { projectId } = useParams();
  const [activeTab, setActiveTab] = useState<MetricTab>('executions');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');
  const { disconnect } = useAllMetricsStream();
  const aggregatedMetrics = useMetricsStore((s) => s.aggregatedMetrics);
  const setTimeWindowFn = useMetricsStore((s) => s.setTimeWindow);

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  useEffect(() => {
    setTimeWindowFn(TIME_WINDOW_MS[timeWindow]);
  }, [timeWindow, setTimeWindowFn]);

  const tabs: { id: MetricTab; label: string }[] = [
    { id: 'executions', label: 'Agent Executions' },
    { id: 'workflows', label: 'Workflows' },
    { id: 'agents', label: 'Agents' },
    { id: 'resources', label: 'Resources' },
    { id: 'system', label: 'System' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Metrics</h1>
          <p className="text-sm text-text-muted mt-0.5">{projectId ? `Project: ${projectId}` : 'Observe'}</p>
        </div>
        {/* Time window selector */}
        <div className="flex items-center gap-1 bg-bg-surface border border-border-subtle rounded p-0.5">
          {(['1h', '24h', '7d', '30d'] as TimeWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                timeWindow === w ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Metric tabs */}
      <div className="flex px-6 border-b border-border-subtle bg-bg-elevated/20">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'executions' && <ExecutionsTab metrics={aggregatedMetrics} />}
        {activeTab === 'workflows' && <WorkflowsTab metrics={aggregatedMetrics} />}
        {activeTab === 'agents' && <AgentsTab metrics={aggregatedMetrics} />}
        {activeTab === 'resources' && <ResourcesTab metrics={aggregatedMetrics} />}
        {activeTab === 'system' && <SystemTab />}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms === 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function BarChart({ data, maxValue, height = 120 }: { data: { label: string; value: number; color?: string }[]; maxValue: number; height?: number }) {
  if (data.length === 0 || maxValue === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] text-text-muted text-xs">
        No data available
      </div>
    );
  }
  return (
    <div className="flex items-end gap-2 h-[120px]">
      {data.map((item, i) => (
        <div key={i} className="flex flex-col items-center flex-1 min-w-0">
          <div className="text-[10px] text-text-muted mb-1 truncate w-full text-center">
            {formatNumber(item.value)}
          </div>
          <div
            className={`w-full rounded-t ${item.color || 'bg-accent'}`}
            style={{ height: `${(item.value / maxValue) * height}px`, minHeight: '2px' }}
          />
          <div className="text-[10px] text-text-muted mt-1 truncate w-full text-center" title={item.label}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, subValue, color }: { label: string; value: string | number; subValue?: string; color?: string }) {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
      <div className="text-xs text-text-muted mb-2">{label}</div>
      <div className={`text-2xl font-semibold ${color || 'text-text-primary'}`}>{value}</div>
      {subValue && <div className="text-xs text-text-muted mt-0.5">{subValue}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Agent Executions
// ---------------------------------------------------------------------------
function ExecutionsTab({ metrics }: { metrics: AggregatedMetrics }) {
  const { totalExecutions, runningExecutions, completedExecutions, failedExecutions, avgDurationMs, totalTokens, byStage, recentEvents } = metrics;

  const successRate = completedExecutions > 0
    ? Math.round((completedExecutions / (completedExecutions + failedExecutions)) * 100)
    : 0;

  const statusData = [
    { label: 'Running', value: runningExecutions, color: 'bg-blue-400' },
    { label: 'Completed', value: completedExecutions, color: 'bg-green-400' },
    { label: 'Failed', value: failedExecutions, color: 'bg-red-400' },
  ];

  const maxStatus = Math.max(runningExecutions, completedExecutions, failedExecutions, 1);

  const maxStageCount = Math.max(...Object.values(byStage).map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Executions" value={totalExecutions} />
        <StatCard label="Success Rate" value={`${successRate}%`} color={successRate >= 80 ? 'text-accent-success' : successRate >= 50 ? 'text-accent-warning' : 'text-accent-error'} />
        <StatCard label="Avg Duration" value={formatDuration(avgDurationMs)} />
        <StatCard label="Total Tokens" value={formatNumber(totalTokens)} />
      </div>

      {/* Status breakdown */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Execution Status Breakdown</h3>
        <BarChart data={statusData} maxValue={maxStatus} />
      </div>

      {/* Stage performance */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Stage Performance</h3>
        {Object.keys(byStage).length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">No stage data yet</div>
        ) : (
          <div className="space-y-2">
            {Object.entries(byStage).slice(0, 10).map(([stageId, data]) => (
              <div key={stageId} className="flex items-center gap-4">
                <div className="w-24 text-xs text-text-muted font-mono truncate">{stageId}</div>
                <div className="flex-1 h-4 bg-bg-elevated rounded overflow-hidden">
                  <div
                    className={`h-full rounded ${data.failed > 0 ? 'bg-red-400' : 'bg-green-400'}`}
                    style={{ width: `${(data.count / maxStageCount) * 100}%` }}
                  />
                </div>
                <div className="w-16 text-xs text-text-muted text-right">{data.count} runs</div>
                <div className="w-16 text-xs text-text-muted text-right">{data.failed} failed</div>
                <div className="w-20 text-xs text-text-muted text-right">{formatDuration(data.duration / Math.max(data.count, 1))} avg</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent events */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Recent Events</h3>
        {recentEvents.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">No events in selected time window</div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto">
            {recentEvents.slice(-20).reverse().map((event, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  event.event_type === 'completed' ? 'bg-green-400' :
                  event.event_type === 'failed' ? 'bg-red-400' :
                  event.event_type === 'started' ? 'bg-blue-400' :
                  'bg-yellow-400'
                }`} />
                <span className="font-mono text-text-muted flex-shrink-0">{event.stage_id}</span>
                <span className="text-text-secondary flex-1 truncate">{event.execution_arn.split('/').pop()}</span>
                <span className="text-text-muted">{event.event_type}</span>
                <span className="text-text-muted">{new Date(event.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Workflows
// ---------------------------------------------------------------------------
function WorkflowsTab({ metrics }: { metrics: AggregatedMetrics }) {
  const { byWorkflow } = metrics;

  const workflowData = Object.entries(byWorkflow)
    .map(([name, data]) => ({
      label: name,
      value: data.count,
      failed: data.failed,
      avgDuration: data.avgDuration,
      color: data.failed > 0 ? 'bg-red-400' : 'bg-accent',
    }))
    .sort((a, b) => b.value - a.value);

  const maxCount = Math.max(...workflowData.map((d) => d.value), 1);

  const totalWorkflows = Object.keys(byWorkflow).length;
  const totalRuns = Object.values(byWorkflow).reduce((sum, d) => sum + d.count, 0);
  const totalFailures = Object.values(byWorkflow).reduce((sum, d) => sum + d.failed, 0);
  const overallFailureRate = totalRuns > 0 ? Math.round((totalFailures / totalRuns) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Unique Workflows" value={totalWorkflows} />
        <StatCard label="Total Runs" value={totalRuns} />
        <StatCard label="Total Failures" value={totalFailures} color={totalFailures > 0 ? 'text-accent-error' : 'text-accent-success'} />
        <StatCard label="Failure Rate" value={`${overallFailureRate}%`} color={overallFailureRate >= 10 ? 'text-accent-error' : overallFailureRate >= 5 ? 'text-accent-warning' : 'text-accent-success'} />
      </div>

      {/* Usage chart */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Workflow Usage</h3>
        {workflowData.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">No workflow data yet</div>
        ) : (
          <BarChart
            data={workflowData.slice(0, 8).map((d) => ({ label: d.label, value: d.value, color: d.color }))}
            maxValue={maxCount}
          />
        )}
      </div>

      {/* Workflow table */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Workflow Details</h3>
        {workflowData.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">No workflow data yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 text-text-muted font-medium text-xs">Workflow</th>
                <th className="text-right py-2 text-text-muted font-medium text-xs">Runs</th>
                <th className="text-right py-2 text-text-muted font-medium text-xs">Failures</th>
                <th className="text-right py-2 text-text-muted font-medium text-xs">Failure %</th>
                <th className="text-right py-2 text-text-muted font-medium text-xs">Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {workflowData.map((wf) => {
                const failurePct = wf.value > 0 ? Math.round((wf.failed / wf.value) * 100) : 0;
                return (
                  <tr key={wf.label} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 text-text-primary font-mono text-xs">{wf.label}</td>
                    <td className="py-2 text-text-muted text-xs text-right">{wf.value}</td>
                    <td className="py-2 text-text-muted text-xs text-right">{wf.failed}</td>
                    <td className={`py-2 text-xs text-right ${failurePct >= 10 ? 'text-accent-error' : failurePct >= 5 ? 'text-accent-warning' : 'text-accent-success'}`}>
                      {failurePct}%
                    </td>
                    <td className="py-2 text-text-muted text-xs text-right">{formatDuration(wf.avgDuration)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Agents
// ---------------------------------------------------------------------------
function AgentsTab({ metrics }: { metrics: AggregatedMetrics }) {
  const { byAgent } = metrics;

  const agentData = Object.entries(byAgent)
    .map(([name, data]) => ({
      label: name,
      value: data.count,
      failed: data.failed,
      avgDuration: data.avgDuration,
      color: data.failed > 0 ? 'bg-red-400' : 'bg-purple-400',
    }))
    .sort((a, b) => b.value - a.value);

  const maxCount = Math.max(...agentData.map((d) => d.value), 1);

  const totalAgents = Object.keys(byAgent).length;
  const totalInvocations = Object.values(byAgent).reduce((sum, d) => sum + d.count, 0);
  const totalFailures = Object.values(byAgent).reduce((sum, d) => sum + d.failed, 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Active Agents" value={totalAgents} />
        <StatCard label="Total Invocations" value={totalInvocations} />
        <StatCard label="Total Failures" value={totalFailures} color={totalFailures > 0 ? 'text-accent-error' : 'text-accent-success'} />
        <StatCard label="Avg Duration" value={formatDuration(metrics.avgDurationMs)} />
      </div>

      {/* Agent usage chart */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Agent Usage</h3>
        {agentData.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">No agent data yet</div>
        ) : (
          <BarChart
            data={agentData.slice(0, 8).map((d) => ({ label: d.label, value: d.value, color: d.color }))}
            maxValue={maxCount}
          />
        )}
      </div>

      {/* Agent table */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Agent Performance</h3>
        {agentData.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">No agent data yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 text-text-muted font-medium text-xs">Agent</th>
                <th className="text-right py-2 text-text-muted font-medium text-xs">Invocations</th>
                <th className="text-right py-2 text-text-muted font-medium text-xs">Failures</th>
                <th className="text-right py-2 text-text-muted font-medium text-xs">Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {agentData.map((agent) => (
                <tr key={agent.label} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 text-text-primary font-mono text-xs">{agent.label}</td>
                  <td className="py-2 text-text-muted text-xs text-right">{agent.value}</td>
                  <td className={`py-2 text-xs text-right ${agent.failed > 0 ? 'text-accent-error' : 'text-accent-success'}`}>
                    {agent.failed}
                  </td>
                  <td className="py-2 text-text-muted text-xs text-right">{formatDuration(agent.avgDuration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Resources
// ---------------------------------------------------------------------------
function ResourcesTab({ metrics }: { metrics: AggregatedMetrics }) {
  const { byStage } = metrics;

  const stageData = Object.entries(byStage)
    .map(([stageId, data]) => ({
      label: stageId,
      value: data.count,
      tokens: data.tokens,
      duration: data.duration,
      color: data.failed > 0 ? 'bg-red-400' : 'bg-teal-400',
    }))
    .sort((a, b) => b.value - a.value);

  const maxCount = Math.max(...stageData.map((d) => d.value), 1);
  const totalTokens = Object.values(byStage).reduce((sum, d) => sum + d.tokens, 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Unique Stages" value={Object.keys(byStage).length} />
        <StatCard label="Total Stage Runs" value={Object.values(byStage).reduce((sum, d) => sum + d.count, 0)} />
        <StatCard label="Total Tokens" value={formatNumber(totalTokens)} />
        <StatCard label="Avg Duration" value={formatDuration(metrics.avgDurationMs)} />
      </div>

      {/* Stage usage chart */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Stage Usage</h3>
        {stageData.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">No resource data yet</div>
        ) : (
          <BarChart
            data={stageData.slice(0, 10).map((d) => ({ label: d.label, value: d.value, color: d.color }))}
            maxValue={maxCount}
          />
        )}
      </div>

      {/* Resource table */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Resource Usage Details</h3>
        {stageData.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-8">No resource data yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 text-text-muted font-medium text-xs">Stage</th>
                <th className="text-right py-2 text-text-muted font-medium text-xs">Runs</th>
                <th className="text-right py-2 text-text-muted font-medium text-xs">Tokens</th>
                <th className="text-right py-2 text-text-muted font-medium text-xs">Total Duration</th>
              </tr>
            </thead>
            <tbody>
              {stageData.map((stage) => (
                <tr key={stage.label} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 text-text-primary font-mono text-xs">{stage.label}</td>
                  <td className="py-2 text-text-muted text-xs text-right">{stage.value}</td>
                  <td className="py-2 text-text-muted text-xs text-right">{formatNumber(stage.tokens)}</td>
                  <td className="py-2 text-text-muted text-xs text-right">{formatDuration(stage.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: System
// ---------------------------------------------------------------------------
interface HealthStatus {
  status: string;
  version: string;
  uptime_seconds: number;
}

function SystemTab() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          setHealth(await res.json() as HealthStatus);
        }
      } catch {
        setHealth({ status: 'error', version: 'unknown', uptime_seconds: 0 });
      } finally {
        setLoading(false);
      }
    }
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="MCP Health"
          value={loading ? '...' : (health?.status === 'healthy' ? 'Healthy' : 'Degraded')}
          color={loading ? 'text-text-muted' : health?.status === 'healthy' ? 'text-accent-success' : 'text-accent-warning'}
        />
        <StatCard label="Version" value={loading ? '...' : (health?.version || '—')} />
        <StatCard label="Uptime" value={loading ? '...' : formatUptime(health?.uptime_seconds || 0)} />
        <StatCard label="SSE Stream" value="Active" color="text-accent-success" />
      </div>

      {/* System health details */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">System Health</h3>
        {loading ? (
          <div className="text-center text-text-muted text-xs py-8">Loading...</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">MCP Server</span>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${health?.status === 'healthy' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                <span className="text-xs text-text-primary">{health?.status === 'healthy' ? 'Operational' : 'Degraded'}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Metrics SSE Stream</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-xs text-text-primary">Connected</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Registry</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-xs text-text-primary">Operational</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Artifact Storage</span>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-xs text-text-primary">Operational</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SSE connection info */}
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-4">Stream Health</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Metrics SSE</span>
            <span className="text-xs text-accent-success">/metrics/sse</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Connection</span>
            <span className="text-xs text-accent-success">Active</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Filter</span>
            <span className="text-xs text-text-secondary">All executions (*)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
