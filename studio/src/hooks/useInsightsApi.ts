/**
 * useInsightsApi — fetch and filter insights from Studio REST API.
 */

import { useCallback, useState } from 'react';
import { restApiUrl } from '@/lib/apiBase';

export interface Insight {
  id: number;
  execution_id: string;
  stage_id?: string;
  insight_type: string;
  data: string;
  created_at: string;
}

export interface UseInsightsOptions {
  execution_arn?: string;
  stage_id?: string;
  insight_type?: string;
}

export function useInsightsApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryInsights = useCallback(async (options?: UseInsightsOptions): Promise<Insight[]> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options?.execution_arn) params.set('execution_arn', options.execution_arn);
      if (options?.stage_id) params.set('stage_id', options.stage_id);
      if (options?.insight_type) params.set('insight_type', options.insight_type);

      const response = await fetch(restApiUrl(`/insights?${params}`));
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json() as { insights?: Insight[] };
      return data.insights ?? [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to query insights';
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, queryInsights };
}
