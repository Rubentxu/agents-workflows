/**
 * AgentEditorPage — /studio/projects/:projectId/design/agents/:agentId/editor
 * Full-page agent editor with Monaco as the single editing surface (ADR-0016).
 * All edits happen directly in Monaco; no form tabs.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type * as Monaco from 'monaco-editor';
import { restApiUrl } from '@/lib/apiBase';
import { useContent } from '@/hooks/useContent';
import { EditorLayout } from './shared';
import { ResourceYamlEditor } from '@/components/monaco';

export function AgentEditorPage() {
  const { projectId, agentId } = useParams();
  const navigate = useNavigate();
  const { fetchContent, updateContent, validateContent } = useContent();

  const isNew = !agentId || agentId === 'new';
  const arn = isNew
    ? `arn:local:project/${projectId}:agent/new`
    : `arn:local:project/${projectId}:agent/${agentId}`;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yamlContent, setYamlContent] = useState('');
  // Ref to Monaco editor instance — used to read fresh content on save, avoiding stale React state
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Load existing agent
  const fetchAgent = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const content = await fetchContent(arn);
      if (content == null) {
        throw new Error('Failed to load agent content');
      }
      setYamlContent(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn, fetchContent]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

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
        throw new Error('Failed to save agent content');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  }, [arn, yamlContent, updateContent, validateContent]);

  // Delete handler
  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this agent? This action cannot be undone.')) return;
    try {
      const response = await fetch(
        `${restApiUrl('')}/agents/${encodeURIComponent(arn)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error(`Failed to delete: HTTP ${response.status}`);
      }
      navigate(`/studio/projects/${projectId}/design/agents`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete agent');
    }
  }, [arn, projectId, navigate]);

  // Loading state
  if (loading && !isNew) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-secondary text-sm animate-pulse">
          Loading agent...
        </span>
      </div>
    );
  }

  return (
    <EditorLayout
      backLabel="Agents"
      backPath={`/studio/projects/${projectId}/design/agents`}
      resourceName={isNew ? 'New Agent' : 'Agent'}
      isNew={isNew}
      onSave={handleSave}
      saving={saving}
      error={error}
      onDelete={!isNew ? handleDelete : undefined}
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
