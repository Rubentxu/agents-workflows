/**
 * PromptEditorPage — /studio/projects/:projectId/design/prompts/:promptId/editor
 * Full-page prompt editor with Monaco as the single editing surface (ADR-0016).
 * All edits happen directly in Monaco; no form tabs.
 * Uses MarkdownResourceEditor for YAML frontmatter + Markdown body.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import type * as Monaco from 'monaco-editor';
import { useContent } from '@/hooks/useContent';
import { EditorLayout } from './shared';
import { MarkdownResourceEditor } from '@/components/monaco';
import { isYamlConfigFormat, yamlConfigToMarkdown, markdownToYamlConfig } from '@/lib/contentTransform';

export function PromptEditorPage() {
  const { projectId, promptId } = useParams();
  const { fetchContent, updateContent, validateContent } = useContent();

  const isNew = !promptId || promptId === 'new';
  const scope = 'global';
  const arn = isNew
    ? `arn:local:${scope}:prompt/new`
    : `arn:local:${scope}:prompt/${promptId}`;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdownContent, setMarkdownContent] = useState('');
  // Ref to Monaco editor instance — used to read fresh content on save, avoiding stale React state
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Load existing prompt
  const fetchPrompt = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const content = await fetchContent(arn);
      if (content == null) {
        throw new Error('Failed to load prompt content');
      }
      // Transform YAML config format to markdown with frontmatter for the editor
      const transformed = isYamlConfigFormat(content)
        ? yamlConfigToMarkdown(content)
        : content;
      setMarkdownContent(transformed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompt');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn, fetchContent]);

  useEffect(() => {
    fetchPrompt();
  }, [fetchPrompt]);

  // Save handler — Monaco is the single source of truth
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      // Read fresh content directly from Monaco model(s) to avoid stale React state.
      // For split view, reconstruct from both editors; for single view, use the active editor.
      const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
      let content: string;
      if (editors.length >= 2) {
        // Split view: reconstruct with --- markers
        const fmContent = editors[0]?.getModel?.()?.getValue?.() ?? '';
        const bodyContent = editors[1]?.getModel?.()?.getValue?.() ?? '';
        content = `---\n${fmContent}\n---\n${bodyContent}`;
      } else {
        content = editors[0]?.getModel?.()?.getValue?.() ?? markdownContent;
      }

      // Validate content before saving
      const validation = await validateContent(arn, content);
      if (validation && !validation.valid && validation.diagnostics.length > 0) {
        const errorMessages = validation.diagnostics
          .filter((d) => d.severity === 'error')
          .map((d) => d.message)
          .join('; ');
        if (errorMessages) {
          setError(`Validation errors: ${errorMessages}`);
          setSaving(false);
          return;
        }
      }

      const success = await updateContent(arn, content);
      if (!success) {
        throw new Error('Failed to save prompt content');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setSaving(false);
    }
  }, [arn, markdownContent, updateContent, validateContent]);

  // Loading state
  if (loading && !isNew) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-secondary text-sm animate-pulse">
          Loading prompt...
        </span>
      </div>
    );
  }

  return (
    <EditorLayout
      backLabel="Prompts"
      backPath={`/studio/projects/${projectId}/design/prompts`}
      resourceName={isNew ? 'New Prompt' : 'Prompt'}
      isNew={isNew}
      onSave={handleSave}
      saving={saving}
      error={error}
    >
      <div className="h-full min-h-[500px]">
        <MarkdownResourceEditor
          arn={arn}
          initialValue={markdownContent}
          onChange={(value) => setMarkdownContent(value)}
          editorRef={editorRef}
          onSave={async (value) => {
            // Transform markdown format to YAML config before saving
            const yamlConfig = markdownToYamlConfig(value, 'Prompt');
            await updateContent(arn, yamlConfig);
          }}
        />
      </div>
    </EditorLayout>
  );
}
