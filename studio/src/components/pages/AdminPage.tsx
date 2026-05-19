/**
 * AdminPage — /studio/projects/:projectId/admin
 * Admin section for workspaces, settings, and integrations.
 */

import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useWorkspaceApi, type Workspace, type ServerConfig } from '@/hooks/useWorkspaceApi';

type AdminTab = 'workspaces' | 'settings' | 'integrations' | 'projects';

export function AdminPage() {
  const { projectId } = useParams();
  const location = useLocation();

  const pathParts = location.pathname.split('/');
  const currentTab: AdminTab = pathParts.includes('settings')
    ? 'settings'
    : pathParts.includes('integrations')
    ? 'integrations'
    : pathParts.includes('projects')
    ? 'projects'
    : 'workspaces';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">Admin</h1>
          <p className="text-sm text-secondary mt-1">
            Project: {projectId}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <TabNav currentTab={currentTab} projectId={projectId ?? ''} />

      {/* Tab Content */}
      {currentTab === 'workspaces' && <WorkspacesTab />}
      {currentTab === 'settings' && <SettingsTab />}
      {currentTab === 'integrations' && <IntegrationsTab />}
      {currentTab === 'projects' && <ProjectsTab projectId={projectId ?? ''} />}
    </div>
  );
}

function TabNav({ currentTab, projectId }: { currentTab: AdminTab; projectId: string }) {
  const base = `/studio/projects/${projectId}/admin`;
  const tabs: { id: AdminTab; label: string; path: string }[] = [
    { id: 'workspaces', label: 'Workspaces', path: `${base}/workspaces` },
    { id: 'projects', label: 'Projects', path: `${base}/projects` },
    { id: 'settings', label: 'Settings', path: `${base}/settings` },
    { id: 'integrations', label: 'Integrations', path: `${base}/integrations` },
  ];

  return (
    <div className="border-b border-outline-variant">
      <nav className="flex gap-1">
        {tabs.map((tab) => (
          <a
            key={tab.id}
            href={tab.path}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              currentTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-secondary hover:text-on-surface hover:border-outline'
            }`}
          >
            {tab.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspaces Tab
// ---------------------------------------------------------------------------

function WorkspacesTab() {
  const { loading, error, listWorkspaces, createWorkspace, deleteWorkspace } = useWorkspaceApi();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    const data = await listWorkspaces();
    setWorkspaces(data);
  };

  const handleCreate = async (name: string, description: string) => {
    const created = await createWorkspace({ name, description });
    if (created) {
      setShowCreateModal(false);
      setWorkspaces((prev) => [...prev, created]);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const ok = await deleteWorkspace(deleteTarget.id);
    setDeleteLoading(false);
    if (ok) {
      setDeleteTarget(null);
      setWorkspaces((prev) => prev.filter((w) => w.id !== deleteTarget.id));
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          {loading && <span className="text-xs text-secondary animate-pulse">Loading...</span>}
          {error && <span className="text-xs text-error">{error}</span>}
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-primary text-on-primary text-sm font-medium rounded hover:bg-primary/90 transition-colors"
        >
          Create Workspace
        </button>
      </div>

      {/* Workspace List */}
      {workspaces.length === 0 && !loading ? (
        <EmptyState message="No workspaces found. Create one to get started." />
      ) : (
        <div className="bg-surface border border-outline-variant rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="text-left px-4 py-3 text-secondary font-medium text-xs">Name</th>
                <th className="text-left px-4 py-3 text-secondary font-medium text-xs">ID</th>
                <th className="text-left px-4 py-3 text-secondary font-medium text-xs">Created</th>
                <th className="text-left px-4 py-3 text-secondary font-medium text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((ws) => (
                <tr key={ws.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-on-surface">{ws.name}</div>
                    {ws.description && (
                      <div className="text-xs text-secondary mt-0.5">{ws.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-secondary">{ws.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-secondary">
                      {new Date(ws.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDeleteTarget(ws)}
                      className="text-xs text-error hover:text-error/80 transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateWorkspaceModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
          loading={loading}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <DeleteWorkspaceModal
          workspace={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}

function CreateWorkspaceModal({
  onClose,
  onCreate,
  loading,
}: {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim(), description.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" onClick={onClose}>
      <div className="absolute inset-0 bg-scrim" />
      <div
        className="relative w-full max-w-md bg-surface border border-outline rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <h2 className="text-base font-semibold text-on-surface">Create Workspace</h2>
          <button onClick={onClose} className="text-secondary hover:text-on-surface transition-colors text-lg">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1.5">
              Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-workspace"
              required
              className="w-full px-3 py-2 bg-surface-container border border-outline rounded text-sm text-on-surface placeholder:text-secondary focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional workspace description"
              rows={3}
              className="w-full px-3 py-2 bg-surface-container border border-outline rounded text-sm text-on-surface placeholder:text-secondary focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-secondary hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 text-sm font-medium bg-primary text-on-primary rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteWorkspaceModal({
  workspace,
  onClose,
  onConfirm,
  loading,
}: {
  workspace: Workspace;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" onClick={onClose}>
      <div className="absolute inset-0 bg-scrim" />
      <div
        className="relative w-full max-w-sm bg-surface border border-outline rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-outline-variant">
          <div>
            <h2 className="text-base font-semibold text-on-surface">Delete Workspace</h2>
            <p className="text-xs text-secondary mt-0.5">This action cannot be undone.</p>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-on-surface transition-colors text-lg">
            ✕
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-secondary mb-4">
            Are you sure you want to delete workspace{' '}
            <strong className="text-on-surface">{workspace.name}</strong>?
          </p>
          <p className="text-xs text-secondary mb-6">
            ID: {workspace.id}
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-secondary hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-error text-on-primary rounded hover:bg-error/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

function SettingsTab() {
  const { getConfig } = useWorkspaceApi();
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await getConfig();
      if (data) {
        setConfig(data);
      } else {
        setError('Failed to load configuration');
      }
      setLoading(false);
    };
    load();
  }, [getConfig]);

  if (loading) {
    return (
      <div className="bg-surface border border-outline-variant rounded-lg p-8 text-center">
        <span className="text-sm text-secondary animate-pulse">Loading configuration...</span>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="bg-error/5 border border-primary-error/20 rounded-lg p-4 text-center">
        <p className="text-error text-sm">{error ?? 'Failed to load configuration'}</p>
      </div>
    );
  }

  const configItems = [
    { label: 'Default Workflow', value: config.default_workflow, mono: true },
    {
      label: 'Max Concurrent Executions',
      value: config.max_concurrent_executions.toString(),
    },
    {
      label: 'Artifact Size Threshold',
      value: `${(config.artifact_size_threshold_bytes / 1024 / 1024).toFixed(1)} MB`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-outline-variant rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {configItems.map((item, i) => (
              <tr key={item.label} className={i > 0 ? 'border-t border-outline-variant' : ''}>
                <td className="px-4 py-3 text-secondary text-xs font-medium w-64">
                  {item.label}
                </td>
                <td className={`px-4 py-3 text-on-surface ${item.mono ? 'font-mono text-xs' : ''}`}>
                  {item.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integrations Tab
// ---------------------------------------------------------------------------

function IntegrationsTab() {
  return (
    <div className="bg-surface border border-outline-variant rounded-lg p-12 text-center">
      <div className="text-4xl mb-4 opacity-30">🔌</div>
      <h3 className="text-base font-medium text-on-surface mb-2">Coming Soon</h3>
      <p className="text-sm text-secondary max-w-sm mx-auto">
        Integrations with external tools and services will be available here. Stay tuned for updates.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projects Tab
// ---------------------------------------------------------------------------

function ProjectsTab({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-4">
      <div className="bg-surface border border-outline-variant rounded-lg p-6">
        <h3 className="text-sm font-medium text-on-surface mb-4">Current Project</h3>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-primary text-lg font-semibold">
              {projectId.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <div className="font-medium text-on-surface">{projectId}</div>
            <div className="text-xs text-secondary font-mono">{projectId}</div>
          </div>
        </div>
      </div>
      <div className="bg-surface border border-outline-variant rounded-lg p-12 text-center">
        <div className="text-4xl mb-4 opacity-30">📁</div>
        <h3 className="text-base font-medium text-on-surface mb-2">Project Management</h3>
        <p className="text-sm text-secondary max-w-sm mx-auto">
          Project-level settings and management are handled at the{' '}
          <a href="/studio/projects" className="text-primary hover:underline">
            Projects
          </a>{' '}
          page.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-surface border border-outline-variant rounded-lg p-8 text-center">
      <p className="text-secondary text-sm">{message}</p>
    </div>
  );
}
