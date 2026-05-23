import { useRef } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';

export type { OnMount, OnChange };

export interface MonacoEditorBaseProps {
  value: string;
  onChange?: OnChange;
  language?: string;
  readOnly?: boolean;
  height?: string;
  theme?: 'vs-dark' | 'light';
  onMount?: OnMount;
  options?: Monaco.editor.IStandaloneEditorConstructionOptions;
}

export function MonacoEditorBase({
  value,
  onChange,
  language = 'yaml',
  readOnly = false,
  height = '100%',
  theme = 'vs-dark',
  options = {},
}: MonacoEditorBaseProps) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.focus();
  };

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      theme={theme}
      onChange={onChange}
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
        ...options,
      }}
    />
  );
}
