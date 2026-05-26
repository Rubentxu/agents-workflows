/**
 * MarkdownResourceEditor — Monaco-based editor for skill, prompt, and template resources.
 * Features split view for frontmatter (YAML) and body (Markdown), or unified editing.
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
import { configureMonacoYaml } from 'monaco-yaml';
import type * as Monaco from 'monaco-editor';
import { useContent } from '@/hooks/useContent';
import { useSchema, type ResourceType } from '@/hooks/useSchema';

export interface MarkdownResourceEditorProps {
  arn: string;
  initialValue?: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => Promise<void>;
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

function arnToResourceType(arn: string): ResourceType | null {
  const match = arn.match(/^arn:local:[^:]+:([^/]+)\//);
  if (!match) return null;
  const type = match[1];
  if (type === 'skill') return 'skill';
  if (type === 'prompt') return 'prompt';
  if (type === 'template') return 'template';
  return null;
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
  const [activeSection, setActiveSection] = useState<'frontmatter' | 'body' | 'split'>('split');

  // Body language is derived from the format field in frontmatter (for templates)
  const [bodyLanguage, setBodyLanguage] = useState<string>('markdown');

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const configuredRef = useRef(false);

  const { validateContent } = useContent();
  const { fetchSchema, loading: schemaLoading } = useSchema();
  const [schema, setSchema] = useState<object | null>(null);

  const resourceType = arnToResourceType(arn);

  // Fetch schema for frontmatter validation
  useEffect(() => {
    if (resourceType && !schemaLoading) {
      fetchSchema(resourceType).then((s) => {
        if (s) {
          setSchema(s);
        }
      });
    }
  }, [resourceType, schemaLoading, fetchSchema]);

  const parsed = splitFrontmatter(value);

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
    [onChange]
  );

  useEffect(() => {
    setFrontmatterError(parsed.error ?? null);
  }, [parsed.error]);

  const handleFrontmatterMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Forward to external ref if provided (for parent component save coordination)
    if (externalEditorRef) {
      (externalEditorRef as React.MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>).current = editor;
    }

    // Signal that Monaco model is now ready for test bridge operations.
    resolveModelReadyRef.current?.();

    if (!configuredRef.current) {
      configuredRef.current = true;

      configureMonacoYaml(monaco, {
        enableSchemaRequest: false,
        format: {
          enable: true,
          bracketSpacing: true,
        },
        validate: true,
        schemas: schema
          ? [
              {
                uri: 'https://schemas.workflows.local/resource.json',
                fileMatch: ['*'],
                schema: schema,
              },
            ]
          : [],
      });
    }
  }, [schema, externalEditorRef]);

  const handleBodyMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Forward to external ref if provided (body editor is secondary but still exposed)
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
  }, [externalEditorRef]);

  const handleFrontmatterChange = useCallback(
    (newValue: string | undefined) => {
      const fm = newValue ?? '';
      const newContent = joinFrontmatter(fm, parsed.body);
      applyCombinedValue(newContent);
    },
    [applyCombinedValue, parsed.body]
  );

  const handleBodyChange = useCallback(
    (newValue: string | undefined) => {
      const body = newValue ?? '';
      const newContent = joinFrontmatter(parsed.frontmatter, body);
      applyCombinedValue(newContent);
    },
    [applyCombinedValue, parsed.frontmatter]
  );

  const handleSave = useCallback(async () => {
    if (frontmatterError || !onSave) return;

    setSaveStatus('saving');
    setErrorMessage(null);

    try {
      // Read directly from Monaco editor model(s) to get current content.
      // For split view, reconstruct from both editors.
      // This ensures we save what the user sees, even after programmatic changes.
      let currentContent: string;
      if (activeSection === 'split') {
        // In split mode, we have two editors - need to get content from both
        // The frontmatter editor is the first one registered
        const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
        const fmEditor = editors[0];
        const bodyEditor = editors[1];
        const fmContent = fmEditor?.getValue?.() ?? parsed.frontmatter;
        const bodyContent = bodyEditor?.getValue?.() ?? parsed.body;
        currentContent = joinFrontmatter(fmContent, bodyContent);
      } else if (activeSection === 'frontmatter') {
        const editor = editorRef.current;
        currentContent = editor?.getValue?.() ?? value;
      } else {
        const editor = editorRef.current;
        currentContent = editor?.getValue?.() ?? value;
      }

      await onSave(currentContent);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Save failed');
    }
  }, [value, frontmatterError, onSave, activeSection, parsed]);

  // Validate on content change
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
        // Clear markers on success
        monaco.editor.setModelMarkers(model, 'validation', []);
        setErrorMessage(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [arn, value, frontmatterError, validateContent]);

  const canSave = !frontmatterError && onSave && saveStatus !== 'saving';

  // Stable ready promise for tests — resolved when Monaco editor model is available.
  const modelReadyRef = useRef<Promise<void>>(Promise.resolve());
  const resolveModelReadyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Create a new promise each time (in case of remount scenarios).
    modelReadyRef.current = new Promise<void>(resolve => { resolveModelReadyRef.current = resolve; });

    // If Monaco already mounted before this useEffect ran (onMount fires before useEffect),
    // resolve immediately so tests don't hang.
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
          setSection: (section: 'frontmatter' | 'body' | 'split') => void;
          save: () => Promise<void>;
          canSave: () => boolean;
          getError: () => string | null;
          /** Resolves when Monaco editor model is ready. */
          ready: Promise<void>;
        }>;
      };
    };

    globalWindow.__AW_MONACO_TEST__ ??= {};
    globalWindow.__AW_MONACO_TEST__.markdownEditors ??= {};
    globalWindow.__AW_MONACO_TEST__.markdownEditors[arn] = {
      setValue: (next: string) => {
        // Update React state (triggers re-render for controlled prop update)
        applyCombinedValue(next);

        // Also update Monaco models directly so save() reads correct content.
        // handleSave() reads from Monaco editors, not React state.
        // Without direct model update, Monaco models retain stale content.
        const nextParsed = splitFrontmatter(next);
        if (activeSection === 'split') {
          // Update both editors - use window.monaco as fallback if editorRef not set
          const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
          const fmEditor = editorRef.current ?? editors[0];
          const bodyEditor = editors[1];
          fmEditor?.getModel?.()?.setValue(nextParsed.frontmatter);
          bodyEditor?.getModel?.()?.setValue(nextParsed.body);
        } else {
          let editor = editorRef.current;
          if (!editor) {
            const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
            editor = editors[activeSection === 'frontmatter' ? 0 : 1];
          }
          const content = activeSection === 'frontmatter' ? nextParsed.frontmatter : nextParsed.body;
          editor?.getModel?.()?.setValue(content);
        }
      },
      // Read directly from Monaco model(s) — source of truth for displayed content.
      // React state `value` lags after programmatic setValue calls.
      getValue: () => {
        const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
        if (editors.length === 0) return value;
        if (editors.length >= 2) {
          // Split view: reconstruct with --- markers
          const fmContent = editors[0]?.getModel?.()?.getValue?.() ?? '';
          const bodyContent = editors[1]?.getModel?.()?.getValue?.() ?? '';
          return joinFrontmatter(fmContent, bodyContent);
        }
        // Single editor
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
      setSection: (section) => setActiveSection(section),
      save: async () => { await handleSave(); },
      canSave: () => Boolean(canSave),
      getError: () => frontmatterError ?? errorMessage,
      ready: modelReadyRef.current,
    };

    return () => {
      delete globalWindow.__AW_MONACO_TEST__?.markdownEditors?.[arn];
    };
  }, [applyCombinedValue, arn, canSave, errorMessage, frontmatterError, handleSave, value]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant bg-surface-container/30">
        <div className="flex items-center gap-3">
          <span className="text-xs text-secondary font-mono">{arn}</span>
          {frontmatterError && (
            <span className="text-[10px] text-error">• {frontmatterError}</span>
          )}
          {errorMessage && !frontmatterError && (
            <span className="text-[10px] text-warning">• {errorMessage}</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-[10px] text-success">• Saved</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-surface-container rounded p-0.5">
            <button
              onClick={() => setActiveSection('frontmatter')}
              className={`px-2 py-1 text-[10px] rounded transition-colors ${
                activeSection === 'frontmatter'
                  ? 'bg-primary text-on-primary'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              YAML
            </button>
            <button
              onClick={() => setActiveSection('body')}
              className={`px-2 py-1 text-[10px] rounded transition-colors ${
                activeSection === 'body'
                  ? 'bg-primary text-on-primary'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              MD
            </button>
            <button
              onClick={() => setActiveSection('split')}
              className={`px-2 py-1 text-[10px] rounded transition-colors ${
                activeSection === 'split'
                  ? 'bg-primary text-on-primary'
                  : 'text-secondary hover:text-on-surface'
              }`}
            >
              Split
            </button>
          </div>

          {onSave && (
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-3 py-1 text-xs bg-primary text-on-primary rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveStatus === 'saving' ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeSection === 'frontmatter' && (
          <Editor
            height="100%"
            language="yaml"
            value={parsed.frontmatter}
            theme={theme}
            onChange={handleFrontmatterChange}
            onMount={handleFrontmatterMount}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              folding: false,
              padding: { top: 8, bottom: 8 },
            }}
          />
        )}

        {activeSection === 'body' && (
          <Editor
            height="100%"
            language={bodyLanguage}
            value={parsed.body}
            theme={theme}
            onChange={handleBodyChange}
            onMount={handleBodyMount}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
              lineNumbers: 'off',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              padding: { top: 8, bottom: 8 },
            }}
          />
        )}

        {activeSection === 'split' && (
          <div className="flex h-full">
            <div className="w-1/2 border-r border-outline-variant">
              <div className="h-full flex flex-col">
                <div className="px-3 py-1 bg-surface-container/50 border-b border-outline-variant">
                  <span className="text-[10px] text-secondary uppercase tracking-wider">Frontmatter (YAML)</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Editor
                    height="100%"
                    language="yaml"
                    value={parsed.frontmatter}
                    theme={theme}
                    onChange={handleFrontmatterChange}
                    onMount={handleFrontmatterMount}
                    options={{
                      readOnly,
                      minimap: { enabled: false },
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 2,
                      wordWrap: 'on',
                      folding: false,
                      padding: { top: 4, bottom: 4 },
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="w-1/2">
              <div className="h-full flex flex-col">
                <div className="px-3 py-1 bg-surface-container/50 border-b border-outline-variant">
                  <span className="text-[10px] text-secondary uppercase tracking-wider">Body ({bodyLanguage})</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Editor
                    height="100%"
                    language={bodyLanguage}
                    value={parsed.body}
                    theme={theme}
                    onChange={handleBodyChange}
                    onMount={handleBodyMount}
                    options={{
                      readOnly,
                      minimap: { enabled: false },
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                      lineNumbers: 'off',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 2,
                      wordWrap: 'on',
                      padding: { top: 4, bottom: 4 },
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
