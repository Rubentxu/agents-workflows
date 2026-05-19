import { useState, useRef, useEffect, useCallback } from 'react';
import type { Workspace } from '@/stores/workspaceStore';

type Environment = 'dev' | 'staging' | 'prod';

interface EnrichedWorkspace extends Workspace {
  environment?: Environment;
}

interface WorkspaceSelectorProps {
  workspaces: EnrichedWorkspace[];
  activeWorkspaceId?: string | null;
  onSelect: (id: string | null) => void;
  onCreateWorkspace: () => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}

function ChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="workspace-selector__chevron">
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="workspace-selector__spinner">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="28" strokeDashoffset="10" opacity="0.7" />
    </svg>
  );
}

function AllWorkspacesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="2" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="10" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="10" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function WorkspaceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 6H14" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EnvironmentBadge({ env }: { env: Environment }) {
  const styles: Record<Environment, { bg: string; color: string }> = {
    dev: { bg: 'var(--color-info-container)', color: 'var(--color-on-info-container)' },
    staging: { bg: 'var(--color-warning-container)', color: 'var(--color-on-warning-container)' },
    prod: { bg: 'var(--color-error-container)', color: 'var(--color-on-error-container)' },
  };
  const style = styles[env] ?? styles.dev;
  return (
    <span
      className="workspace-selector__env-badge"
      style={{ background: style.bg, color: style.color }}
    >
      {env}
    </span>
  );
}

function StatusDot() {
  return <span className="workspace-selector__status-dot" />;
}

export function WorkspaceSelector({
  workspaces,
  activeWorkspaceId = null,
  onSelect,
  onCreateWorkspace,
  loading = false,
  error,
  onRetry,
}: WorkspaceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, close]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    if (open) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, close]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    const totalItems = workspaces.length + 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex === 0) {
        onSelect(null);
        close();
      } else if (focusedIndex > 0 && focusedIndex <= workspaces.length) {
        onSelect(workspaces[focusedIndex - 1].id);
        close();
      }
    }
  };

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const displayLabel = activeWorkspaceId === null
    ? 'All Workspaces'
    : activeWorkspace?.name ?? 'Select workspace';

  return (
    <div className="workspace-selector" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        className="workspace-selector__trigger"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={loading}
      >
        {loading ? (
          <Spinner />
        ) : (
          <>
            <span className="workspace-selector__trigger-icon">
              {activeWorkspaceId === null ? <AllWorkspacesIcon /> : <WorkspaceIcon />}
            </span>
            <span className="workspace-selector__label">{displayLabel}</span>
            <ChevronDown />
          </>
        )}
      </button>

      {open && (
        <div
          className="workspace-selector__dropdown"
          ref={listRef}
          role="listbox"
          aria-label="Select workspace"
        >
          {loading && (
            <div className="workspace-selector__skeleton">
              {[1, 2, 3].map((i) => (
                <div key={i} className="workspace-selector__skeleton-item" />
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="workspace-selector__error">
              <span>{error}</span>
              {onRetry && (
                <button
                  className="workspace-selector__retry-btn"
                  onClick={() => { onRetry(); setFocusedIndex(-1); }}
                  type="button"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {!loading && !error && (
            <>
              <button
                className={`workspace-selector__item${activeWorkspaceId === null ? ' workspace-selector__item--active' : ''}`}
                onClick={() => { onSelect(null); close(); }}
                type="button"
                role="option"
                aria-selected={activeWorkspaceId === null}
                data-focused={focusedIndex === 0}
              >
                <span className="workspace-selector__item-icon">
                  <AllWorkspacesIcon />
                </span>
                <span className="workspace-selector__item-name">All Workspaces</span>
                <span className="workspace-selector__item-count">
                  ({workspaces.length})
                </span>
              </button>

              <div className="workspace-selector__divider" />

              {workspaces.length === 0 && (
                <div className="workspace-selector__empty">No workspaces found</div>
              )}

              {workspaces.map((ws, i) => (
                <button
                  key={ws.id}
                  className={`workspace-selector__item${ws.id === activeWorkspaceId ? ' workspace-selector__item--active' : ''}`}
                  onClick={() => { onSelect(ws.id); close(); }}
                  type="button"
                  role="option"
                  aria-selected={ws.id === activeWorkspaceId}
                  data-focused={focusedIndex === i + 1}
                >
                  <span className="workspace-selector__item-icon">
                    <WorkspaceIcon />
                  </span>
                  <span className="workspace-selector__item-name">{ws.name}</span>
                  {ws.environment && (
                    <EnvironmentBadge env={ws.environment} />
                  )}
                  <StatusDot />
                </button>
              ))}
            </>
          )}

          <div className="workspace-selector__divider" />
          <button
            className="workspace-selector__create"
            onClick={() => { onCreateWorkspace(); close(); }}
            type="button"
            data-focused={focusedIndex === workspaces.length + 1}
          >
            + Create workspace
          </button>
        </div>
      )}
    </div>
  );
}

export type { WorkspaceSelectorProps, EnrichedWorkspace as Workspace };
