/**
 * EditorLayout — Shell layout for all resource editors (Agent, Skill, Prompt, Template, Tool).
 * Provides consistent header with breadcrumbs, ARN badge, action buttons, and error display.
 * Max-width container keeps the editor from stretching too wide on large screens.
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
  /** ARN identifier to display as a copyable badge */
  arn?: string;
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
  scope: _scope,
  arn,
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
  // Ctrl+S / Cmd+S keyboard shortcut — capture phase to beat Monaco's handler
  useEffect(() => {
    if (!onSave) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        onSave();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [onSave]);

  const copyArn = () => {
    if (arn) {
      navigator.clipboard?.writeText(arn);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Max-width container for content ──────────────────────── */}
      <div className="mx-auto w-full" style={{ maxWidth: 1280 }}>
        {/* ── Breadcrumbs ──────────────────────────────────────── */}
        <div className="px-6 pt-4 pb-2 flex items-center gap-2 text-sm shrink-0">
          <a
            href={backPath}
            className="text-primary hover:underline transition-colors"
          >
            ← {backLabel}
          </a>
          <span className="text-secondary">/</span>
          <span className="text-on-surface font-medium">{resourceName}</span>
        </div>

        {/* ── Title bar with name, ARN, actions ─────────────────── */}
        <div className="px-6 pb-4 flex items-start justify-between gap-4 shrink-0">
          <div className="flex flex-col gap-2 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-3">
              {/* Icon pastille */}
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--color-primary)" strokeWidth="1.5">
                  <rect x="2" y="2" width="12" height="12" rx="2" />
                  <path d="M5 6h6M5 8h4M5 10h5" />
                </svg>
              </div>

              {onResourceNameChange ? (
                <input
                  type="text"
                  value={resourceName}
                  onChange={(e) => onResourceNameChange(e.target.value)}
                  className="text-2xl font-bold text-on-surface bg-transparent border-none outline-none focus:underline focus:decoration-dotted min-w-0 max-w-xs"
                />
              ) : (
                <h1 className="text-2xl font-bold text-on-surface truncate">
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
            </div>

            {/* ARN badge */}
            {arn && (
              <div className="flex items-center gap-1.5 ml-12">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-md text-secondary"
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: '#94A3B8' }}>ARN</span>
                  {arn}
                </span>
                <button
                  onClick={copyArn}
                  className="p-1 text-secondary hover:text-on-surface transition-colors rounded hover:bg-surface-container"
                  title="Copy ARN"
                  type="button"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="6" y="6" width="8" height="8" rx="1" />
                    <path d="M10 6V4a1 1 0 00-1-1H4a1 1 0 00-1 1v5a1 1 0 001 1h2" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Actions column */}
          <div className="flex flex-col items-end gap-2 shrink-0 pt-1">
            <div className="flex items-center gap-2">
              {/* Preview button */}
              <Button variant="secondary" size="sm" type="button">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="mr-1">
                  <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" />
                  <circle cx="8" cy="8" r="2" />
                </svg>
                Preview
              </Button>

              {/* More actions */}
              <Button variant="secondary" size="sm" type="button">
                More actions
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="ml-1">
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </Button>

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

            {/* Save status */}
            {!saving && !isDirty && !error && (
              <span className="flex items-center gap-1 text-xs text-success">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8l4 4 6-8" />
                </svg>
                All changes saved
              </span>
            )}
            {saving && (
              <span className="text-xs text-secondary">Saving…</span>
            )}
          </div>
        </div>

        {/* ── Error banner ────────────────────────────────────── */}
        {error && (
          <div className="mx-6 mb-3 px-4 py-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm">
            {error}
          </div>
        )}

        {/* ── Tab navigation (only rendered when tabs are provided) ── */}
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
      </div>

      {/* ── Content area — fills remaining space ── */}
      <main className="flex-1 overflow-hidden flex flex-col min-h-0 px-6 pb-6">
        <div className="mx-auto w-full flex-1 flex flex-col min-h-0" style={{ maxWidth: 1280 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
