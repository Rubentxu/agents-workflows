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
            <p className="text-secondary text-sm mb-4">No resource selected.</p>
            <button
              onClick={() => navigate(`/studio/projects/${projectId}/registry/resources`)}
              className="px-4 py-2 bg-primary text-on-primary text-sm rounded hover:bg-primary/90"
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
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/studio/projects/${projectId}/registry/resources`)}
            className="text-secondary hover:text-on-surface transition-colors text-sm"
          >
            ← Registry
          </button>
          <div>
            <h1 className="text-lg font-semibold text-on-surface font-mono truncate max-w-md">
              {arn}
            </h1>
            <p className="text-xs text-secondary mt-0.5">
              {projectId ? `Project: ${projectId}` : 'Resource Detail'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchResource}
            disabled={loading}
            className="px-3 py-1.5 text-xs border border-outline rounded hover:bg-surface-container text-secondary"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={() => navigate(`/studio/projects/${projectId}/registry/resource?arn=${encodeURIComponent(arn)}&action=edit`)}
            className="px-3 py-1.5 text-xs border border-primary text-primary rounded hover:bg-primary/10"
          >
            Edit original
          </button>
          <button
            onClick={() => navigate(`/studio/projects/${projectId}/registry/resource?arn=${encodeURIComponent(arn)}&action=override`)}
            className="px-3 py-1.5 text-xs border border-primary text-primary rounded hover:bg-primary/10"
          >
            Customize for workspace
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 p-4 bg-error/5 border border-primary-error/20 rounded text-error text-sm">
            {error}
          </div>
        )}

        {loading && !resource ? (
          <div className="text-center text-secondary text-sm animate-pulse py-8">
            Loading resource...
          </div>
        ) : resource ? (
          <div className="space-y-4">
            {/* Kind badge */}
            <div>
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded capitalize">
                {resource.kind}
              </span>
            </div>

            {/* YAML preview — show the raw data as formatted YAML */}
            <div className="bg-surface border border-outline-variant rounded-lg overflow-hidden">
              <div className="px-4 py-2 border-b border-outline-variant bg-surface-container/50">
                <span className="text-xs font-medium text-secondary">Resource Definition</span>
              </div>
              <pre className="p-4 text-xs text-secondary overflow-x-auto font-mono max-h-96">
                {JSON.stringify(resource.data, null, 2)}
              </pre>
            </div>

            {/* Metadata */}
            <div className="bg-surface border border-outline-variant rounded-lg p-4">
              <h3 className="text-xs font-semibold text-secondary uppercase mb-2">ARN</h3>
              <div className="font-mono text-sm text-on-surface">{arn}</div>
            </div>
          </div>
        ) : (
          <div className="text-center text-secondary text-sm py-8">
            Resource not found.
          </div>
        )}
      </div>
    </div>
  );
}
