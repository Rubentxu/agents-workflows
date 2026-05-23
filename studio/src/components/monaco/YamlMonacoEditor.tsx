import { useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { configureMonacoYaml } from 'monaco-yaml';
import type * as Monaco from 'monaco-editor';

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
}

export interface YamlMonacoEditorProps {
  value: string;
  onChange?: (value: string) => void;
  schema?: object;
  readOnly?: boolean;
  height?: string;
  theme?: 'vs-dark' | 'light';
  onDiagnosticsChange?: (diagnostics: Diagnostic[]) => void;
}

export function YamlMonacoEditor({
  value,
  onChange,
  schema,
  readOnly = false,
  height = '100%',
  theme = 'vs-dark',
}: YamlMonacoEditorProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const configuredRef = useRef(false);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    if (!configuredRef.current) {
      configuredRef.current = true;

      configureMonacoYaml(monaco, {
        enableSchemaRequest: false,
        format: {
          enable: true,
          bracketSpacing: true,
        },
        schemas: schema
          ? [
              {
                uri: 'https://schemas.workflows.local/resource.json',
                fileMatch: ['*'],
                schema: schema as object,
              },
            ]
          : [],
      });
    }
  };

  const handleChange = (newValue: string | undefined) => {
    onChange?.(newValue ?? '');
  };

  return (
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
  );
}
