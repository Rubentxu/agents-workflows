/**
 * ArtifactsListPage — /studio/projects/:projectId/observe/artifacts
 * Lists artifacts from agent executions.
 */

import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExecutionApi } from '@/hooks/useExecutionApi';
import type { ArtifactRow } from '@/types/dashboard';

export function ArtifactsListPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { listArtifacts } = useExecutionApi();

  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchArtifacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listArtifacts({ limit: 50 });
      setArtifacts(result);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); } finally { setLoading(false); }
  }, [listArtifacts]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Artifacts</h1>
          <p className="text-sm text-text-muted mt-0.5">{projectId ? `Project: ${projectId}` : 'Observe'}</p>
        </div>
        <button onClick={fetchArtifacts} disabled={loading}
          className="px-3 py-1.5 text-xs border border-border-default rounded hover:bg-bg-elevated text-text-secondary">
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && <div className="mb-4 p-4 bg-accent-error/10 border border-accent-error/20 rounded text-accent-error text-sm">{error}</div>}

        {artifacts.length === 0 && !loading ? (
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
            <p className="text-text-muted text-sm">No artifacts found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {artifacts.map(artifact => (
              <div key={artifact.id}
                onClick={() => artifact.executionArn && navigate(`/studio/projects/${projectId}/observe/agent-executions/${encodeURIComponent(artifact.executionArn)}`)}
                className="flex items-center gap-4 px-4 py-3 bg-bg-surface border border-border-subtle rounded-lg hover:border-accent/50 cursor-pointer group">
                <div className="w-8 h-8 rounded bg-cyan-500/10 flex items-center justify-center text-cyan-400 text-sm flex-shrink-0">
                  {artifact.contentType.split('/')[0].charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors truncate">{artifact.name}</div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-text-muted font-mono truncate">{artifact.id}</span>
                    <span className="text-text-muted">·</span>
                    <span className="text-xs text-text-muted">{artifact.contentType}</span>
                  </div>
                </div>
                <span className="text-xs text-text-muted flex-shrink-0">{formatSize(artifact.sizeBytes)}</span>
                <span className="text-xs text-text-muted flex-shrink-0">{new Date(artifact.createdAt).toLocaleDateString()}</span>
                <span className="text-text-muted text-sm opacity-0 group-hover:opacity-100">→</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
