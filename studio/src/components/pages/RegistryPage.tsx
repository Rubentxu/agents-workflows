/**
 * RegistryPage — /studio/projects/:projectId/registry
 * Shows a filterable list of all resources in the registry.
 */

import { useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRegistryStore } from '@/stores/registryStore';
import { useMcpTools } from '@/hooks/useMcpTools';
import type { RegistryNode } from '@/types';

export function RegistryPage({ section }: { section?: string }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { listWorkflows, listAgents, listSkills, listPrompts } = useMcpTools();

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
        listWorkflows(),
        listAgents(),
        listSkills(),
        listPrompts(),
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
  }, [listWorkflows, listAgents, listSkills, listPrompts, setResources, setLoading, setError]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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

  // Group by type for display
  const grouped = filtered.reduce(
    (acc, r) => {
      if (!acc[r.type]) acc[r.type] = [];
      acc[r.type].push(r);
      return acc;
    },
    {} as Record<string, RegistryNode[]>
  );

  const typeOrder = ['workflow', 'agent', 'skill', 'prompt', 'tool', 'template', 'policy'];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
        <div>
          <h1 className="text-lg font-semibold text-on-surface capitalize">{section}</h1>
          <p className="text-sm text-secondary mt-0.5">
            {projectId ? `Project: ${projectId}` : 'Registry'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="px-3 py-1.5 text-xs border border-outline rounded hover:bg-surface-container transition-colors text-secondary"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={() => navigate(`?arn=${encodeURIComponent('')}`)}
            className="px-4 py-2 bg-primary text-on-primary text-sm font-medium rounded hover:bg-primary/90 transition-colors"
          >
            Create resource
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-outline-variant bg-surface-container/50">
        {/* Search */}
        <input
          type="text"
          placeholder="Search resources..."
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          className="flex-1 max-w-xs text-sm bg-surface border border-outline-variant rounded px-3 py-1.5 text-on-surface placeholder:text-secondary outline-none focus:border-primary"
        />

        {/* Kind filter */}
        <select
          value={filters.kind}
          onChange={(e) => setFilters({ kind: e.target.value as typeof filters.kind })}
          className="text-sm bg-surface border border-outline-variant rounded px-3 py-1.5 text-secondary outline-none focus:border-primary"
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
          value={filters.scope}
          onChange={(e) => setFilters({ scope: e.target.value })}
          className="text-sm bg-surface border border-outline-variant rounded px-3 py-1.5 text-secondary outline-none focus:border-primary"
        >
          <option value="all">All scopes</option>
          <option value="global">Global</option>
          <option value="project">Project</option>
          <option value="workspace">Workspace</option>
        </select>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="mx-6 mt-4 p-4 bg-error/5 border border-primary-error/20 rounded text-error text-sm">
            {error}
          </div>
        )}

        {loading && resources.length === 0 ? (
          <div className="p-8 text-center text-secondary text-sm animate-pulse">Loading registry...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-secondary text-sm">
            {resources.length === 0
              ? 'No resources found. Create one to get started.'
              : 'No resources match your filters.'}
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {typeOrder
              .filter((t) => grouped[t]?.length > 0)
              .map((type) => (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-sm font-semibold text-on-surface capitalize">{type}s</h2>
                    <span className="text-xs text-secondary bg-surface-container px-1.5 py-0.5 rounded">
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
    ? { label: 'workspace', color: 'text-secondary' }
    : node.namespace.startsWith('project/')
    ? { label: 'project', color: 'text-primary' }
    : { label: 'global', color: 'text-success' };

  return (
    <button
      onClick={() => navigate(`/studio/projects/${node.namespace.split('/')[1]}/registry/resource?arn=${encodeURIComponent(node.id)}`)}
      className="w-full flex items-center gap-3 px-4 py-2.5 bg-surface border border-outline-variant rounded-lg hover:border-primary/50 hover:bg-surface-container/50 transition-all text-left group"
    >
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${scopeBadge.color} border-current opacity-70`}>
        {scopeBadge.label}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-on-surface truncate group-hover:text-primary transition-colors">
          {node.name}
        </div>
        <div className="font-mono text-xs text-secondary truncate">{node.id}</div>
      </div>
      <span className="text-xs text-secondary capitalize">{node.type}</span>
    </button>
  );
}
