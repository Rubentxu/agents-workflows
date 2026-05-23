/**
 * useContent — fetch and update raw file content for resources.
 * Also provides validation via the Studio REST API.
 */

import { useCallback, useState } from 'react';
import { restApiUrl } from '@/lib/apiBase';

const API = restApiUrl('');

export interface ValidationDiagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  location?: {
    line: number;
    column?: number;
  };
  code: string;
}

export interface ValidationResult {
  arn: string;
  valid: boolean;
  diagnostics: ValidationDiagnostic[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
    hints: number;
  };
}

export function useContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async (arn: string): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/content/${encodeURIComponent(arn)}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch content: HTTP ${response.status}`);
      }
      const data = await response.json() as { content?: string };
      return data.content ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch content';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateContent = useCallback(async (arn: string, content: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/content/${encodeURIComponent(arn)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update content: HTTP ${response.status}`);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update content';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const validateContent = useCallback(async (arn: string, content: string): Promise<ValidationResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/validate/${encodeURIComponent(arn)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        throw new Error(`Failed to validate content: HTTP ${response.status}`);
      }
      const result = await response.json() as ValidationResult;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to validate content';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, fetchContent, updateContent, validateContent };
}
