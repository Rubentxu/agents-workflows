/**
 * useResourceCatalog — shared fetch and state logic for resource catalog pages.
 * Eliminates the repeated fetch/callback/setState pattern across catalog pages.
 */

import { useState, useCallback } from 'react';
import type { RegistryNode } from '@/types';

export interface ResourceCatalogItem {
  id: string;
  name: string;
  namespace: string;
  [key: string]: unknown;
}

export interface UseResourceCatalogOptions {
  fetchFn: () => Promise<RegistryNode[]>;
  resourceLabel: string;
}

export function useResourceCatalog({ fetchFn, resourceLabel }: UseResourceCatalogOptions) {
  const [items, setItems] = useState<ResourceCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setItems(
        result.map((r: unknown) => {
          const node = r as RegistryNode;
          return { id: node.id, name: node.name, namespace: node.namespace };
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${resourceLabel}`);
    } finally {
      setLoading(false);
    }
  }, [fetchFn, resourceLabel]);

  return { items, setItems, loading, error, fetch };
}
