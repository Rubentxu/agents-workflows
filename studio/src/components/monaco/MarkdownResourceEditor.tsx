/**
 * MarkdownResourceEditor — Monaco-based editor for skill, prompt, and template resources.
 * Uses UnifiedEditor shell for a single visual editing experience with YAML frontmatter + Markdown body.
 *
 * Usage:
 *   <MarkdownResourceEditor
 *     arn="arn:local:global:skill/my-skill"
 *     initialValue={content}
 *     onChange={(content) => setContent(content)}
 *     onSave={(content) => saveResource(content)}
 *   />
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';

import type * as Monaco from 'monaco-editor';
import { useContent } from '@/hooks/useContent';
import { UnifiedEditor } from './UnifiedEditor';
import type { EditorStatus } from './UnifiedEditor';

export interface MarkdownResourceEditorProps {
  arn: string;
  /** Display title for the editor card header */
  cardTitle?: string;
  /** Badge text (e.g. "YAML + Markdown") */
  cardBadge?: string;
  initialValue?: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => Promise<boolean>;
  /** Optional ref to expose the Monaco editor instance for external save coordination */
  editorRef?: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  readOnly?: boolean;
  theme?: 'vs-dark' | 'light';
}

interface FrontmatterResult {
  frontmatter: string;
  body: string;
  error?: string;
}

function splitFrontmatter(content: string): FrontmatterResult {
  const lines = content.split('\n');

  if (lines[0]?.trim() !== '---') {
    return { frontmatter: '', body: content };
  }

  const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
  if (endIndex === -1) {
    return { frontmatter: '', body: content, error: 'Unclosed frontmatter' };
  }

  return {
    frontmatter: lines.slice(1, endIndex + 1).join('\n'),
    body: lines.slice(endIndex + 2).join('\n'),
    error: undefined,
  };
}

function joinFrontmatter(frontmatter: string, body: string): string {
  if (!frontmatter) return body;
  return `---\n${frontmatter}\n---\n${body}`;
}

/// Extract format field from YAML frontmatter
function extractFormat(frontmatter: string): string | null {
  try {
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const match = line.match(/^format:\s*(.+)$/);
      if (match) {
        return match[1].trim();
      }
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
}

/// Map template format to Monaco language id
function formatToLanguage(format: string | null): string {
  if (!format) return 'markdown';
  switch (format.toLowerCase()) {
    case 'json': return 'json';
    case 'yaml': return 'yaml';
    case 'xml': return 'xml';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'javascript':
    case 'js': return 'javascript';
    case 'typescript':
    case 'ts': return 'typescript';
    case 'python':
    case 'py': return 'python';
    case 'rust':
    case 'rs': return 'rust';
    case 'go': return 'go';
    case 'sql': return 'sql';
    case 'shell':
    case 'bash':
    case 'sh': return 'shell';
    default: return 'markdown';
  }
}

export function MarkdownResourceEditor({
  arn,
  cardTitle = 'Resource Definition',
  cardBadge = 'YAML + Markdown',
  initialValue = '',
  onChange,
  onSave,
  editorRef: externalEditorRef,
  readOnly = false,
  theme = 'vs-dark',
}: MarkdownResourceEditorProps) {
  const [value, setValue] = useState(initialValue);
  const [frontmatterError, setFrontmatterError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Body language is derived from the format field in frontmatter (for templates)
  const [bodyLanguage, setBodyLanguage] = useState<string>('markdown');

  // Cursor status for each editor
  const [fmStatus, setFmStatus] = useState<EditorStatus>({ language: 'yaml', line: 1, column: 1 });
  const [bodyStatusState, setBodyStatus] = useState<EditorStatus>({ language: 'markdown', line: 1, column: 1 });

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  // hold editor references for ResizeObserver-based layout
  const editorRefArray = useRef<(Monaco.editor.IStandaloneCodeEditor | null)[]>([null, null]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const fmEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const bodyEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const parsed = splitFrontmatter(value);

  const { validateContent } = useContent();

  // ── ResizeObserver: layout all editors when container resizes ──
  const ensureEditorLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    editorRefArray.current.forEach((ed) => { try { ed?.layout(); } catch {} });

    resizeObserverRef.current?.disconnect();
    const observer = new ResizeObserver(() => {
      editorRefArray.current.forEach((ed) => { try { ed?.layout(); } catch {} });
    });
    observer.observe(container);
    resizeObserverRef.current = observer;
  }, []);

  // ── Auto-height frontmatter ──────────────────────────────────
  useEffect(() => {
    const editor = fmEditorRef.current;
    const frame = containerRef.current?.querySelector<HTMLElement>('[data-section="frontmatter"]');
    if (!editor || !frame) return;

    const model = editor.getModel();
    if (!model) return;
    const lineHeight = 20;
    const lineCount = model.getLineCount();
    const newHeight = Math.max(60, Math.min(lineCount * lineHeight + 16, window.innerHeight * 0.45));
    frame.style.height = `${newHeight}px`;
    frame.style.flex = 'none';
    requestAnimationFrame(() => editor.layout());
  }, [parsed.frontmatter]);

  // ── Cursor position tracking ─────────────────────────────────
  const trackCursorPosition = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, which: 'frontmatter' | 'body') => {
      editor.onDidChangeCursorPosition((e) => {
        const status: EditorStatus = {
          language: which === 'frontmatter' ? 'yaml' : bodyLanguage,
          line: e.position.lineNumber,
          column: e.position.column,
        };
        if (which === 'frontmatter') {
          setFmStatus(status);
        } else {
          setBodyStatus(status);
        }
      });
    },
    [bodyLanguage],
  );

  // ── Content change handler ───────────────────────────────────
  const applyCombinedValue = useCallback(
    (nextContent: string) => {
      setValue(nextContent);
      const nextParsed = splitFrontmatter(nextContent);
      setFrontmatterError(nextParsed.error ?? null);
      const format = extractFormat(nextParsed.frontmatter);
      if (format) {
        setBodyLanguage(formatToLanguage(format));
      }
      onChange?.(nextContent);
    },
    [onChange],
  );

  useEffect(() => {
    setFrontmatterError(parsed.error ?? null);
  }, [parsed.error]);

  // ── Editor mount handlers ────────────────────────────────────
  const handleFrontmatterMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    editorRefArray.current[0] = editor;
    editorRefArray.current[1] = bodyEditorRef.current;
    monacoRef.current = monaco;
    fmEditorRef.current = editor;

    requestAnimationFrame(() => { editor.layout(); });
    ensureEditorLayout();

    // Track cursor
    trackCursorPosition(editor, 'frontmatter');

    // Forward to external ref if provided
    if (externalEditorRef) {
      (externalEditorRef as React.MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>).current = editor;
    }

    // Signal that Monaco model is now ready for test bridge operations.
    resolveModelReadyRef.current?.();
  }, [externalEditorRef, ensureEditorLayout, trackCursorPosition]);

  const handleBodyMount: OnMount = useCallback((editor, monaco) => {
    bodyEditorRef.current = editor;
    editorRefArray.current[1] = editor;
    monacoRef.current = monaco;

    requestAnimationFrame(() => { editor.layout(); });
    ensureEditorLayout();

    // Track cursor
    trackCursorPosition(editor, 'body');

    // Forward to external ref if provided
    if (externalEditorRef) {
      (externalEditorRef as React.MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>).current = editor;
    }

    monaco.languages.setLanguageConfiguration('markdown', {
      surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: '---', close: '---' },
      ],
    });
  }, [externalEditorRef, ensureEditorLayout, trackCursorPosition]);

  // ── Change handlers ──────────────────────────────────────────
  const handleFrontmatterChange = useCallback(
    (newValue: string | undefined) => {
      const fm = newValue ?? '';
      const newContent = joinFrontmatter(fm, parsed.body);
      applyCombinedValue(newContent);
    },
    [applyCombinedValue, parsed.body],
  );

  const handleBodyChange = useCallback(
    (newValue: string | undefined) => {
      const body = newValue ?? '';
      const newContent = joinFrontmatter(parsed.frontmatter, body);
      applyCombinedValue(newContent);
    },
    [applyCombinedValue, parsed.frontmatter],
  );

  // ── Save handler ─────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (frontmatterError || !onSave) return;

    setSaveStatus('saving');
    setErrorMessage(null);

    try {
      const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
      const fmEditor = fmEditorRef.current ?? editors[0];
      const bodyEditor = bodyEditorRef.current ?? editors[1];
      const fmContent = fmEditor?.getModel?.()?.getValue?.() ?? parsed.frontmatter;
      const bodyContent = bodyEditor?.getModel?.()?.getValue?.() ?? parsed.body;
      const currentContent = joinFrontmatter(fmContent, bodyContent);

      const saved = await onSave(currentContent);
      if (saved) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Save failed');
    }
  }, [frontmatterError, onSave, parsed]);

  // ── Validation ───────────────────────────────────────────────
  useEffect(() => {
    if (!validateContent || frontmatterError || !editorRef.current || !monacoRef.current) return;

    const timer = setTimeout(async () => {
      const result = await validateContent(arn, value);
      const model = editorRef.current?.getModel();
      if (!model) return;
      const monaco = monacoRef.current;
      if (!monaco) return;

      if (result && !result.valid) {
        const markers = result.diagnostics.map((d) => ({
          severity: d.severity === 'error'
            ? monaco.MarkerSeverity.Error
            : d.severity === 'warning'
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info,
          message: d.message,
          startLineNumber: d.location?.line ?? 1,
          startColumn: d.location?.column ?? 0,
          endLineNumber: d.location?.line ?? 1,
          endColumn: d.location?.column ? d.location.column + 1 : 80,
        }));
        monaco.editor.setModelMarkers(model, 'validation', markers);

        const errors = result.diagnostics.filter((d) => d.severity === 'error');
        if (errors.length > 0) {
          setErrorMessage(errors[0].message);
        }
      } else {
        monaco.editor.setModelMarkers(model, 'validation', []);
        setErrorMessage(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [arn, value, frontmatterError, validateContent]);

  const canSave = !frontmatterError && onSave && saveStatus !== 'saving';

  // ── Test bridge ──────────────────────────────────────────────
  const modelReadyRef = useRef<Promise<void>>(Promise.resolve());
  const resolveModelReadyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    modelReadyRef.current = new Promise<void>(resolve => { resolveModelReadyRef.current = resolve; });

    if (editorRef.current) {
      resolveModelReadyRef.current?.();
    }

    const globalWindow = window as typeof window & {
      __AW_MONACO_TEST__?: {
        markdownEditors?: Record<string, {
          setValue: (next: string) => void;
          getValue: () => string;
          getFrontmatter: () => string;
          getBody: () => string;
          save: () => Promise<void>;
          canSave: () => boolean;
          getError: () => string | null;
          ready: Promise<void>;
        }>;
      };
    };

    globalWindow.__AW_MONACO_TEST__ ??= {};
    globalWindow.__AW_MONACO_TEST__.markdownEditors ??= {};
    globalWindow.__AW_MONACO_TEST__.markdownEditors[arn] = {
      setValue: (next: string) => {
        applyCombinedValue(next);
        const nextParsed = splitFrontmatter(next);
        const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
        const fmEditor = fmEditorRef.current ?? editors[0];
        const bodyEditor = bodyEditorRef.current ?? editors[1];
        fmEditor?.getModel?.()?.setValue(nextParsed.frontmatter);
        bodyEditor?.getModel?.()?.setValue(nextParsed.body);
      },
      getValue: () => {
        const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
        if (editors.length === 0) return value;
        if (editors.length >= 2) {
          const fmContent = editors[0]?.getModel?.()?.getValue?.() ?? '';
          const bodyContent = editors[1]?.getModel?.()?.getValue?.() ?? '';
          return joinFrontmatter(fmContent, bodyContent);
        }
        return editors[0]?.getModel?.()?.getValue?.() ?? value;
      },
      getFrontmatter: () => {
        const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
        if (editors.length >= 1) {
          return editors[0]?.getModel?.()?.getValue?.() ?? splitFrontmatter(value).frontmatter;
        }
        return splitFrontmatter(value).frontmatter;
      },
      getBody: () => {
        const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
        if (editors.length >= 2) {
          return editors[1]?.getModel?.()?.getValue?.() ?? splitFrontmatter(value).body;
        }
        return splitFrontmatter(value).body;
      },
      save: async () => { await handleSave(); },
      canSave: () => Boolean(canSave),
      getError: () => frontmatterError ?? errorMessage,
      ready: modelReadyRef.current,
    };

    return () => {
      delete globalWindow.__AW_MONACO_TEST__?.markdownEditors?.[arn];
      resizeObserverRef.current?.disconnect();
    };
  }, [applyCombinedValue, arn, canSave, errorMessage, frontmatterError, handleSave, value]);

  // ── Shared Monaco options ────────────────────────────────────
  const baseOptions = {
    readOnly,
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on' as const,
    folding: false,
    padding: { top: 4, bottom: 4 },
    scrollbar: {
      vertical: 'hidden' as const,
      horizontal: 'hidden' as const,
    },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    renderLineHighlight: 'none' as const,
    contextmenu: false,
  };

  const combinedError = frontmatterError ?? errorMessage;

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0" ref={containerRef}>
      <UnifiedEditor
        title={cardTitle}
        badge={cardBadge}
        arn={arn}
        frontmatterEditor={
          <Editor
            height="100%"
            language="yaml"
            value={parsed.frontmatter}
            theme={theme}
            onChange={handleFrontmatterChange}
            onMount={handleFrontmatterMount}
            options={{
              ...baseOptions,
              lineNumbers: 'on',
            }}
          />
        }
        bodyEditor={
          <Editor
            height="100%"
            language={bodyLanguage}
            value={parsed.body}
            theme={theme}
            onChange={handleBodyChange}
            onMount={handleBodyMount}
            options={{
              ...baseOptions,
              lineNumbers: 'on',
            }}
          />
        }
        frontmatterStatus={fmStatus}
        bodyStatus={bodyStatusState}
        error={combinedError}
        saved={saveStatus === 'saved'}
        onFormat={() => {
          // Format both editors
          const fmEd = fmEditorRef.current;
          const bodyEd = bodyEditorRef.current;
          if (fmEd) {
            fmEd.getAction('editor.action.formatDocument')?.run();
          }
          if (bodyEd) {
            bodyEd.getAction('editor.action.formatDocument')?.run();
          }
        }}
      />
    </div>
  );
}
