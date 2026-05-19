/**
 * TopBar — the top application bar.
 * Contains: project selector, workspace context, command palette, notifications, connection status.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import { useProjects } from '@/hooks/useProjects';

export function TopBar() {
  const navigate = useNavigate();
  const params = useParams();
  const [commandOpen, setCommandOpen] = useState(false);
  const [workspaceFilter, setWorkspaceFilter] = useState<string>('all');
  const { projects } = useProjects();

  // Global keyboard shortcut: Ctrl+K / Cmd+K opens command palette
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

  const currentProject = params.projectId ?? null;

  return (
    <>
      <header className="flex h-14 items-center gap-4 border-b border-border-subtle bg-bg-surface px-4 flex-shrink-0">
        {/* Left: Logo / Studio name */}
        <button
          onClick={() => navigate('/studio')}
          className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-accent transition-colors"
        >
          <span className="text-lg">⬡</span>
          <span>Studio</span>
        </button>

        {/* Project selector */}
        <div className="flex items-center gap-1">
          <span className="text-text-muted">/</span>
          <select
            value={currentProject ?? ''}
            onChange={(e) => navigate(`/studio/projects/${e.target.value}`)}
            className="text-sm bg-transparent border-none text-text-primary hover:text-accent cursor-pointer outline-none"
          >
            <option value="">Select project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Workspace context filter */}
        {currentProject && (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-xs text-text-muted">Workspace:</span>
            <select
              value={workspaceFilter}
              onChange={(e) => setWorkspaceFilter(e.target.value)}
              className="text-xs bg-bg-elevated border border-border-subtle rounded px-2 py-1 text-text-secondary cursor-pointer outline-none"
            >
              <option value="all">All workspaces</option>
              <option value="dev">dev</option>
              <option value="staging">staging</option>
              <option value="prod">prod</option>
            </select>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Command palette trigger */}
        <button
          onClick={() => setCommandOpen(true)}
          className="flex items-center gap-2 text-xs text-text-muted border border-border-subtle rounded px-3 py-1.5 hover:border-border-default hover:text-text-secondary transition-colors"
        >
          <span>Search...</span>
          <kbd className="text-[10px] bg-bg-elevated border border-border-subtle rounded px-1">⌘K</kbd>
        </button>

        {/* Notifications */}
        <button className="relative text-text-muted hover:text-text-primary transition-colors">
          <span className="text-lg">🔔</span>
          {/* Notification badge */}
          <span className="absolute top-0 right-0 w-2 h-2 bg-accent-error rounded-full" />
        </button>

        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-success" />
          <span className="text-xs text-text-muted">Connected</span>
        </div>
      </header>

      {/* Command palette modal */}
      {commandOpen && <CommandPalette onClose={() => setCommandOpen(false)} />}
    </>
  );
}
