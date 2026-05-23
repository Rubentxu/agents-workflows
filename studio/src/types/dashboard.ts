/**
 * Dashboard-specific types for the Project Dashboard.
 * Used by stores, hooks, and page components.
 */

export type HealthStatus = 'healthy' | 'degraded' | 'failing' | 'idle';

export interface WorkspaceStatus {
  id: string;
  name: string;
  status: HealthStatus;
  activeExecutions: number;
  failedLast24h: number;
  lastExecution?: string;
}

export interface AgentExecutionRow {
  id: string;
  agentArn: string;
  workflowArn: string;
  workspaceName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted' | 'paused';
  durationMs?: number;
  startedAt: string;
  updatedAt: string;
}

export interface ArtifactRow {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  workspaceId: string;
  executionArn?: string;
}

export interface HealthStrip {
  activeExecutions: number;
  failedExecutions: number;
  successRate: number;
  avgDurationMs: number;
  queued: number;
  artifactCount: number;
  openAlerts: number;
}
