/**
 * UnifiedEditor — Dark shell that wraps two Monaco editors (YAML frontmatter + Markdown body)
 * into a single visual unit. Creates the perception of one continuous editing experience.
 *
 * Structure:
 *   DarkEditorFrame
 *   ├── EditorHeader (title + badge + toolbar)
 *   ├── SectionLabel "Frontmatter (YAML)"
 *   ├── MonacoEditor YAML (auto-height, resizable)
 *   ├── ResizeHandle (drag to resize)
 *   ├── SectionLabel "Markdown (Content)"
 *   ├── MonacoEditor Markdown (flex-1)
 *   └── StatusBar (unified cursor/language/errors)
 */

import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────

export interface EditorStatus {
  language: string;
  line: number;
  column: number;
}

export interface UnifiedEditorProps {
  /** Title shown in the card header, e.g. "Skill Definition" */
  title: string;
  /** Badge text next to the title, e.g. "YAML + Markdown" */
  badge?: string;
  /** ARN identifier (unused in shell, kept for API compat) */
  arn: string;
  /** Layout mode: 'dual' = frontmatter + body split, 'single' = one editor fills the frame */
  mode?: 'dual' | 'single';
  /** Frontmatter YAML editor element (dual mode only) */
  frontmatterEditor?: ReactNode;
  /** Markdown body editor element (dual mode only) */
  bodyEditor?: ReactNode;
  /** Single editor element for single-mode (fills entire frame) */
  singleEditor?: ReactNode;
  /** Status from the frontmatter editor (dual mode) */
  frontmatterStatus?: EditorStatus;
  /** Status from the body editor (dual mode) or single editor */
  bodyStatus?: EditorStatus;
  /** Status from the single editor (single mode) */
  singleStatus?: EditorStatus;
  /** Language label for single mode status bar, e.g. "YAML" */
  singleLanguage?: string;
  /** Error message to display in status bar */
  error?: string | null;
  /** Whether content has been saved */
  saved?: boolean;
  /** Called when Format button is clicked */
  onFormat?: () => void;
  /** Called when Expand button is clicked */
  onExpand?: () => void;
  /** Additional className for the outer container */
  className?: string;
}

// ─── Resize Handle ────────────────────────────────────────────────

function ResizeHandle({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startTopHeight = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    const topEl = containerRef.current?.querySelector<HTMLElement>('[data-section="frontmatter"]');
    startTopHeight.current = topEl?.offsetHeight ?? 120;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientY - startY.current;
      const container = containerRef.current;
      if (!container) return;
      const containerHeight = container.offsetHeight;
      const newTopHeight = Math.max(60, Math.min(startTopHeight.current + delta, containerHeight - 80));
      const topEl = container.querySelector<HTMLElement>('[data-section="frontmatter"]');
      if (topEl) {
        topEl.style.height = `${newTopHeight}px`;
        topEl.style.flex = 'none';
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Trigger Monaco layout for both editors
      (window as any).dispatchEvent?.(new Event('resize'));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [containerRef]);

  return (
    <div
      className="unified-editor__resize-handle"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize frontmatter and body sections"
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────

export function UnifiedEditor({
  title,
  badge,
  arn: _arn,
  mode = 'dual',
  frontmatterEditor,
  bodyEditor,
  singleEditor,
  frontmatterStatus,
  bodyStatus,
  singleStatus,
  singleLanguage = 'YAML',
  error,
  saved: _saved,
  onFormat,
  onExpand,
  className = '',
}: UnifiedEditorProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hasErrors = !!error;

  return (
    <div className={`unified-editor ${className}`.trim()}>
      {/* ── Card Header ───────────────────────────────────────── */}
      <div className="unified-editor__header">
        <div className="unified-editor__header-left">
          <h2 className="unified-editor__title">{title}</h2>
          {badge && <span className="unified-editor__badge">{badge}</span>}
        </div>
        <div className="unified-editor__toolbar">
          {onFormat && (
            <button
              className="unified-editor__toolbar-btn"
              onClick={onFormat}
              title="Format document"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 4h12M2 8h8M2 12h10" />
              </svg>
              Format
            </button>
          )}
          <button
            className="unified-editor__toolbar-btn"
            title="View schema"
            type="button"
          >
            {'{ }'}
          </button>
          {onExpand && (
            <button
              className="unified-editor__toolbar-btn"
              onClick={onExpand}
              title="Expand editor"
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3h4v1H4v3H3V3zM13 3H9v1h3v3h1V3zM3 13h4v-1H4V9H3v4zM13 13H9v-1h3V9h1v4z" />
              </svg>
            </button>
          )}
          <button
            className="unified-editor__toolbar-btn"
            title="More options"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="4" cy="8" r="1.5" fill="currentColor" />
              <circle cx="8" cy="8" r="1.5" fill="currentColor" />
              <circle cx="12" cy="8" r="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Dark Editor Frame ─────────────────────────────────── */}
      <div className="unified-editor__frame" ref={frameRef}>
        {mode === 'single' ? (
          /* ── Single mode: one editor fills the frame ──────── */
          <>
            <div className="unified-editor__section-label">
              <span className="unified-editor__section-label-primary">{singleLanguage}</span>
              <span className="unified-editor__section-label-secondary">(Configuration)</span>
            </div>
            <div data-section="single" className="unified-editor__section unified-editor__section--single">
              {singleEditor}
            </div>
          </>
        ) : (
          /* ── Dual mode: frontmatter + body split ──────────── */
          <>
            <div className="unified-editor__section-label">
              <span className="unified-editor__section-label-primary">Frontmatter</span>
              <span className="unified-editor__section-label-secondary">(YAML)</span>
            </div>
            <div data-section="frontmatter" className="unified-editor__section unified-editor__section--frontmatter">
              {frontmatterEditor}
            </div>
            <ResizeHandle containerRef={frameRef} />
            <div className="unified-editor__section-label">
              <span className="unified-editor__section-label-primary">Markdown</span>
              <span className="unified-editor__section-label-secondary">(Content)</span>
            </div>
            <div data-section="body" className="unified-editor__section unified-editor__section--body">
              {bodyEditor}
            </div>
          </>
        )}

        {/* Unified status bar */}
        <div className="unified-editor__statusbar">
          <div className="unified-editor__statusbar-left">
            {mode === 'single' ? (
              <>
                <span className="unified-editor__statusbar-item">{singleLanguage}</span>
                {singleStatus && (
                  <span className="unified-editor__statusbar-item">
                    Ln {singleStatus.line}, Col {singleStatus.column}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="unified-editor__statusbar-item">YAML</span>
                {frontmatterStatus && (
                  <span className="unified-editor__statusbar-item">
                    Ln {frontmatterStatus.line}, Col {frontmatterStatus.column}
                  </span>
                )}
                <span className="unified-editor__statusbar-separator">|</span>
                <span className="unified-editor__statusbar-item">Markdown</span>
                {bodyStatus && (
                  <span className="unified-editor__statusbar-item">
                    Ln {bodyStatus.line}, Col {bodyStatus.column}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="unified-editor__statusbar-right">
            <span className="unified-editor__statusbar-item">UTF-8</span>
            <span className="unified-editor__statusbar-item">Spaces: 2</span>
            {hasErrors ? (
              <span className="unified-editor__statusbar-item unified-editor__statusbar-item--error">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 5v3M8 10.5v.5" />
                </svg>
                Errors found
              </span>
            ) : (
              <span className="unified-editor__statusbar-item unified-editor__statusbar-item--success">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8l4 4 6-8" />
                </svg>
                No errors
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
