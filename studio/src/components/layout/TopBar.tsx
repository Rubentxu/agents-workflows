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
        <button
          className="mobile-menu-button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          data-testid="topbar-mobile-menu-toggle"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>

        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          data-testid="topbar-sidebar-toggle"
        >
          ☰
        </button>

        <button
          onClick={() => navigate('/studio')}
          data-testid="topbar-studio-home"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--color-primary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: '20px' }}>⬡</span>
          <span>Studio</span>
        </button>

        {currentProject && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--color-on-surface)' }}>
            <span style={{ opacity: 0.4 }}>/</span>
            <select
              value={currentProject}
              onChange={(e) => navigate(`/studio/projects/${e.target.value}`)}
              aria-label="Select project"
              data-testid="project-selector"
              style={{
                fontSize: '14px',
                fontWeight: 500,
                background: 'transparent',
                border: 'none',
                color: 'var(--color-on-surface)',
                cursor: 'pointer',
                outline: 'none',
                padding: '2px 4px',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div className="topbar-workspace-selector">
          <WorkspaceSelector
            workspaces={allWorkspaces}
            activeWorkspaceId={activeWorkspace?.id ?? null}
            onSelect={(id) => setActiveWorkspace(id)}
            onCreateWorkspace={() => navigate(`/studio/projects/${currentProject}/admin/workspaces?create=true`)}
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
        >
          <span style={{ color: 'var(--color-on-surface)', opacity: 0.8 }}>Search...</span>
          <kbd>⌘K</kbd>
        </button>

        <button
          className="icon-button"
          aria-label="Notifications"
          data-testid="notifications-button"
          style={{ position: 'relative' }}
        >
          <span aria-hidden="true">🔔</span>
          <span
            style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--color-error)',
            }}
          />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="connection-dot connection-dot--connected" aria-hidden="true" />
          <span style={{ fontSize: '12px', color: 'var(--color-on-surface)', opacity: 0.6 }}>
            Connected
          </span>
        </div>

        <button
          className="icon-button"
          onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
          aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          data-testid="theme-toggle"
        >
          <span aria-hidden="true">{resolved === 'dark' ? '☀' : '☾'}</span>
        </button>
      </header>

      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} />}
    </>
  );
}
