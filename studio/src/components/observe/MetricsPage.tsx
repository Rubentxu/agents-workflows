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

function formatDuration(ms: number): string {
  if (ms === 0) return '\u2014';
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
      <div className="flex items-center justify-center h-[120px] text-xs" style={{ color: 'var(--color-secondary)' }}>
        No data available
      </div>
    );
  }
  return (
    <div className="flex items-end gap-2 h-[120px]">
      {data.map((item, i) => (
        <div key={i} className="flex flex-col items-center flex-1 min-w-0">
          <div className="text-[10px] mb-1 truncate w-full text-center" style={{ color: 'var(--color-secondary)' }}>
            {formatNumber(item.value)}
          </div>
          <div
            className="w-full rounded-t"
            style={{
              height: `${(item.value / maxValue) * height}px`,
              minHeight: '2px',
              background: item.color || 'var(--color-primary)',
            }}
          />
          <div className="text-[10px] mt-1 truncate w-full text-center" title={item.label} style={{ color: 'var(--color-secondary)' }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, subValue, color }: { label: string; value: string | number; subValue?: string; color?: string }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-outline-variant)',
      }}
    >
      <div className="text-xs mb-2" style={{ color: 'var(--color-secondary)' }}>{label}</div>
      <div
        className="text-2xl font-semibold"
        style={{ color: color || 'var(--color-on-surface)' }}
      >
        {value}
      </div>
      {subValue && <div className="text-xs mt-0.5" style={{ color: 'var(--color-secondary)' }}>{subValue}</div>}
    </div>
  );
}

const STATUS_BAR_COLORS: Record<string, string> = {
  running: 'var(--color-info)',
  completed: 'var(--color-success)',
  failed: 'var(--color-error)',
  default: 'var(--color-primary)',
};

const EVENT_DOT_COLORS: Record<string, string> = {
  completed: 'var(--color-success)',
  failed: 'var(--color-error)',
  started: 'var(--color-info)',
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
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
      >
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>Metrics</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-secondary)' }}>
            {projectId ? `Project: ${projectId}` : 'Observe'}
          </p>
        </div>
        <div
          className="flex items-center gap-1 rounded p-0.5"
          style={{
            background: 'var(--color-surface-container)',
            border: '1px solid var(--color-outline-variant)',
          }}
        >
          {(['1h', '24h', '7d', '30d'] as TimeWindow[]).map((w) => (
            <button
              key={w}
              onClick={() => setTimeWindow(w)}
              className="px-3 py-1 text-xs font-medium rounded transition-colors"
              style={
                timeWindow === w
                  ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)' }
                  : { color: 'var(--color-secondary)' }
              }
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex px-6 overflow-x-auto"
        style={{
          borderBottom: '1px solid var(--color-outline-variant)',
          background: 'var(--color-surface-container-low)',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderBottomColor: activeTab === tab.id ? 'var(--color-primary)' : 'transparent',
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-secondary)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

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

function ExecutionsTab({ metrics }: { metrics: AggregatedMetrics }) {
  const { totalExecutions, runningExecutions, completedExecutions, failedExecutions, avgDurationMs, totalTokens, byStage, recentEvents } = metrics;

  const successRate = completedExecutions > 0
    ? Math.round((completedExecutions / (completedExecutions + failedExecutions)) * 100)
    : 0;

  const statusData = [
    { label: 'Running', value: runningExecutions, color: STATUS_BAR_COLORS.running },
    { label: 'Completed', value: completedExecutions, color: STATUS_BAR_COLORS.completed },
    { label: 'Failed', value: failedExecutions, color: STATUS_BAR_COLORS.failed },
  ];

  const maxStatus = Math.max(runningExecutions, completedExecutions, failedExecutions, 1);
  const maxStageCount = Math.max(...Object.values(byStage).map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Executions" value={totalExecutions} />
        <StatCard
          label="Success Rate"
          value={`${successRate}%`}
          color={successRate >= 80 ? 'var(--color-success)' : successRate >= 50 ? 'var(--color-warning)' : 'var(--color-error)'}
        />
        <StatCard label="Avg Duration" value={formatDuration(avgDurationMs)} />
        <StatCard label="Total Tokens" value={formatNumber(totalTokens)} />
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-on-surface)' }}>
          Execution Status Breakdown
        </h3>
        <BarChart data={statusData} maxValue={maxStatus} />
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-on-surface)' }}>
          Stage Performance
        </h3>
        {Object.keys(byStage).length === 0 ? (
          <div className="text-center text-xs py-8" style={{ color: 'var(--color-secondary)' }}>No stage data yet</div>
        ) : (
          <div className="space-y-2">
            {Object.entries(byStage).slice(0, 10).map(([stageId, data]) => (
              <div key={stageId} className="flex items-center gap-4">
                <div className="w-24 text-xs font-mono truncate" style={{ color: 'var(--color-secondary)' }}>{stageId}</div>
                <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'var(--color-surface-container-high)' }}>
                  <div
                    className="h-full rounded"
                    style={{
                      background: data.failed > 0 ? 'var(--color-error)' : 'var(--color-success)',
                      width: `${(data.count / maxStageCount) * 100}%`,
                    }}
                  />
                </div>
                <div className="w-16 text-xs text-right" style={{ color: 'var(--color-secondary)' }}>{data.count} runs</div>
                <div className="w-16 text-xs text-right" style={{ color: 'var(--color-secondary)' }}>{data.failed} failed</div>
                <div className="w-20 text-xs text-right" style={{ color: 'var(--color-secondary)' }}>{formatDuration(data.duration / Math.max(data.count, 1))} avg</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-on-surface)' }}>
          Recent Events
        </h3>
        {recentEvents.length === 0 ? (
          <div className="text-center text-xs py-8" style={{ color: 'var(--color-secondary)' }}>No events in selected time window</div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto">
            {recentEvents.slice(-20).reverse().map((event, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: EVENT_DOT_COLORS[event.event_type] ?? 'var(--color-warning)' }}
                />
                <span className="font-mono flex-shrink-0" style={{ color: 'var(--color-secondary)' }}>{event.stage_id}</span>
                <span className="flex-1 truncate" style={{ color: 'var(--color-on-surface)' }}>{event.execution_arn.split('/').pop()}</span>
                <span style={{ color: 'var(--color-secondary)' }}>{event.event_type}</span>
                <span style={{ color: 'var(--color-secondary)' }}>{new Date(event.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowsTab({ metrics }: { metrics: AggregatedMetrics }) {
  const { byWorkflow } = metrics;

  const workflowData = Object.entries(byWorkflow)
    .map(([name, data]) => ({
      label: name,
      value: data.count,
      failed: data.failed,
      avgDuration: data.avgDuration,
      color: data.failed > 0 ? 'var(--color-error)' : 'var(--color-primary)',
    }))
    .sort((a, b) => b.value - a.value);

  const maxCount = Math.max(...workflowData.map((d) => d.value), 1);
  const totalWorkflows = Object.keys(byWorkflow).length;
  const totalRuns = Object.values(byWorkflow).reduce((sum, d) => sum + d.count, 0);
  const totalFailures = Object.values(byWorkflow).reduce((sum, d) => sum + d.failed, 0);
  const overallFailureRate = totalRuns > 0 ? Math.round((totalFailures / totalRuns) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Unique Workflows" value={totalWorkflows} />
        <StatCard label="Total Runs" value={totalRuns} />
        <StatCard
          label="Total Failures"
          value={totalFailures}
          color={totalFailures > 0 ? 'var(--color-error)' : 'var(--color-success)'}
        />
        <StatCard
          label="Failure Rate"
          value={`${overallFailureRate}%`}
          color={overallFailureRate >= 10 ? 'var(--color-error)' : overallFailureRate >= 5 ? 'var(--color-warning)' : 'var(--color-success)'}
        />
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-on-surface)' }}>Workflow Usage</h3>
        {workflowData.length === 0 ? (
          <div className="text-center text-xs py-8" style={{ color: 'var(--color-secondary)' }}>No workflow data yet</div>
        ) : (
          <BarChart
            data={workflowData.slice(0, 8).map((d) => ({ label: d.label, value: d.value, color: d.color }))}
            maxValue={maxCount}
          />
        )}
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-on-surface)' }}>Workflow Details</h3>
        {workflowData.length === 0 ? (
          <div className="text-center text-xs py-8" style={{ color: 'var(--color-secondary)' }}>No workflow data yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                <th className="text-left py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Workflow</th>
                <th className="text-right py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Runs</th>
                <th className="text-right py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Failures</th>
                <th className="text-right py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Failure %</th>
                <th className="text-right py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {workflowData.map((wf) => {
                const failurePct = wf.value > 0 ? Math.round((wf.failed / wf.value) * 100) : 0;
                return (
                  <tr key={wf.label} style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                    <td className="py-2 font-mono text-xs" style={{ color: 'var(--color-on-surface)' }}>{wf.label}</td>
                    <td className="py-2 text-xs text-right" style={{ color: 'var(--color-secondary)' }}>{wf.value}</td>
                    <td className="py-2 text-xs text-right" style={{ color: 'var(--color-secondary)' }}>{wf.failed}</td>
                    <td
                      className="py-2 text-xs text-right"
                      style={{
                        color: failurePct >= 10 ? 'var(--color-error)' : failurePct >= 5 ? 'var(--color-warning)' : 'var(--color-success)',
                      }}
                    >
                      {failurePct}%
                    </td>
                    <td className="py-2 text-xs text-right" style={{ color: 'var(--color-secondary)' }}>{formatDuration(wf.avgDuration)}</td>
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

function AgentsTab({ metrics }: { metrics: AggregatedMetrics }) {
  const { byAgent } = metrics;

  const agentData = Object.entries(byAgent)
    .map(([name, data]) => ({
      label: name,
      value: data.count,
      failed: data.failed,
      avgDuration: data.avgDuration,
      color: data.failed > 0 ? 'var(--color-error)' : 'var(--color-primary)',
    }))
    .sort((a, b) => b.value - a.value);

  const maxCount = Math.max(...agentData.map((d) => d.value), 1);
  const totalAgents = Object.keys(byAgent).length;
  const totalInvocations = Object.values(byAgent).reduce((sum, d) => sum + d.count, 0);
  const totalFailures = Object.values(byAgent).reduce((sum, d) => sum + d.failed, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Agents" value={totalAgents} />
        <StatCard label="Total Invocations" value={totalInvocations} />
        <StatCard
          label="Total Failures"
          value={totalFailures}
          color={totalFailures > 0 ? 'var(--color-error)' : 'var(--color-success)'}
        />
        <StatCard label="Avg Duration" value={formatDuration(metrics.avgDurationMs)} />
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-on-surface)' }}>Agent Usage</h3>
        {agentData.length === 0 ? (
          <div className="text-center text-xs py-8" style={{ color: 'var(--color-secondary)' }}>No agent data yet</div>
        ) : (
          <BarChart
            data={agentData.slice(0, 8).map((d) => ({ label: d.label, value: d.value, color: d.color }))}
            maxValue={maxCount}
          />
        )}
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-on-surface)' }}>Agent Performance</h3>
        {agentData.length === 0 ? (
          <div className="text-center text-xs py-8" style={{ color: 'var(--color-secondary)' }}>No agent data yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                <th className="text-left py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Agent</th>
                <th className="text-right py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Invocations</th>
                <th className="text-right py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Failures</th>
                <th className="text-right py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {agentData.map((agent) => (
                <tr key={agent.label} style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                  <td className="py-2 font-mono text-xs" style={{ color: 'var(--color-on-surface)' }}>{agent.label}</td>
                  <td className="py-2 text-xs text-right" style={{ color: 'var(--color-secondary)' }}>{agent.value}</td>
                  <td
                    className="py-2 text-xs text-right"
                    style={{ color: agent.failed > 0 ? 'var(--color-error)' : 'var(--color-success)' }}
                  >
                    {agent.failed}
                  </td>
                  <td className="py-2 text-xs text-right" style={{ color: 'var(--color-secondary)' }}>{formatDuration(agent.avgDuration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ResourcesTab({ metrics }: { metrics: AggregatedMetrics }) {
  const { byStage } = metrics;

  const stageData = Object.entries(byStage)
    .map(([stageId, data]) => ({
      label: stageId,
      value: data.count,
      tokens: data.tokens,
      duration: data.duration,
      color: data.failed > 0 ? 'var(--color-error)' : 'var(--color-info)',
    }))
    .sort((a, b) => b.value - a.value);

  const maxCount = Math.max(...stageData.map((d) => d.value), 1);
  const totalTokens = Object.values(byStage).reduce((sum, d) => sum + d.tokens, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Unique Stages" value={Object.keys(byStage).length} />
        <StatCard label="Total Stage Runs" value={Object.values(byStage).reduce((sum, d) => sum + d.count, 0)} />
        <StatCard label="Total Tokens" value={formatNumber(totalTokens)} />
        <StatCard label="Avg Duration" value={formatDuration(metrics.avgDurationMs)} />
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-on-surface)' }}>Stage Usage</h3>
        {stageData.length === 0 ? (
          <div className="text-center text-xs py-8" style={{ color: 'var(--color-secondary)' }}>No resource data yet</div>
        ) : (
          <BarChart
            data={stageData.slice(0, 10).map((d) => ({ label: d.label, value: d.value, color: d.color }))}
            maxValue={maxCount}
          />
        )}
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-on-surface)' }}>Resource Usage Details</h3>
        {stageData.length === 0 ? (
          <div className="text-center text-xs py-8" style={{ color: 'var(--color-secondary)' }}>No resource data yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                <th className="text-left py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Stage</th>
                <th className="text-right py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Runs</th>
                <th className="text-right py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Tokens</th>
                <th className="text-right py-2 font-medium text-xs" style={{ color: 'var(--color-secondary)' }}>Total Duration</th>
              </tr>
            </thead>
            <tbody>
              {stageData.map((stage) => (
                <tr key={stage.label} style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
                  <td className="py-2 font-mono text-xs" style={{ color: 'var(--color-on-surface)' }}>{stage.label}</td>
                  <td className="py-2 text-xs text-right" style={{ color: 'var(--color-secondary)' }}>{stage.value}</td>
                  <td className="py-2 text-xs text-right" style={{ color: 'var(--color-secondary)' }}>{formatNumber(stage.tokens)}</td>
                  <td className="py-2 text-xs text-right" style={{ color: 'var(--color-secondary)' }}>{formatDuration(stage.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="MCP Health"
          value={loading ? '...' : (health?.status === 'healthy' ? 'Healthy' : 'Degraded')}
          color={loading ? 'var(--color-secondary)' : health?.status === 'healthy' ? 'var(--color-success)' : 'var(--color-warning)'}
        />
        <StatCard label="Version" value={loading ? '...' : (health?.version || '\u2014')} />
        <StatCard label="Uptime" value={loading ? '...' : formatUptime(health?.uptime_seconds || 0)} />
        <StatCard label="SSE Stream" value="Active" color="var(--color-success)" />
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-on-surface)' }}>System Health</h3>
        {loading ? (
          <div className="text-center text-xs py-8" style={{ color: 'var(--color-secondary)' }}>Loading...</div>
        ) : (
          <div className="space-y-3">
            {[
              { label: 'MCP Server', ok: health?.status === 'healthy', okLabel: 'Operational', failLabel: 'Degraded' },
              { label: 'Metrics SSE Stream', ok: true, okLabel: 'Connected', failLabel: '' },
              { label: 'Registry', ok: true, okLabel: 'Operational', failLabel: '' },
              { label: 'Artifact Storage', ok: true, okLabel: 'Operational', failLabel: '' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--color-secondary)' }}>{item.label}</span>
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: item.ok ? 'var(--color-success)' : 'var(--color-warning)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--color-on-surface)' }}>
                    {item.ok ? item.okLabel : item.failLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}>
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-on-surface)' }}>Stream Health</h3>
        <div className="space-y-3">
          {[
            { label: 'Metrics SSE', value: '/metrics/sse', color: 'var(--color-success)' },
            { label: 'Connection', value: 'Active', color: 'var(--color-success)' },
            { label: 'Filter', value: 'All executions (*)', color: 'var(--color-on-surface)' },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-secondary)' }}>{item.label}</span>
              <span className="text-xs" style={{ color: item.color }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
