/**
 * ToolEditorPage — /studio/projects/:projectId/design/tools/:toolId/editor
 * Full-page tool editor with Monaco as the single editing surface (ADR-0016).
 * All edits happen directly in Monaco; no form tabs.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import type * as Monaco from 'monaco-editor';
import { useContent } from '@/hooks/useContent';
import { EditorLayout } from './shared';
import { ResourceYamlEditor } from '@/components/monaco';

export function ToolEditorPage() {
  const { projectId, toolId } = useParams();
  const { fetchContent, updateContent, validateContent } = useContent();

  const isNew = !toolId || toolId === 'new';
  const scope = 'global';
  const arn = isNew
    ? `arn:local:${scope}:tool/new`
    : `arn:local:${scope}:tool/${toolId}`;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yamlContent, setYamlContent] = useState('');
  // Ref to Monaco editor instance — used to read fresh content on save, avoiding stale React state
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Load existing tool
  const fetchTool = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const content = await fetchContent(arn);
      if (content == null) {
        throw new Error('Failed to load tool content');
      }
      setYamlContent(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tool');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn, fetchContent]);

  useEffect(() => {
    fetchTool();
  }, [fetchTool]);

  // Save handler — Monaco YAML is the single source of truth
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      // Read fresh content directly from Monaco model to avoid stale React state
      const content = editorRef.current?.getValue() ?? yamlContent;

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
        throw new Error('Failed to save tool content');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tool');
    } finally {
      setSaving(false);
    }
  }, [arn, yamlContent, updateContent, validateContent]);

  // Loading state
  if (loading && !isNew) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-secondary text-sm animate-pulse">
          Loading tool...
        </span>
      </div>
    );
  }

  return (
    <EditorLayout
      backLabel="Tools"
      backPath={`/studio/projects/${projectId}/design/tools`}
      resourceName={isNew ? 'New Tool' : 'Tool'}
      isNew={isNew}
      onSave={handleSave}
      saving={saving}
      error={error}
    >
      <div className="h-full min-h-[500px]">
        <ResourceYamlEditor
          arn={arn}
          initialValue={yamlContent}
          onChange={(value) => setYamlContent(value)}
          editorRef={editorRef}
          onSave={async (value) => {
            await updateContent(arn, value);
          }}
        />
      </div>
    </EditorLayout>
  );
}
