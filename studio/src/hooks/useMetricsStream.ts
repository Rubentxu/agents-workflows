import { useCallback, useEffect, useRef } from 'react';
import { useMetricsStore } from '@/stores/metricsStore';
import type { MetricEvent } from '@/types';

const METRICS_API = '/metrics/sse';

/**
 * Hook to subscribe to metrics SSE stream
 */
export function useMetricsStream(executionArn: string | null) {
  const addMetricEvent = useMetricsStore((state) => state.addMetricEvent);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!executionArn) return;

    const url = executionArn === '*'
      ? `${METRICS_API}`
      : `${METRICS_API}?execution=${encodeURIComponent(executionArn)}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as MetricEvent;
        addMetricEvent(data);
      } catch {
        console.error('Failed to parse metric event:', event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [executionArn, addMetricEvent]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  return { disconnect };
}

/**
 * Hook to subscribe to all metrics (wildcard)
 */
export function useAllMetricsStream() {
  return useMetricsStream('*');
}
