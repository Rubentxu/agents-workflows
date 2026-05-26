/**
 * EditorLayout — Shell layout for all resource editors (Agent, Skill, Prompt, Template, Tool).
 * Provides consistent header, tab navigation, and error display across all editors.
 *
 * Tabs are optional — editors that use Monaco as the sole editing surface
 * do not pass the tabs prop.
 */

import { type ReactNode, useEffect } from 'react';
import { Button } from '@/components/primitives/Button';

export interface EditorLayoutProps {
  /** Label for the back link, e.g. "Agents" */
  backLabel: string;
  /** Path to navigate back to, e.g. "/studio/projects/xxx/design/agents" */
  backPath: string;
  /** Current resource name, shown in the header */
  resourceName: string;
  /** Called when the inline name is edited by the user */
  onResourceNameChange?: (name: string) => void;
  /** True when creating a new resource (hides delete button) */
  isNew: boolean;
  /** Optional scope string to display as a badge (e.g. "global", "project/xxx") */
  scope?: string;
  /** True while a save operation is in progress */
  saving?: boolean;
  /** Error message to display in a banner; null means no error */
  error?: string | null;
  /** Called when the user clicks the delete button */
  onDelete?: () => void;
  /** Called when the user clicks the save button */
  onSave?: () => void;
  /** Tab definitions for the tab navigation bar (optional when Monaco is sole editor) */
  tabs?: { key: string; label: string }[];
  /** The currently active tab key */
  activeTab?: string;
  /** Called when the user switches tabs */
  onTabChange?: (key: string) => void;
  /** Whether the editor has unsaved changes — shows a dirty indicator (●) */
  isDirty?: boolean;
  /** The main content area rendered below the tab bar (or full-width if no tabs) */
  children: ReactNode;
}

/**
 * Shell layout used by all five resource editors. Renders a fixed header with
 * back navigation, editable resource name, scope badge, and Save/Delete buttons;
 * an optional tabbed body; and an optional error banner.
 */
export function EditorLayout({
  backLabel,
  backPath,
  resourceName,
  onResourceNameChange,
  isNew,
  scope,
  saving = false,
  error = null,
  onDelete,
  onSave,
  tabs,
  activeTab,
  onTabChange,
  isDirty = false,
  children,
}: EditorLayoutProps) {
  // Ctrl+S / Cmd+S keyboard shortcut
  useEffect(() => {
    if (!onSave) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        onSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-outline-variant bg-surface-container/30 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back link */}
          <a
            href={backPath}
            className="text-secondary hover:text-on-surface transition-colors text-sm whitespace-nowrap"
          >
            ← {backLabel}
          </a>

          <div className="w-px h-4 bg-border-subtle shrink-0" />

          {/* Editable resource name */}
          {onResourceNameChange ? (
            <input
              type="text"
              value={resourceName}
              onChange={(e) => onResourceNameChange(e.target.value)}
              className="text-base font-semibold text-on-surface bg-transparent border-none outline-none focus:underline focus:decoration-dotted min-w-0 max-w-xs"
            />
          ) : (
            <h1 className="text-base font-semibold text-on-surface truncate">
              {resourceName}
            </h1>
          )}

          {/* Dirty indicator */}
          {isDirty && (
            <span
              className="text-warning text-lg leading-none select-none"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            >
              ●
            </span>
          )}

          {/* Scope badge */}
          {scope && (
            <span className="px-2 py-0.5 text-xs rounded bg-surface-container border border-outline-variant text-secondary">
              {scope}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!isNew && onDelete && (
            <Button variant="danger" size="sm" onClick={onDelete}>
              Delete
            </Button>
          )}
          {onSave && (
            <Button variant="primary" size="sm" loading={saving} onClick={onSave}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
      </header>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-error/10 border border-error/20 rounded text-error text-sm">
          {error}
        </div>
      )}

      {/* ── Tab navigation (only rendered when tabs are provided) ──────────── */}
      {tabs && tabs.length > 0 && (
        <nav className="flex px-6 border-b border-outline-variant bg-surface-container/20 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange?.(tab.key)}
              className={[
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-secondary hover:text-on-surface',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      {/* ── Scrollable content ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
