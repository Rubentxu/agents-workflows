/**
 * useResourceApi — CRUD operations for all resource types via Studio REST API.
 * Wraps POST /api/{kind}, PUT /api/{kind}/{arn}, DELETE /api/{kind}/{arn}.
 */

import { useCallback, useState } from 'react';

const API = '/api';

export function useResourceApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create a new resource.
   * @param kind e.g. "workflow", "agent", "skill", "prompt"
   * @param body The resource manifest body
   * @returns The created resource ARN
   */
  const createResource = useCallback(async (kind: string, body: unknown): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/${kind}s`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
        throw new Error(err.message ?? `Failed to create ${kind}`);
      }
      const data = await response.json() as { arn?: string };
      return data.arn ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to create ${kind}`;
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update an existing resource.
   */
  const updateResource = useCallback(async (arn: string, body: unknown): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/${arnToKind(arn)}/${encodeURIComponent(arn)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`Failed to update: HTTP ${response.status}`);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update resource';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Delete a resource.
   */
  const deleteResource = useCallback(async (arn: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/${arnToKind(arn)}/${encodeURIComponent(arn)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`Failed to delete: HTTP ${response.status}`);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete resource';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, createResource, updateResource, deleteResource };
}

/**
 * Extract resource kind from ARN.
 * e.g. arn:local:global:workflow/sdd-full → "workflow"
 */
function arnToKind(arn: string): string {
  const match = arn.match(/^arn:local:[^:]+:([^/]+)\//);
  if (!match) throw new Error(`Invalid ARN: ${arn}`);
  return match[1];
}
