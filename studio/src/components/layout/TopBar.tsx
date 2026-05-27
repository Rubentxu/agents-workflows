import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import { useProjects } from '@/hooks/useProjects';
import { useTheme } from '@/hooks/useTheme';
import { useShellContext } from './StudioShell';
import { useWorkspaceContext } from '@/hooks/useWorkspaceContext';
import { WorkspaceSelector } from '@/components/primitives/WorkspaceSelector';

export function TopBar() {
  const navigate = useNavigate();
  const params = useParams();
  const { resolved, setTheme } = useTheme();
  const { toggleSidebar, setMobileMenuOpen, mobileMenuOpen } = useShellContext();
  const [commandOpen, setCommandOpen] = useState(false);
  const { projects } = useProjects();
  const { activeWorkspace, allWorkspaces, setActiveWorkspace, loading, error, refresh } =
    useWorkspaceContext();

  const currentProject = params.projectId ?? null;
  const workspaceAdminProjectId = currentProject ?? projects[0]?.id ?? 'app';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <header className="app-shell__topbar" role="banner">
        <div className="topbar-section topbar-section--start">
          {currentProject && (
            <button
              className="mobile-menu-button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-controls="sidebar-navigation"
              aria-expanded={mobileMenuOpen}
              data-testid="topbar-mobile-menu-toggle"
              type="button"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          )}

          {currentProject && (
            <button
              className="sidebar-toggle"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
              data-testid="topbar-sidebar-toggle"
              type="button"
            >
              ☰
            </button>
          )}

          <button
            onClick={() => navigate('/studio')}
            data-testid="topbar-studio-home"
            className="topbar-brand"
            type="button"
          >
            <span className="topbar-brand__icon" aria-hidden="true">⬡</span>
            <span>Studio</span>
          </button>

          {currentProject && (
            <div className="topbar-project-switcher">
              <span className="topbar-project-switcher__separator" aria-hidden="true">/</span>
              <label htmlFor="topbar-project-selector" className="sr-only">
                Select project
              </label>
              <select
                id="topbar-project-selector"
                value={currentProject}
                onChange={(e) => navigate(`/studio/projects/${e.target.value}`)}
                aria-label="Select project"
                data-testid="project-selector"
                className="topbar-project-switcher__select"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="topbar-section topbar-section--end">
          <div className="topbar-workspace-selector">
            <WorkspaceSelector
              workspaces={allWorkspaces}
              activeWorkspaceId={activeWorkspace?.id ?? null}
              onSelect={(id) => setActiveWorkspace(id)}
              onCreateWorkspace={() => navigate(`/studio/projects/${workspaceAdminProjectId}/admin/workspaces?create=true`)}
              loading={loading}
              error={error ?? undefined}
              onRetry={refresh}
              testId="workspace-selector"
            />
          </div>

          <button
            className="topbar-search"
            onClick={() => setCommandOpen(true)}
            aria-label="Open search"
            data-testid="command-palette-open"
            type="button"
          >
            <span className="topbar-search__icon" aria-hidden="true">⌕</span>
            <span className="topbar-search__label">Search...</span>
            <kbd>⌘K</kbd>
          </button>

          <button
            className="icon-button topbar-notifications"
            aria-label="Notifications"
            data-testid="notifications-button"
            type="button"
          >
            <span aria-hidden="true">🔔</span>
            <span className="topbar-notifications__dot" />
          </button>

          <div className="topbar-status" aria-label="Connection status: connected">
            <span className="connection-dot connection-dot--connected" aria-hidden="true" />
            <span className="topbar-status__label">Connected</span>
          </div>

          <button
            className="icon-button"
            onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
            aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            data-testid="theme-toggle"
            type="button"
          >
            <span aria-hidden="true">{resolved === 'dark' ? '☀' : '☾'}</span>
          </button>
        </div>
      </header>

      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} />}
    </>
  );
}
