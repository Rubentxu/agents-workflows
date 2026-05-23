/**
 * useWorkspaceApi — CRUD operations for workspaces via Studio REST API.
 * GET /api/workspaces, POST /api/workspaces, DELETE /api/workspaces/{id}
 */

import { useCallback, useState } from 'react';
import { restApiUrl } from '@/lib/apiBase';

const API = restApiUrl('');

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  stats?: {
    executions_count: number;
    artifacts_count: number;
    last_execution?: string;
  };
}

export interface ServerConfig {
  default_workflow: string;
  max_concurrent_executions: number;
  artifact_size_threshold_bytes: number;
}

export function useWorkspaceApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listWorkspaces = useCallback(async (): Promise<Workspace[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/workspaces`);
      if (!response.ok) {
        throw new Error(`Failed to list workspaces: HTTP ${response.status}`);
      }
      const data = await response.json() as { workspaces?: Workspace[] };
      return data.workspaces ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list workspaces';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getWorkspace = useCallback(async (workspaceId: string): Promise<Workspace | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/workspaces/${encodeURIComponent(workspaceId)}`);
      if (!response.ok) {
        throw new Error(`Failed to get workspace: HTTP ${response.status}`);
      }
      return await response.json() as Workspace;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get workspace';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createWorkspace = useCallback(async (body: { name: string; description?: string }): Promise<Workspace | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
        throw new Error(err.message ?? `Failed to create workspace`);
      }
      return await response.json() as Workspace;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create workspace';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteWorkspace = useCallback(async (workspaceId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`Failed to delete workspace: HTTP ${response.status}`);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete workspace';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const getConfig = useCallback(async (): Promise<ServerConfig | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/config`);
      if (!response.ok) {
        throw new Error(`Failed to get config: HTTP ${response.status}`);
      }
      return await response.json() as ServerConfig;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get config';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, listWorkspaces, getWorkspace, createWorkspace, deleteWorkspace, getConfig };
}
