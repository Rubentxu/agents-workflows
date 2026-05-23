/**
 * useSchema — fetch JSON Schema for resource types from Studio REST API.
 * Used by Monaco editors for validation and autocomplete.
 */

import { useCallback, useState } from 'react';
import { restApiUrl } from '@/lib/apiBase';

export type ResourceType = 'workflow' | 'agent' | 'skill' | 'prompt' | 'tool' | 'template';

export function useSchema() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchema = useCallback(async (resourceType: ResourceType): Promise<object | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(restApiUrl(`/schemas/${resourceType}`));
      if (!response.ok) {
        throw new Error(`Failed to fetch schema: HTTP ${response.status}`);
      }
      const schema = await response.json();
      return schema as object;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch schema';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllSchemas = useCallback(async (): Promise<Record<ResourceType, object | null>> => {
    const types: ResourceType[] = ['workflow', 'agent', 'skill', 'prompt', 'tool', 'template'];
    const results: Record<ResourceType, object | null> = {
      workflow: null,
      agent: null,
      skill: null,
      prompt: null,
      tool: null,
      template: null,
    };

    await Promise.all(
      types.map(async (type) => {
        const schema = await fetchSchema(type);
        results[type] = schema;
      })
    );

    return results;
  }, [fetchSchema]);

  return { loading, error, fetchSchema, fetchAllSchemas };
}
