import { useState, useRef, useEffect } from 'react';

interface Workspace {
  id: string;
  name: string;
  status?: string;
}

interface WorkspaceSelectorProps {
  workspaces: Workspace[];
  activeWorkspaceId?: string;
  onSelect: (id: string) => void;
  onCreateWorkspace: () => void;
  loading?: boolean;
  error?: string;
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

export function WorkspaceSelector({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onCreateWorkspace,
  loading = false,
  error,
}: WorkspaceSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const displayLabel = activeWorkspace?.name ?? 'Select workspace';

  return (
    <div className="workspace-selector" ref={containerRef}>
      <button
        className="workspace-selector__trigger"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={loading}
      >
        {loading ? <Spinner /> : <span className="workspace-selector__label">{displayLabel}</span>}
        {!loading && <ChevronDown />}
      </button>

      {open && (
        <div className="workspace-selector__dropdown" role="listbox">
          {error && <div className="workspace-selector__error">{error}</div>}

          {workspaces.length === 0 && !error && (
            <div className="workspace-selector__empty">No workspaces found</div>
          )}

          {workspaces.map((ws) => (
            <button
              key={ws.id}
              className={`workspace-selector__item${ws.id === activeWorkspaceId ? ' workspace-selector__item--active' : ''}`}
              onClick={() => {
                onSelect(ws.id);
                setOpen(false);
              }}
              type="button"
              role="option"
              aria-selected={ws.id === activeWorkspaceId}
            >
              <span className="workspace-selector__item-name">{ws.name}</span>
              {ws.status && <span className="workspace-selector__item-status">{ws.status}</span>}
            </button>
          ))}

          <div className="workspace-selector__divider" />
          <button
            className="workspace-selector__create"
            onClick={() => {
              onCreateWorkspace();
              setOpen(false);
            }}
            type="button"
          >
            + Create workspace
          </button>
        </div>
      )}
    </div>
  );
}

export type { WorkspaceSelectorProps, Workspace };
