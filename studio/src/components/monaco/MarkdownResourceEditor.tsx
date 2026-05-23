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

  useEffect(() => {
    setFrontmatterError(parsed.error ?? null);
  }, [parsed.error]);

  const handleFrontmatterMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

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
  }, [schema]);

  const handleBodyMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

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
  }, []);

  const handleFrontmatterChange = useCallback(
    (newValue: string | undefined) => {
      const fm = newValue ?? '';
      const newContent = joinFrontmatter(fm, parsed.body);
      setValue(newContent);
      // Extract format from frontmatter and update body language
      const format = extractFormat(fm);
      if (format) {
        setBodyLanguage(formatToLanguage(format));
      }
      onChange?.(newContent);
    },
    [parsed.body, onChange]
  );

  const handleBodyChange = useCallback(
    (newValue: string | undefined) => {
      const body = newValue ?? '';
      const newContent = joinFrontmatter(parsed.frontmatter, body);
      setValue(newContent);
      onChange?.(newContent);
    },
    [parsed.frontmatter, onChange]
  );

  const handleSave = useCallback(async () => {
    if (frontmatterError || !onSave) return;

    setSaveStatus('saving');
    setErrorMessage(null);

    try {
      await onSave(value);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Save failed');
    }
  }, [value, frontmatterError, onSave]);

  // Validate on content change
  useEffect(() => {
    if (!validateContent || frontmatterError || !editorRef.current || !monacoRef.current) return;

    const timer = setTimeout(async () => {
      const result = await validateContent(arn, value);
      const model = editorRef.current?.getModel();
      if (!model) return;

      if (result && !result.valid) {
        const monaco = monacoRef.current;
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
        const monaco = monacoRef.current;
        monaco.editor.setModelMarkers(model, 'validation', []);
        setErrorMessage(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [arn, value, frontmatterError, validateContent]);

  const canSave = !frontmatterError && onSave && saveStatus !== 'saving';

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
