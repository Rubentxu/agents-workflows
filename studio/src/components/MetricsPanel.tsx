import { useEffect, useRef } from 'react';
import { useMetricsStore } from '@/stores/metricsStore';
import { useWorkflowEditorStore } from '@/stores/workflowEditorStore';
import type { MetricEvent } from '@/types';

export function MetricsPanel() {
  const metricsEvents = useMetricsStore((state) => state.metricsEvents);
  const selectedNodeId = useWorkflowEditorStore((state) => state.selectedNodeId);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [metricsEvents.length]);

  const filteredEvents = selectedNodeId
    ? metricsEvents.filter((e) => e.stage_id === selectedNodeId)
    : metricsEvents;

  const eventsByExecution = filteredEvents.reduce(
    (acc, event) => {
      if (!acc[event.execution_arn]) {
        acc[event.execution_arn] = [];
      }
      acc[event.execution_arn].push(event);
      return acc;
    },
    {} as Record<string, MetricEvent[]>
  );

  if (metricsEvents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-on-surface/40 text-sm">
        No metrics yet. Execute a workflow to see live metrics.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface-container">
      <div className="px-4 py-3 bg-surface border-b border-outline">
        <h2 className="font-semibold text-on-surface">Live Metrics</h2>
        <p className="text-xs text-on-surface/50">
          {metricsEvents.length} events
          {selectedNodeId && ` (filtered: ${selectedNodeId})`}
        </p>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {Object.entries(eventsByExecution).map(([executionArn, events]) => (
          <ExecutionMetricsGroup
            key={executionArn}
            executionArn={executionArn}
            events={events}
          />
        ))}
      </div>
    </div>
  );
}

interface ExecutionMetricsGroupProps {
  executionArn: string;
  events: MetricEvent[];
}

function ExecutionMetricsGroup({ executionArn, events }: ExecutionMetricsGroupProps) {
  const statusCounts = events.reduce(
    (acc, event) => {
      acc[event.event_type] = (acc[event.event_type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="bg-surface rounded-lg border border-outline overflow-hidden">
      <div className="px-3 py-2 bg-surface-container-low border-b border-outline">
        <div className="font-mono text-xs text-on-surface/60 truncate">
          {executionArn}
        </div>
        <div className="flex gap-2 mt-1">
          {Object.entries(statusCounts).map(([type, count]) => (
            <span
              key={type}
              className={`text-xs px-2 py-0.5 rounded ${
                type === 'completed'
                  ? 'bg-success-container text-on-success-container'
                  : type === 'failed'
                  ? 'bg-error-container text-on-error-container'
                  : type === 'started'
                  ? 'bg-info-container text-on-info-container'
                  : 'bg-surface-container-high text-on-surface/60'
              }`}
            >
              {type}: {count}
            </span>
          ))}
        </div>
      </div>

      <div className="divide-y divide-outline-variant">
        {events.map((event, index) => (
          <MetricEventRow key={`${event.stage_id}-${index}`} event={event} />
        ))}
      </div>
    </div>
  );
}

interface MetricEventRowProps {
  event: MetricEvent;
}

function MetricEventRow({ event }: MetricEventRowProps) {
  const time = new Date(event.timestamp).toLocaleTimeString();

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-xs font-medium text-on-surface/70">
          {event.stage_id}
        </span>
        <span className="text-xs text-on-surface/40">{time}</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            event.event_type === 'completed'
              ? 'bg-success-container text-on-success-container'
              : event.event_type === 'failed'
              ? 'bg-error-container text-on-error-container'
              : event.event_type === 'started'
              ? 'bg-info-container text-on-info-container'
              : event.event_type === 'progress'
              ? 'bg-warning-container text-on-warning-container'
              : 'bg-surface-container-high text-on-surface/60'
          }`}
        >
          {event.event_type}
        </span>
        {event.metrics.tokens_used !== undefined && (
          <span className="text-xs text-on-surface/50">
            {event.metrics.tokens_used} tokens
          </span>
        )}
        {event.metrics.duration_ms !== undefined && (
          <span className="text-xs text-on-surface/50">
            {event.metrics.duration_ms}ms
          </span>
        )}
        {event.metrics.progress_percent !== undefined && (
          <span className="text-xs text-on-surface/50">
            {event.metrics.progress_percent}%
          </span>
        )}
      </div>
      {event.metrics.artifacts_created && event.metrics.artifacts_created.length > 0 && (
        <div className="mt-1 text-xs text-on-surface/40">
          Artifacts: {event.metrics.artifacts_created.join(', ')}
        </div>
      )}
      {event.metrics.errors && event.metrics.errors.length > 0 && (
        <div className="mt-1 text-xs text-error">
          Errors: {event.metrics.errors.join(', ')}
        </div>
      )}
    </div>
  );
}
