/**
 * ResourceCatalogPage — generic catalog page for any resource kind.
 *
 * Provides:
 * - Fetch and list resources
 * - Filter by status (optional)
 * - Navigate to editor on click
 * - Create new resource button
 * - Delete with ImpactReviewModal (optional)
 *
 * Usage:
 * ```ts
 * // Thin wrapper for a specific resource kind:
 * export function SkillCatalogPage() {
 *   return (
 *     <ResourceCatalogPage
 *       resourceLabel="Skills"
 *       resourceType="skill"
 *       accentColor="green"
 *       fetchFn={listSkills}
 *       createPath={`/studio/projects/${projectId}/design/skills/new/editor`}
 *       editorPath={(id) => `/studio/projects/${projectId}/design/skills/${encodeURIComponent(id)}/editor`}
 *       projectId={projectId}
 *     />
 *   );
 * }
 * ```
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RegistryNode } from '@/types';
import { useResourceApi } from '@/hooks/useResourceApi';
import { ImpactReviewModal, useImpactReview } from '@/components/registry/ImpactReviewModal';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';

export interface ResourceCatalogProps {
  resourceLabel: string;
  resourceType: string;
  accentColor: string;
  fetchFn: () => Promise<RegistryNode[]>;
  createPath: string;
  editorPath: (id: string) => string;
  projectId?: string;
  /** Show delete action with ImpactReviewModal */
  deletable?: boolean;
  /** Custom icon character extractor */
  iconExtractor?: (node: RegistryNode) => string;
  /** Optional explanatory note for partially implemented catalogs */
  implementationNote?: string;
  /** Optional custom empty-state title */
  emptyStateTitle?: string;
  /** Optional custom empty-state description */
  emptyStateDescription?: string;
}

interface LocalResource {
  id: string;
  name: string;
  namespace: string;
  [key: string]: unknown;
}

function toTestId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  green:  { bg: 'bg-success/10',  text: 'text-success',  border: 'border-success/30' },
  blue:   { bg: 'bg-primary/10',  text: 'text-primary',  border: 'border-primary/30' },
  purple: { bg: 'bg-secondary/10', text: 'text-secondary', border: 'border-secondary/30' },
  orange: { bg: 'bg-warning/10',  text: 'text-warning',  border: 'border-warning/30' },
  cyan:   { bg: 'bg-info/10',    text: 'text-info',     border: 'border-info/30' },
};

export function ResourceCatalogPage({
  resourceLabel,
  resourceType,
  accentColor,
  fetchFn,
  createPath,
  editorPath,
  projectId,
  deletable = false,
  iconExtractor,
  implementationNote,
  emptyStateTitle,
  emptyStateDescription,
}: ResourceCatalogProps) {
  const navigate = useNavigate();
  const { getImpact } = useImpactReview();
  const resourceKey = resourceType.toLowerCase();

  const colors = COLOR_MAP[accentColor] ?? COLOR_MAP.green;

  const [resources, setResources] = useState<LocalResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter resources by name or ID matching search query (case-insensitive)
  const filteredResources = searchQuery
    ? resources.filter((r) => {
        const q = searchQuery.toLowerCase();
        return r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
      })
    : resources;

  const [pendingDelete, setPendingDelete] = useState<{
    resource: LocalResource;
    arn: string;
    impactData: Awaited<ReturnType<typeof getImpact>> | null;
  } | null>(null);

  const fetchResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setResources(
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

  const { deleteResource } = useResourceApi();

  useEffect(() => {
    void fetchResources();
  }, [fetchResources]);

  const handleDeleteClick = useCallback(
    async (resource: LocalResource, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!deletable) return;
      const arn = resource.id.startsWith('arn:')
        ? resource.id
        : `arn:local:${resource.namespace}:${resourceType}/${resource.name}`;
      const impact = await getImpact(arn, resourceType);
      setPendingDelete({ resource, arn, impactData: impact });
    },
    [deletable, getImpact, resourceType]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const success = await deleteResource(pendingDelete.arn);
    if (success) {
      setResources((prev) => prev.filter((r) => r.id !== pendingDelete.resource.id));
    }
    setPendingDelete(null);
  }, [pendingDelete, deleteResource]);

  return (
    <div className="flex flex-col h-full" data-testid={`${resourceKey}-catalog-page`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{resourceLabel}</h1>
          <p className="text-sm text-secondary mt-0.5">
            {projectId ? `Project: ${projectId}` : resourceType}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder={`Search ${resourceLabel.toLowerCase()}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid={`${resourceKey}-catalog-search`}
            className="px-3 py-1.5 text-sm border border-outline rounded bg-surface text-on-surface placeholder:text-secondary/50 focus:outline-none focus:border-primary w-48"
          />
          <button
            onClick={fetchResources}
            disabled={loading}
            data-testid={`${resourceKey}-catalog-refresh`}
            className="px-3 py-1.5 text-xs border border-outline rounded hover:bg-surface-container text-secondary transition-colors"
          >
            {loading ? '...' : 'Refresh'}
          </button>
          <button
            onClick={() => navigate(createPath)}
            data-testid={`${resourceKey}-catalog-create`}
            className="px-4 py-2 bg-primary text-on-primary text-sm font-medium rounded hover:bg-primary/90 transition-colors"
          >
            New {resourceLabel.slice(0, -1)}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {implementationNote && (
          <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-secondary">
            {implementationNote}
          </div>
        )}

        {error && (
          <div className="mb-4">
            <ErrorState title="Failed to load resources" message={error} onRetry={fetchResources} testId={`${resourceKey}-catalog-error-state`} />
          </div>
        )}

        {!loading && searchQuery && filteredResources.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true" className="text-lg">◫</span>}
            title="No results"
            description={`No ${resourceLabel.toLowerCase()} match "${searchQuery}"`}
            action={{ label: 'Clear search', onClick: () => setSearchQuery('') }}
            testId={`${resourceKey}-catalog-no-results`}
          />
        ) : loading && resources.length === 0 ? (
          <LoadingState type="rows" count={3} />
        ) : resources.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden="true" className="text-lg">◫</span>}
            title={emptyStateTitle ?? `No ${resourceLabel.toLowerCase()} found`}
            description={emptyStateDescription ?? `Create your first ${resourceLabel.slice(0, -1).toLowerCase()} to get started.`}
            action={{ label: `Create ${resourceLabel.slice(0, -1)}`, onClick: () => navigate(createPath) }}
            testId={`${resourceKey}-catalog-empty-state`}
          />
        ) : (
          <div className="space-y-2" data-testid={`${resourceKey}-catalog-list`}>
            {filteredResources.map((resource) => (
              <div
                key={resource.id}
                onClick={() => navigate(editorPath(resource.id))}
                data-testid={`${resourceKey}-catalog-row-${toTestId(resource.name)}`}
                className="flex items-center gap-4 px-4 py-3 bg-surface border border-outline-variant rounded-lg hover:border-primary/50 cursor-pointer group transition-all"
              >
                {/* Icon */}
                <div className={`w-8 h-8 rounded flex items-center justify-center text-sm font-semibold flex-shrink-0 ${colors.bg} ${colors.text}`}>
                  {iconExtractor
                    ? iconExtractor(resource as unknown as RegistryNode)
                    : resource.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors truncate">
                    {resource.name}
                  </div>
                  <div className="font-mono text-xs text-secondary truncate">{resource.id}</div>
                </div>

                {/* Delete action */}
                {deletable && (
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleDeleteClick(resource, e)}
                      data-testid={`${resourceKey}-catalog-delete-${toTestId(resource.name)}`}
                      className="px-2 py-1 text-xs text-error hover:text-error/80 hover:bg-error/10 rounded transition-colors border border-transparent hover:border-error/30"
                    >
                      Delete
                    </button>
                  </div>
                )}

                <span className="text-secondary text-sm opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Impact Review Modal */}
      {pendingDelete?.impactData && (
        <ImpactReviewModal
          isOpen={true}
          onClose={() => setPendingDelete(null)}
          onConfirm={handleConfirmDelete}
          impact={pendingDelete.impactData}
          action="delete"
        />
      )}
    </div>
  );
}
