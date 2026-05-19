/**
 * ResourceDetailPage — /studio/projects/:projectId/registry/resource?arn={encodedArn}
 * Shows read-only detail for a single resource, with actions for edit/override.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useMcpTools } from '@/hooks/useMcpTools';

/**
 * ResourceDetailPage fetches a resource by ARN from MCP and displays it.
 * Opens read-only by default. Actions for Customize/Edit are explicit.
 */
export function ResourceDetailPage() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getResourceByArn } = useMcpTools();

  const arn = searchParams.get('arn');

  const [resource, setResource] = useState<{ kind: string; data: unknown } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResource = useCallback(async () => {
    if (!arn) {
      setError('No ARN provided');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getResourceByArn(arn);
      setResource(result);
      if (!result) setError('Resource not found');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load resource');
    } finally {
      setLoading(false);
    }
  }, [arn, getResourceByArn]);

  useEffect(() => {
    fetchResource();
  }, [fetchResource]);

  if (!arn) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-text-muted text-sm mb-4">No resource selected.</p>
            <button
              onClick={() => navigate(`/studio/projects/${projectId}/registry/resources`)}
              className="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent/90"
            >
              Back to Registry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/studio/projects/${projectId}/registry/resources`)}
            className="text-text-muted hover:text-text-primary transition-colors text-sm"
          >
            ← Registry
          </button>
          <div>
            <h1 className="text-lg font-semibold text-text-primary font-mono truncate max-w-md">
              {arn}
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              {projectId ? `Project: ${projectId}` : 'Resource Detail'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchResource}
            disabled={loading}
            className="px-3 py-1.5 text-xs border border-border-default rounded hover:bg-bg-elevated text-text-secondary"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={() => navigate(`/studio/projects/${projectId}/registry/resource?arn=${encodeURIComponent(arn)}&action=edit`)}
            className="px-3 py-1.5 text-xs border border-accent text-accent rounded hover:bg-accent/10"
          >
            Edit original
          </button>
          <button
            onClick={() => navigate(`/studio/projects/${projectId}/registry/resource?arn=${encodeURIComponent(arn)}&action=override`)}
            className="px-3 py-1.5 text-xs border border-accent text-accent rounded hover:bg-accent/10"
          >
            Customize for workspace
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 p-4 bg-accent-error/5 border border-accent-error/20 rounded text-accent-error text-sm">
            {error}
          </div>
        )}

        {loading && !resource ? (
          <div className="text-center text-text-muted text-sm animate-pulse py-8">
            Loading resource...
          </div>
        ) : resource ? (
          <div className="space-y-4">
            {/* Kind badge */}
            <div>
              <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-1 rounded capitalize">
                {resource.kind}
              </span>
            </div>

            {/* YAML preview — show the raw data as formatted YAML */}
            <div className="bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-border-subtle bg-bg-elevated/50">
                <span className="text-xs font-medium text-text-muted">Resource Definition</span>
              </div>
              <pre className="p-4 text-xs text-text-secondary overflow-x-auto font-mono max-h-96">
                {JSON.stringify(resource.data, null, 2)}
              </pre>
            </div>

            {/* Metadata */}
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-4">
              <h3 className="text-xs font-semibold text-text-muted uppercase mb-2">ARN</h3>
              <div className="font-mono text-sm text-text-primary">{arn}</div>
            </div>
          </div>
        ) : (
          <div className="text-center text-text-muted text-sm py-8">
            Resource not found.
          </div>
        )}
      </div>
    </div>
  );
}
