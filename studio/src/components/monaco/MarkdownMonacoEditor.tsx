import { useState, useCallback } from 'react';
import { MonacoEditorBase } from './MonacoEditorBase';
import type { OnMount } from '@monaco-editor/react';

export interface MarkdownMonacoEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  theme?: 'vs-dark' | 'light';
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string; error?: string } {
  const lines = content.split('\n');

  if (lines[0]?.trim() !== '---') {
    return { frontmatter: {}, body: content };
  }

  const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
  if (endIndex === -1) {
    return { frontmatter: {}, body: content, error: 'Unclosed frontmatter' };
  }

  const frontmatterLines = lines.slice(1, endIndex + 1);
  const bodyLines = lines.slice(endIndex + 2);

  const frontmatter: Record<string, unknown> = {};
  for (const line of frontmatterLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    frontmatter[key] = value;
  }

  return {
    frontmatter,
    body: bodyLines.join('\n'),
  };
}

export function MarkdownMonacoEditor({
  value,
  onChange,
  readOnly = false,
  height = '100%',
  theme = 'vs-dark',
}: MarkdownMonacoEditorProps) {
  const [frontmatterError, setFrontmatterError] = useState<string | null>(null);

  const handleMount: OnMount = (_editor, monaco) => {
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
  };

  const handleChange = useCallback(
    (newValue: string | undefined) => {
      const content = newValue ?? '';
      const parsed = parseFrontmatter(content);
      if (parsed.error) {
        setFrontmatterError(parsed.error);
      } else {
        setFrontmatterError(null);
      }
      onChange?.(content);
    },
    [onChange]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <MonacoEditorBase
          value={value}
          onChange={handleChange}
          language="markdown"
          readOnly={readOnly}
          height={height}
          theme={theme}
          onMount={handleMount}
        />
      </div>
      {frontmatterError && (
        <div className="px-4 py-2 bg-error-container text-on-error-container text-xs border-t border-outline-variant">
          Frontmatter error: {frontmatterError}
        </div>
      )}
    </div>
  );
}
