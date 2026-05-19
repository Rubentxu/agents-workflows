/**
 * metricsStore — real-time metrics stream.
 * Accumulates metric events from SSE for the MetricsPanel.
 */

import { create } from 'zustand';
import type { MetricEvent } from '@/types';

export interface AggregatedMetrics {
  totalExecutions: number;
  runningExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  totalDurationMs: number;
  avgDurationMs: number;
  totalTokens: number;
  byWorkflow: Record<string, { count: number; failed: number; avgDuration: number }>;
  byAgent: Record<string, { count: number; failed: number; avgDuration: number }>;
  byStage: Record<string, { count: number; failed: number; tokens: number; duration: number }>;
  recentEvents: MetricEvent[];
  timeWindowStart: number;
}

interface MetricsState {
  metricsEvents: MetricEvent[];
  aggregatedMetrics: AggregatedMetrics;
  addMetricEvent: (event: MetricEvent) => void;
  clearMetrics: () => void;
  setTimeWindow: (windowMs: number) => void;
}

function parseExecutionArn(arn: string): { workspaceId?: string; workflowName?: string; agentName?: string } {
  const parts = arn.split(':');
  if (parts.length < 6) return {};
  const typePart = parts[5] || '';
  const namePart = parts[6] || '';
  if (typePart === 'execution' && namePart) {
    const execParts = namePart.split('/');
    return {
      workspaceId: execParts[0],
      workflowName: execParts[2],
      agentName: execParts[1],
    };
  }
  return {};
}

function computeAggregated(events: MetricEvent[], windowStart: number): AggregatedMetrics {
  const recentEvents = events.filter((e) => new Date(e.timestamp).getTime() >= windowStart);

  const executionMap = new Map<string, { status: string; duration: number; tokens: number; stages: string[] }>();
  const workflowStats = new Map<string, { count: number; failed: number; durations: number[] }>();
  const agentStats = new Map<string, { count: number; failed: number; durations: number[] }>();
  const stageStats = new Map<string, { count: number; failed: number; tokens: number; durations: number[] }>();

  let totalDuration = 0;
  let completedCount = 0;
  let failedCount = 0;
  let totalTokens = 0;

  for (const event of recentEvents) {
    const existing = executionMap.get(event.execution_arn) || { status: 'running', duration: 0, tokens: 0, stages: [] };
    const { workflowName, agentName } = parseExecutionArn(event.execution_arn);

    if (event.event_type === 'started') {
      existing.status = 'running';
      if (!existing.stages.includes(event.stage_id)) existing.stages.push(event.stage_id);
      executionMap.set(event.execution_arn, existing);
    } else if (event.event_type === 'completed') {
      existing.status = 'completed';
      if (event.metrics.duration_ms) {
        existing.duration += event.metrics.duration_ms;
        totalDuration += event.metrics.duration_ms;
      }
      if (event.metrics.tokens_used) {
        existing.tokens += event.metrics.tokens_used;
        totalTokens += event.metrics.tokens_used;
      }
      if (!existing.stages.includes(event.stage_id)) existing.stages.push(event.stage_id);
      executionMap.set(event.execution_arn, existing);
      completedCount++;

      if (workflowName) {
        const ws = workflowStats.get(workflowName) || { count: 0, failed: 0, durations: [] };
        ws.count++;
        if (event.metrics.duration_ms) ws.durations.push(event.metrics.duration_ms);
        workflowStats.set(workflowName, ws);
      }
      if (agentName) {
        const as_ = agentStats.get(agentName) || { count: 0, failed: 0, durations: [] };
        as_.count++;
        if (event.metrics.duration_ms) as_.durations.push(event.metrics.duration_ms);
        agentStats.set(agentName, as_);
      }

      const ss = stageStats.get(event.stage_id) || { count: 0, failed: 0, tokens: 0, durations: [] };
      ss.count++;
      if (event.metrics.duration_ms) ss.durations.push(event.metrics.duration_ms);
      if (event.metrics.tokens_used) ss.tokens += event.metrics.tokens_used;
      stageStats.set(event.stage_id, ss);
    } else if (event.event_type === 'failed') {
      existing.status = 'failed';
      if (event.metrics.duration_ms) {
        existing.duration += event.metrics.duration_ms;
        totalDuration += event.metrics.duration_ms;
      }
      executionMap.set(event.execution_arn, existing);
      failedCount++;

      if (workflowName) {
        const ws = workflowStats.get(workflowName) || { count: 0, failed: 0, durations: [] };
        ws.count++;
        ws.failed++;
        workflowStats.set(workflowName, ws);
      }
      if (agentName) {
        const as_ = agentStats.get(agentName) || { count: 0, failed: 0, durations: [] };
        as_.count++;
        as_.failed++;
        agentStats.set(agentName, as_);
      }

      const ss = stageStats.get(event.stage_id) || { count: 0, failed: 0, tokens: 0, durations: [] };
      ss.count++;
      ss.failed++;
      if (event.metrics.tokens_used) ss.tokens += event.metrics.tokens_used;
      stageStats.set(event.stage_id, ss);
    }
  }

  const totalExecutions = executionMap.size;
  const runningExecutions = totalExecutions - completedCount - failedCount;
  const avgDurationMs = completedCount > 0 ? totalDuration / completedCount : 0;

  const byWorkflow: AggregatedMetrics['byWorkflow'] = {};
  for (const [name, stats] of workflowStats) {
    const avgDur = stats.durations.length > 0 ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length : 0;
    byWorkflow[name] = { count: stats.count, failed: stats.failed, avgDuration: avgDur };
  }

  const byAgent: AggregatedMetrics['byAgent'] = {};
  for (const [name, stats] of agentStats) {
    const avgDur = stats.durations.length > 0 ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length : 0;
    byAgent[name] = { count: stats.count, failed: stats.failed, avgDuration: avgDur };
  }

  const byStage: AggregatedMetrics['byStage'] = {};
  for (const [stageId, stats] of stageStats) {
    const totalDur = stats.durations.reduce((a, b) => a + b, 0);
    byStage[stageId] = { count: stats.count, failed: stats.failed, tokens: stats.tokens, duration: totalDur };
  }

  return {
    totalExecutions,
    runningExecutions,
    completedExecutions: completedCount,
    failedExecutions: failedCount,
    totalDurationMs: totalDuration,
    avgDurationMs,
    totalTokens,
    byWorkflow,
    byAgent,
    byStage,
    recentEvents: recentEvents.slice(-100),
    timeWindowStart: windowStart,
  };
}

const TIME_WINDOWS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export const useMetricsStore = create<MetricsState>((set) => ({
  metricsEvents: [],
  aggregatedMetrics: {
    totalExecutions: 0,
    runningExecutions: 0,
    completedExecutions: 0,
    failedExecutions: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    totalTokens: 0,
    byWorkflow: {},
    byAgent: {},
    byStage: {},
    recentEvents: [],
    timeWindowStart: Date.now() - TIME_WINDOWS['24h'],
  },
  addMetricEvent: (event) => set((state) => {
    const newEvents = [...state.metricsEvents.slice(-499), event];
    const windowStart = state.aggregatedMetrics.timeWindowStart;
    return {
      metricsEvents: newEvents,
      aggregatedMetrics: computeAggregated(newEvents, windowStart),
    };
  }),
  clearMetrics: () => set({ metricsEvents: [], aggregatedMetrics: {
    totalExecutions: 0,
    runningExecutions: 0,
    completedExecutions: 0,
    failedExecutions: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    totalTokens: 0,
    byWorkflow: {},
    byAgent: {},
    byStage: {},
    recentEvents: [],
    timeWindowStart: Date.now() - TIME_WINDOWS['24h'],
  }}),
  setTimeWindow: (windowMs) => set((state) => ({
    aggregatedMetrics: computeAggregated(state.metricsEvents, Date.now() - windowMs),
  })),
}));
