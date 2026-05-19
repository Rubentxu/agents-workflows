/**
 * useExecutionApi — execution and artifact data via Studio REST API.
 * These are separate from MCP because they target the Studio REST layer,
 * not the agentic MCP tools.
 */

import { useCallback, useState } from 'react';
import type { AgentExecutionRow, ArtifactRow } from '@/types/dashboard';

export function useExecutionApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * List recent agent executions via REST API.
   */
  const listExecutions = useCallback(async (params?: {
    workspace_id?: string;
    limit?: number;
  }): Promise<AgentExecutionRow[]> => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (params?.workspace_id) query.set('workspace_id', params.workspace_id);
      if (params?.limit) query.set('limit', String(params.limit));

      const response = await fetch(`/api/executions?${query}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json() as { executions?: AgentExecutionRow[] };
      return data?.executions ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list executions';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * List artifacts via REST API.
   */
  const listArtifacts = useCallback(async (params?: {
    workspace_id?: string;
    limit?: number;
  }): Promise<ArtifactRow[]> => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (params?.workspace_id) query.set('workspace_id', params.workspace_id);
      if (params?.limit) query.set('limit', String(params.limit));

      const response = await fetch(`/api/artifacts?${query}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json() as { artifacts?: ArtifactRow[] };
      return data?.artifacts ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list artifacts';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, listExecutions, listArtifacts };
}
