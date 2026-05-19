/**
 * Metric event types for execution monitoring
 */
export type MetricEventType =
  | 'started'
  | 'completed'
  | 'failed'
  | 'progress'
  | 'artifact_created';

/**
 * Metric event for SSE streaming
 */
export interface MetricEvent {
  execution_arn: string;
  stage_id: string;
  timestamp: string;
  event_type: MetricEventType;
  metrics: MetricData;
}

export interface MetricData {
  tokens_used?: number;
  duration_ms?: number;
  progress_percent?: number;
  artifacts_created?: string[];
  errors?: string[];
  custom?: unknown;
}

/**
 * Stage metrics summary
 */
export interface StageMetrics {
  stage_id: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  tokens_used: number;
  tool_invocations: number;
  artifacts_count: number;
  errors_count: number;
}

/**
 * Execution metrics summary
 */
export interface ExecutionMetrics {
  execution_arn: string;
  total_duration_ms?: number;
  total_tokens: number;
  stages_completed: number;
  stages_failed: number;
  total_artifacts: number;
  stage_metrics: StageMetrics[];
}
