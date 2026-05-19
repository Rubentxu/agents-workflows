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
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div>
          <h1 className="text-lg font-semibold text-text-primary capitalize">{section}</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {projectId ? `Project: ${projectId}` : 'Registry'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="px-3 py-1.5 text-xs border border-border-default rounded hover:bg-bg-elevated transition-colors text-text-secondary"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={() => navigate(`?arn=${encodeURIComponent('')}`)}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-accent/90 transition-colors"
          >
            Create resource
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border-subtle bg-bg-elevated/50">
        {/* Search */}
        <input
          type="text"
          placeholder="Search resources..."
          value={filters.query}
          onChange={(e) => setFilters({ query: e.target.value })}
          className="flex-1 max-w-xs text-sm bg-bg-surface border border-border-subtle rounded px-3 py-1.5 text-text-primary placeholder-text-muted outline-none focus:border-accent"
        />

        {/* Kind filter */}
        <select
          value={filters.kind}
          onChange={(e) => setFilters({ kind: e.target.value as typeof filters.kind })}
          className="text-sm bg-bg-surface border border-border-subtle rounded px-3 py-1.5 text-text-secondary outline-none focus:border-accent"
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
          className="text-sm bg-bg-surface border border-border-subtle rounded px-3 py-1.5 text-text-secondary outline-none focus:border-accent"
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
          <div className="mx-6 mt-4 p-4 bg-accent-error/5 border border-accent-error/20 rounded text-accent-error text-sm">
            {error}
          </div>
        )}

        {loading && resources.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm animate-pulse">Loading registry...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
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
                    <h2 className="text-sm font-semibold text-text-primary capitalize">{type}s</h2>
                    <span className="text-xs text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded">
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
    ? { label: 'workspace', color: 'text-purple-400' }
    : node.namespace.startsWith('project/')
    ? { label: 'project', color: 'text-blue-400' }
    : { label: 'global', color: 'text-green-400' };

  return (
    <button
      onClick={() => navigate(`/studio/projects/${node.namespace.split('/')[1]}/registry/resource?arn=${encodeURIComponent(node.id)}`)}
      className="w-full flex items-center gap-3 px-4 py-2.5 bg-bg-surface border border-border-subtle rounded-lg hover:border-accent/50 hover:bg-bg-elevated/50 transition-all text-left group"
    >
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${scopeBadge.color} border-current opacity-70`}>
        {scopeBadge.label}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors">
          {node.name}
        </div>
        <div className="font-mono text-xs text-text-muted truncate">{node.id}</div>
      </div>
      <span className="text-xs text-text-muted capitalize">{node.type}</span>
    </button>
  );
}
