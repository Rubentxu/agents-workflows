/**
 * ResourceYamlEditor — Monaco-based YAML editor for agent and tool resources.
 * Uses UnifiedEditor shell (single mode) for a consistent visual experience
 * with the same premium card look as Skill/Prompt/Template editors.
 *
 * Usage:
 *   <ResourceYamlEditor
 *     arn="arn:local:global:agent/my-agent"
 *     initialValue={yamlContent}
 *     onChange={(yaml) => setYaml(yaml)}
 *     onSave={(yaml) => saveResource(yaml)}
 *   />
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import yaml from 'js-yaml';
import type * as Monaco from 'monaco-editor';
import { useContent } from '@/hooks/useContent';
import { UnifiedEditor } from './UnifiedEditor';
import type { EditorStatus } from './UnifiedEditor';

export interface ResourceYamlEditorProps {
  arn: string;
  /** Display title for the editor card header */
  cardTitle?: string;
  /** Badge text (e.g. "YAML Configuration") */
  cardBadge?: string;
  initialValue?: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => Promise<void>;
  /** Optional ref to expose the Monaco editor instance for external save coordination */
  editorRef?: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  readOnly?: boolean;
  height?: string;
  theme?: 'vs-dark' | 'light';
}

export function ResourceYamlEditor({
  arn,
  cardTitle = 'Resource Definition',
  cardBadge = 'YAML',
  initialValue = '',
  onChange,
  onSave,
  editorRef: externalEditorRef,
  readOnly = false,
  theme = 'vs-dark',
}: ResourceYamlEditorProps) {
  const [value, setValue] = useState(initialValue);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cursorStatus, setCursorStatus] = useState<EditorStatus>({ language: 'yaml', line: 1, column: 1 });

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // ResizeObserver for Monaco layout inside flex
  const ensureEditorLayout = useCallback(() => {
    const editor = editorRef.current;
    const container = containerRef.current;
    if (!editor || !container) return;

    resizeObserverRef.current?.disconnect();
    requestAnimationFrame(() => editor.layout());

    const observer = new ResizeObserver(() => {
      try { editor.layout(); } catch {}
    });
    observer.observe(container);
    resizeObserverRef.current = observer;
  }, []);

  const { validateContent } = useContent();

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    requestAnimationFrame(() => { editor.layout(); });
    ensureEditorLayout();

    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
      setCursorStatus({
        language: 'yaml',
        line: e.position.lineNumber,
        column: e.position.column,
      });
    });

    // Forward to external ref if provided
    if (externalEditorRef) {
      (externalEditorRef as React.MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>).current = editor;
    }

    // Signal that Monaco model is now ready for test bridge operations.
    resolveModelReadyRef.current?.();
  }, [externalEditorRef, ensureEditorLayout]);

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
      let currentContent: string;
      const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
      if (editors.length > 0) {
        currentContent = editors[0]?.getModel?.()?.getValue?.() ?? value;
      } else {
        currentContent = editorRef.current?.getModel?.()?.getValue() ?? value;
      }
      await onSave(currentContent);
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
        monaco.editor.setModelMarkers(model, 'validation', []);
        setErrorMessage(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [arn, value, parseError, validateContent]);

  const canSave = !parseError && onSave && saveStatus !== 'saving';

  // Stable ready promise for tests
  const modelReadyRef = useRef<Promise<void>>(Promise.resolve());
  const resolveModelReadyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    modelReadyRef.current = new Promise<void>(resolve => { resolveModelReadyRef.current = resolve; });

    if (editorRef.current) {
      resolveModelReadyRef.current?.();
    }

    const globalWindow = window as typeof window & {
      __AW_MONACO_TEST__?: {
        yamlEditors?: Record<string, {
          setValue: (next: string) => void;
          getValue: () => string;
          save: () => Promise<void>;
          canSave: () => boolean;
          getError: () => string | null;
          /** Resolves when Monaco editor model is ready. */
          ready: Promise<void>;
        }>;
      };
    };

    globalWindow.__AW_MONACO_TEST__ ??= {};
    globalWindow.__AW_MONACO_TEST__.yamlEditors ??= {};
    globalWindow.__AW_MONACO_TEST__.yamlEditors[arn] = {
      setValue: (next: string) => {
        handleChange(next);
        let model = editorRef.current?.getModel();
        if (!model) {
          const editors = (window as any).monaco?.editor?.getEditors?.();
          model = editors?.[0]?.getModel?.();
        }
        model?.setValue(next);
      },
      getValue: () => {
        let model = editorRef.current?.getModel();
        if (!model) {
          const editors = (window as any).monaco?.editor?.getEditors?.();
          model = editors?.[0]?.getModel?.();
        }
        return model?.getValue() ?? value;
      },
      save: async () => { await handleSave(); },
      canSave: () => Boolean(canSave),
      getError: () => parseError ?? errorMessage,
      ready: modelReadyRef.current,
    };

    return () => {
      delete globalWindow.__AW_MONACO_TEST__?.yamlEditors?.[arn];
      resizeObserverRef.current?.disconnect();
    };
  }, [arn, canSave, errorMessage, handleChange, handleSave, parseError, value]);

  const combinedError = parseError ?? errorMessage;

  return (
    <div className="flex flex-col flex-1 min-h-0" ref={containerRef}>
      <UnifiedEditor
        mode="single"
        title={cardTitle}
        badge={cardBadge}
        arn={arn}
        singleLanguage="YAML"
        singleEditor={
          <Editor
            height="100%"
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
        }
        singleStatus={cursorStatus}
        error={combinedError}
        saved={saveStatus === 'saved'}
        onFormat={() => {
          const ed = editorRef.current;
          if (ed) {
            ed.getAction('editor.action.formatDocument')?.run();
          }
        }}
      />
    </div>
  );
}
