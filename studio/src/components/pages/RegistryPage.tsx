/**
 * RegistryPage — /studio/projects/:projectId/registry
 * Shows a filterable list of all resources in the registry.
 */

import { useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRegistryStore } from '@/stores/registryStore';
import type { RegistryNode } from '@/types';
import { restApiUrl } from '@/lib/apiBase';

export function RegistryPage({ section }: { section?: string }) {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const fetchRegistryKind = useCallback(async (kind: 'workflows' | 'agents' | 'skills' | 'prompts'): Promise<RegistryNode[]> => {
    const response = await fetch(restApiUrl(`/${kind}`));
    if (!response.ok) {
      throw new Error(`Failed to load ${kind}: HTTP ${response.status}`);
    }

    const payload = await response.json() as Array<Record<string, unknown>> | Record<string, unknown>;
    const items = Array.isArray(payload)
      ? payload
      : ((payload[kind] as Array<Record<string, unknown>> | undefined) ?? []);
    const singular = kind.slice(0, -1) as RegistryNode['type'];

    return items.map((item) => {
      const arn = String(item.arn ?? '');
      const namespaceMatch = arn.match(/^arn:local:([^:]+):/);
      return {
        id: arn,
        type: singular,
        name: String(item.name ?? arn.split('/').pop() ?? singular),
        registry: 'default',
        namespace: namespaceMatch?.[1] ?? 'global',
        created_at: String(item.created_at ?? new Date().toISOString()),
        updated_at: String(item.created_at ?? new Date().toISOString()),
      } satisfies RegistryNode;
    });
  }, []);

  const {
    resources,
    setResources,
    filters,
    setFilters,
    loading,
    setLoading,
    error,
    setError,
  } = useRegistryStore();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [workflows, agents, skills, prompts] = await Promise.all([
        fetchRegistryKind('workflows'),
        fetchRegistryKind('agents'),
        fetchRegistryKind('skills'),
        fetchRegistryKind('prompts'),
      ]);

      const all: RegistryNode[] = [
        ...workflows,
        ...agents,
        ...skills,
        ...prompts,
      ];
      setResources(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load registry');
    } finally {
      setLoading(false);
    }
  }, [fetchRegistryKind, setResources, setLoading, setError]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const pageMode = section ?? 'registry';

  // Apply filters
  const filtered = resources.filter((r) => {
    // Kind filter
    if (filters.kind !== 'all' && r.type !== filters.kind) return false;

    // Scope filter
    if (filters.scope !== 'all') {
      if (filters.scope === 'global' && !r.namespace.startsWith('global')) return false;
      if (filters.scope === 'project' && !r.namespace.startsWith('project/')) return false;
      if (filters.scope === 'workspace' && !r.namespace.startsWith('workspace/')) return false;
    }

    // Query filter
    if (filters.query) {
      const q = filters.query.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.namespace.toLowerCase().includes(q)
      );
    }

    return true;
  });

  const sectionFiltered = filtered.filter((r) => {
    if (pageMode === 'overrides') {
      return !r.namespace.startsWith('global');
    }
    return true;
  });

  // Group by type for display
  const grouped = sectionFiltered.reduce(
    (acc, r) => {
      if (!acc[r.type]) acc[r.type] = [];
      acc[r.type].push(r);
      return acc;
    },
    {} as Record<string, RegistryNode[]>
  );

  const typeOrder = ['workflow', 'agent', 'skill', 'prompt', 'tool', 'template', 'policy'];

  const heading = pageMode === 'resources'
    ? 'Registry Resources'
    : pageMode === 'overrides'
    ? 'Registry Overrides'
    : 'Registry';

  const subtitle = pageMode === 'resources'
    ? 'Browse resources discovered from the registry.'
    : pageMode === 'overrides'
    ? 'Scoped resources that can override inherited global behavior.'
    : 'Registry explorer';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-outline-variant px-4 py-4 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{heading}</h1>
          <p className="text-sm text-secondary mt-0.5">
            {projectId ? `Project: ${projectId} · ${subtitle}` : subtitle}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="w-full rounded border border-outline px-3 py-2 text-sm text-secondary transition-colors hover:bg-surface-container sm:w-auto"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={() => navigate(`?arn=${encodeURIComponent('')}`)}
            className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:bg-primary/90 sm:w-auto"
          >
            Create resource
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 border-b border-outline-variant bg-surface-container/50 px-4 py-3 sm:px-6 lg:flex-row lg:items-center">
        {/* Search */}
        <label htmlFor="registry-search" className="sr-only">
          Search resources
        </label>
        <input
          id="registry-search"
          type="text"
          placeholder="Search resources..."
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          aria-label="Search resources"
          className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface placeholder:text-secondary outline-none focus:border-primary lg:max-w-xs"
        />

        {/* Kind filter */}
        <select
          aria-label="Filter resources by kind"
          value={filters.kind}
          onChange={(e) => setFilters({ kind: e.target.value as typeof filters.kind })}
          className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-secondary outline-none focus:border-primary sm:w-auto"
        >
          <option value="all">All kinds</option>
          <option value="workflow">Workflows</option>
          <option value="agent">Agents</option>
          <option value="skill">Skills</option>
          <option value="prompt">Prompts</option>
          <option value="tool">Tools</option>
          <option value="template">Templates</option>
          <option value="policy">Policies</option>
        </select>

        {/* Scope filter */}
        <select
          aria-label="Filter resources by scope"
          value={filters.scope}
          onChange={(e) => setFilters({ scope: e.target.value })}
          className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-secondary outline-none focus:border-primary sm:w-auto"
        >
          <option value="all">All scopes</option>
          <option value="global">Global</option>
          <option value="project">Project</option>
          <option value="workspace">Workspace</option>
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" aria-busy={loading}>
        {pageMode === 'overrides' && (
          <div className="mx-4 mt-4 rounded-lg border border-info/20 bg-info/5 px-4 py-3 text-sm text-secondary sm:mx-6">
            This view currently approximates overrides by showing non-global resources. True origin/override lineage is not yet surfaced here.
          </div>
        )}

        {error && (
          <div className="mx-4 mt-4 rounded border border-primary-error/20 bg-error/5 p-4 text-sm text-error sm:mx-6">
            {error}
          </div>
        )}

        {loading && resources.length === 0 ? (
          <div className="p-8 text-center text-secondary text-sm animate-pulse">Loading registry...</div>
        ) : sectionFiltered.length === 0 ? (
          <div className="p-8 text-center text-secondary text-sm">
            {resources.length === 0
              ? 'No resources found. Create one to get started.'
              : 'No resources match your filters.'}
          </div>
        ) : (
          <div className="space-y-6 p-4 sm:p-6">
            {typeOrder
              .filter((t) => grouped[t]?.length > 0)
              .map((type) => (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-sm font-semibold text-on-surface capitalize">{type}s</h2>
                    <span className="text-xs text-on-surface bg-surface-container px-1.5 py-0.5 rounded font-medium">
                      {grouped[type].length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {grouped[type].map((node) => (
                      <ResourceRow key={node.id} node={node} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceRow({ node }: { node: RegistryNode }) {
  const navigate = useNavigate();

  // Determine scope badge
  const scopeBadge = node.namespace.startsWith('workspace/')
      ? { label: 'workspace', className: 'bg-secondary-container text-on-secondary-container border-secondary/50' }
    : node.namespace.startsWith('project/')
    ? { label: 'project', className: 'bg-primary-container text-on-primary-container border-primary/50' }
    : { label: 'global', className: 'bg-success-container text-on-success-container border-success/50' };

  return (
      <button
        onClick={() => navigate(`/studio/projects/${node.namespace.split('/')[1]}/registry/resource?arn=${encodeURIComponent(node.id)}`)}
        className="group flex w-full items-start gap-3 rounded-lg border border-outline-variant bg-surface px-4 py-3 text-left transition-all hover:border-primary/50 hover:bg-surface-container/50 sm:items-center"
      >
        <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.04em] ${scopeBadge.className}`}>
          {scopeBadge.label}
        </span>
        <div className="flex-1 min-w-0">
          <div className="break-words text-sm font-medium text-on-surface transition-colors group-hover:text-primary sm:truncate">
            {node.name}
          </div>
          <div className="break-all font-mono text-xs text-secondary sm:truncate">{node.id}</div>
        </div>
        <span className="shrink-0 text-xs text-secondary capitalize">{node.type}</span>
      </button>
  );
}
