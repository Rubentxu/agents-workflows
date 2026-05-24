/**
 * PromptEditorPage — /studio/projects/:projectId/design/prompts/:promptId/editor
 * Full-page prompt editor with Monaco as the single editing surface (ADR-0016).
 * All edits happen directly in Monaco; no form tabs.
 * Uses MarkdownResourceEditor for YAML frontmatter + Markdown body.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { restApiUrl } from '@/lib/apiBase';
import { useContent } from '@/hooks/useContent';
import { EditorLayout } from './shared';
import { MarkdownResourceEditor } from '@/components/monaco';

export function PromptEditorPage() {
  const { projectId, promptId } = useParams();
  const { updateContent, validateContent } = useContent();

  const isNew = !promptId || promptId === 'new';
  const scope = 'global';
  const arn = isNew
    ? `arn:local:${scope}:prompt/new`
    : `arn:local:${scope}:prompt/${promptId}`;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdownContent, setMarkdownContent] = useState('');

  // Load existing prompt
  const fetchPrompt = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${restApiUrl('')}/prompts/${encodeURIComponent(arn)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load prompt: HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        id: string;
        name: string;
        namespace: string;
        scope: string;
        config: string;
      };

      setMarkdownContent(data.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompt');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn]);

  useEffect(() => {
    fetchPrompt();
  }, [fetchPrompt]);

  // Save handler — Monaco is the single source of truth
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      // Validate content before saving
      const validation = await validateContent(arn, markdownContent);
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

      const success = await updateContent(arn, markdownContent);
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
          onSave={async (value) => {
            await updateContent(arn, value);
          }}
        />
      </div>
    </EditorLayout>
  );
}
