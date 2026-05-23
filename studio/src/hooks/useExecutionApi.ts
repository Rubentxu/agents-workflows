/**
 * useExecutionApi — execution and artifact data via Studio REST API.
 * These are separate from MCP because they target the Studio REST layer,
 * not the agentic MCP tools.
 */

import { useCallback, useState } from 'react';
import type { AgentExecutionRow, ArtifactRow } from '@/types/dashboard';
import { restApiUrl } from '@/lib/apiBase';

export function useExecutionApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * List recent agent executions via REST API.
   * Maps snake_case API fields to camelCase AgentExecutionRow.
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

      const response = await fetch(restApiUrl(`/executions?${query}`));
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json() as {
        executions?: Array<{
          arn: string;
          workflow_arn: string;
          workspace_id: string;
          status: string;
          current_stage?: string;
          started_at: string;
          updated_at?: string;
        }>;
      };
      // Map API snake_case to frontend camelCase
      const mapped: AgentExecutionRow[] = (data?.executions ?? []).map((e) => ({
        id: e.arn,
        agentArn: e.arn, // REST API does not separate agent ARN
        workflowArn: e.workflow_arn,
        workspaceName: e.workspace_id,
        status: (e.status ?? 'pending') as AgentExecutionRow['status'],
        startedAt: e.started_at,
        updatedAt: e.updated_at ?? e.started_at,
      }));
      return mapped;
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
   * Maps snake_case API fields to camelCase ArtifactRow.
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

      const response = await fetch(restApiUrl(`/artifacts?${query}`));
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json() as {
        artifacts?: Array<{
          id: string;
          name: string;
          content_type: string;
          size: number;
          created_at: string;
          execution_id?: string;
          workspace_id?: string;
        }>;
      };
      // Map API snake_case to frontend camelCase
      const mapped: ArtifactRow[] = (data?.artifacts ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        contentType: a.content_type,
        sizeBytes: a.size,
        createdAt: a.created_at,
        workspaceId: a.workspace_id ?? '',
        executionArn: a.execution_id,
      }));
      return mapped;
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
