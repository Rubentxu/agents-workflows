import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExecutionApi } from '@/hooks/useExecutionApi';
import { LoadingState } from '@/components/states/LoadingState';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import type { ArtifactRow } from '@/types/dashboard';

export function ArtifactsListPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { listArtifacts } = useExecutionApi();

  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchArtifacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listArtifacts({ limit: 50 });
      setArtifacts(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artifacts');
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [listArtifacts]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
      >
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            Artifacts
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-secondary)' }}>
            {projectId ? `Project: ${projectId}` : 'Observe'}
          </p>
        </div>
        <button
          onClick={fetchArtifacts}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded transition-colors"
          style={{
            border: '1px solid var(--color-outline)',
            color: 'var(--color-on-surface)',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '...' : 'Refresh'}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4">
            <ErrorState
              title="Failed to load artifacts"
              message={error}
              onRetry={fetchArtifacts}
            />
          </div>
        )}

        {loading && !hasFetched ? (
          <LoadingState type="rows" count={5} />
        ) : artifacts.length === 0 && !error ? (
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7 6h6M7 9h6M7 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
            title="No artifacts found"
            description="Artifacts produced by agent execution stages will appear here once available."
          />
        ) : (
          <div className="space-y-2">
            {artifacts.map((artifact) => (
              <div
                key={artifact.id}
                onClick={() => artifact.executionArn && navigate(`/studio/projects/${projectId}/observe/agent-executions/${encodeURIComponent(artifact.executionArn)}`)}
                className="flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer group"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-outline-variant)',
                  transition: 'border-color 120ms, background 120ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                  e.currentTarget.style.background = 'var(--color-surface-container)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-outline-variant)';
                  e.currentTarget.style.background = 'var(--color-surface)';
                }}
              >
                <div
                  className="w-8 h-8 rounded flex items-center justify-center text-sm flex-shrink-0"
                  style={{
                    background: 'var(--color-info-container)',
                    color: 'var(--color-on-info-container)',
                  }}
                >
                  {artifact.contentType.split('/')[0].charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    {artifact.name}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs font-mono truncate" style={{ color: 'var(--color-secondary)' }}>
                      {artifact.id}
                    </span>
                    <span style={{ color: 'var(--color-outline)' }}>&middot;</span>
                    <span className="text-xs" style={{ color: 'var(--color-secondary)' }}>
                      {artifact.contentType}
                    </span>
                  </div>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-secondary)' }}>
                  {formatSize(artifact.sizeBytes)}
                </span>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-secondary)' }}>
                  {new Date(artifact.createdAt).toLocaleDateString()}
                </span>
                <span
                  className="text-sm flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--color-primary)' }}
                >
                  &rarr;
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
