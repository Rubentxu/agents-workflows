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

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RegistryNode } from '@/types';
import { useResourceApi } from '@/hooks/useResourceApi';
import { ImpactReviewModal, useImpactReview } from '@/components/registry/ImpactReviewModal';

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
}

interface LocalResource {
  id: string;
  name: string;
  namespace: string;
  [key: string]: unknown;
}

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  green:  { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-400/30' },
  blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-400/30' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-400/30' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-400/30' },
  cyan:   { bg: 'bg-cyan-500/10',  text: 'text-cyan-400',   border: 'border-cyan-400/30' },
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
}: ResourceCatalogProps) {
  const navigate = useNavigate();
  const { getImpact } = useImpactReview();

  const colors = COLOR_MAP[accentColor] ?? COLOR_MAP.green;

  const [resources, setResources] = useState<LocalResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">{resourceLabel}</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {projectId ? `Project: ${projectId}` : resourceType}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchResources}
            disabled={loading}
            className="px-3 py-1.5 text-xs border border-border-default rounded hover:bg-bg-elevated text-text-secondary transition-colors"
          >
            {loading ? '...' : 'Refresh'}
          </button>
          <button
            onClick={() => navigate(createPath)}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-accent/90 transition-colors"
          >
            New {resourceLabel.slice(0, -1)}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 p-4 bg-accent-error/10 border border-accent-error/20 rounded text-accent-error text-sm">
            {error}
          </div>
        )}

        {loading && resources.length === 0 ? (
          <div className="text-center text-text-muted text-sm animate-pulse py-8">
            Loading {resourceLabel}...
          </div>
        ) : resources.length === 0 ? (
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
            <p className="text-text-muted text-sm mb-4">No {resourceLabel.toLowerCase()} found.</p>
            <button
              onClick={() => navigate(createPath)}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-accent/90 transition-colors"
            >
              Create your first {resourceLabel.slice(0, -1).toLowerCase()}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {resources.map((resource) => (
              <div
                key={resource.id}
                onClick={() => navigate(editorPath(resource.id))}
                className="flex items-center gap-4 px-4 py-3 bg-bg-surface border border-border-subtle rounded-lg hover:border-accent/50 cursor-pointer group transition-all"
              >
                {/* Icon */}
                <div className={`w-8 h-8 rounded flex items-center justify-center text-sm font-semibold flex-shrink-0 ${colors.bg} ${colors.text}`}>
                  {iconExtractor
                    ? iconExtractor(resource as unknown as RegistryNode)
                    : resource.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors truncate">
                    {resource.name}
                  </div>
                  <div className="font-mono text-xs text-text-muted truncate">{resource.id}</div>
                </div>

                {/* Delete action */}
                {deletable && (
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleDeleteClick(resource, e)}
                      className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors border border-transparent hover:border-red-400/30"
                    >
                      Delete
                    </button>
                  </div>
                )}

                <span className="text-text-muted text-sm opacity-0 group-hover:opacity-100 transition-opacity">→</span>
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
