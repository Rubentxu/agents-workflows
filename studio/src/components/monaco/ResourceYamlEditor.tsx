/**
 * ResourceYamlEditor — Monaco-based YAML editor for workflow, agent, and tool resources.
 * Integrates with the Studio REST API for validation and schema-based autocomplete.
 *
 * Usage:
 *   <ResourceYamlEditor
 *     arn="arn:local:global:workflow/my-workflow"
 *     initialValue={yamlContent}
 *     onChange={(yaml) => setYaml(yaml)}
 *     onSave={(yaml) => saveResource(yaml)}
 *   />
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { configureMonacoYaml } from 'monaco-yaml';
import yaml from 'js-yaml';
import type * as Monaco from 'monaco-editor';
import { useSchema, type ResourceType } from '@/hooks/useSchema';
import { useContent } from '@/hooks/useContent';

export interface ResourceYamlEditorProps {
  arn: string;
  initialValue?: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => Promise<void>;
  readOnly?: boolean;
  height?: string;
  theme?: 'vs-dark' | 'light';
}

function arnToResourceType(arn: string): ResourceType | null {
  const match = arn.match(/^arn:local:[^:]+:([^/]+)\//);
  if (!match) return null;
  const type = match[1];
  if (type === 'workflow') return 'workflow';
  if (type === 'agent') return 'agent';
  if (type === 'tool') return 'tool';
  return null;
}

export function ResourceYamlEditor({
  arn,
  initialValue = '',
  onChange,
  onSave,
  readOnly = false,
  height = '100%',
  theme = 'vs-dark',
}: ResourceYamlEditorProps) {
  const [value, setValue] = useState(initialValue);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const configuredRef = useRef(false);

  const resourceType = arnToResourceType(arn);
  const { fetchSchema, loading: schemaLoading } = useSchema();
  const { validateContent } = useContent();
  const [schema, setSchema] = useState<object | null>(null);

  // Fetch schema and configure monaco-yaml when available
  useEffect(() => {
    if (resourceType && !schemaLoading) {
      fetchSchema(resourceType).then((s) => {
        if (s) {
          setSchema(s);
        }
      });
    }
  }, [resourceType, schemaLoading, fetchSchema]);

  // Reconfigure monaco-yaml when schema changes
  useEffect(() => {
    if (!schema || !monacoRef.current) return;

    const monaco = monacoRef.current;
    configureMonacoYaml(monaco, {
      enableSchemaRequest: false,
      format: {
        enable: true,
        bracketSpacing: true,
      },
      validate: true,
      schemas: [
        {
          uri: 'https://schemas.workflows.local/resource.json',
          fileMatch: ['*'],
          schema: schema,
        },
      ],
    });
  }, [schema]);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (!configuredRef.current) {
      configuredRef.current = true;

      // Initial configuration without schema (will be reconfigured when schema loads)
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

  const handleChange = useCallback(
    (newValue: string | undefined) => {
      const content = newValue ?? '';
      setValue(content);

      // Validate YAML syntax
      try {
        yaml.load(content);
        setParseError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid YAML';
        setParseError(msg);
      }

      onChange?.(content);
    },
    [onChange]
  );

  const handleSave = useCallback(async () => {
    if (parseError || !onSave) return;

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
  }, [value, parseError, onSave]);

  // Validate on content change (debounced)
  useEffect(() => {
    if (!validateContent || parseError || !editorRef.current || !monacoRef.current) return;

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
  }, [arn, value, parseError, validateContent]);

  const canSave = !parseError && onSave && saveStatus !== 'saving';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant bg-surface-container/30">
        <div className="flex items-center gap-3">
          <span className="text-xs text-secondary font-mono">{arn}</span>
          {parseError && (
            <span className="text-[10px] text-error">• {parseError}</span>
          )}
          {errorMessage && !parseError && (
            <span className="text-[10px] text-warning">• {errorMessage}</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-[10px] text-success">• Saved</span>
          )}
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

      <div className="flex-1 overflow-hidden">
        <Editor
          height={height}
          language="yaml"
          value={value}
          theme={theme}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            wordWrap: 'on',
            folding: true,
            renderLineHighlight: 'line',
            scrollbar: {
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
            padding: { top: 8, bottom: 8 },
            formatOnPaste: true,
            formatOnType: true,
          }}
        />
      </div>
    </div>
  );
}
