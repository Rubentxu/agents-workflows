/**
 * useDashboard — fetches all data needed for the Project Dashboard.
 * Calls MCP tools (workflows) and REST API (executions, artifacts, workspaces).
 */

import { useCallback, useEffect } from 'react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useMcpTools } from './useMcpTools';
import { useExecutionApi } from './useExecutionApi';
import type { AgentExecutionRow, WorkspaceStatus, HealthStrip } from '@/types';
import { restApiUrl } from '@/lib/apiBase';

export function useDashboard(projectId: string) {
  const { listWorkflows, loading } = useMcpTools();
  const { listExecutions, listArtifacts } = useExecutionApi();

  const {
    setWorkspaces,
    setRecentExecutions,
    setRecentWorkflows,
    setHealth,
    setLoadingWorkspaces,
    setLoadingExecutions,
    setLoadingWorkflows,
    setError,
  } = useDashboardStore();

  const fetchWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    try {
      const response = await fetch(restApiUrl('/workspaces'));
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json() as { workspaces?: { id: string; name: string; description?: string }[] };
      const workspaces: WorkspaceStatus[] = (data?.workspaces ?? []).map((w) => ({
        id: w.id,
        name: w.name,
        status: 'healthy',
        activeExecutions: 0,
        failedLast24h: 0,
      }));
      setWorkspaces(workspaces);
    } catch (err) {
      setError('workspaces', err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setLoadingWorkspaces(false);
    }
  }, [setWorkspaces, setLoadingWorkspaces, setError]);

  const fetchAll = useCallback(async () => {
    // Fetch workflows (available via MCP)
    setLoadingWorkflows(true);
    try {
      const workflowNodes = await listWorkflows();
      // Filter to project-scoped workflows if projectId provided
      const filtered = projectId
        ? workflowNodes.filter((n) => n.namespace === `project/${projectId}`)
        : workflowNodes;
      setRecentWorkflows(filtered.slice(0, 10));
    } catch (err) {
      setError('workflows', err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoadingWorkflows(false);
    }

    // Fetch executions (REST API)
    setLoadingExecutions(true);
    try {
      const execs = await listExecutions({ limit: 20 });
      setRecentExecutions(execs as AgentExecutionRow[]);
    } catch (err) {
      setError('executions', err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoadingExecutions(false);
    }

    // Fetch artifacts for count (REST API)
    try {
      const artifacts = await listArtifacts({ limit: 1 });
      const count = artifacts.length > 0 ? artifacts.length : 0;
      setHealth({ artifactCount: count });
    } catch {
      // Ignore artifact errors
    }

    // Fetch workspaces (REST API)
    await fetchWorkspaces();

    // Compute health from executions if available
    const execs = useDashboardStore.getState().recentExecutions;
    if (execs.length > 0) {
      const completed = execs.filter((e) => e.status === 'completed');
      const failed = execs.filter((e) => e.status === 'failed');
      const active = execs.filter((e) => e.status === 'running' || e.status === 'pending');
      const durations = execs
        .filter((e) => e.durationMs != null)
        .map((e) => e.durationMs!);
      const avgDuration = durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

      const health: Partial<HealthStrip> = {
        activeExecutions: active.length,
        failedExecutions: failed.length,
        successRate: completed.length > 0
          ? Math.round((completed.length / execs.length) * 100)
          : 100,
        avgDurationMs: avgDuration,
      };
      setHealth(health);
    }
  }, [
    projectId,
    listWorkflows,
    listExecutions,
    listArtifacts,
    fetchWorkspaces,
    setWorkspaces,
    setRecentExecutions,
    setRecentWorkflows,
    setHealth,
    setLoadingWorkspaces,
    setLoadingExecutions,
    setLoadingWorkflows,
    setError,
  ]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { loading, refetch: fetchAll };
}
