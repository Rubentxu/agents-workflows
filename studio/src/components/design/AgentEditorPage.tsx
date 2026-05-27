/**
 * AgentEditorPage — /studio/projects/:projectId/design/agents/:agentId/editor
 * Full-page agent editor with Monaco as the single editing surface (ADR-0016).
 * All edits happen directly in Monaco; no form tabs.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type * as Monaco from 'monaco-editor';
import { restApiUrl } from '@/lib/apiBase';
import { useContent } from '@/hooks/useContent';
import { useValidationGate } from '@/hooks/useValidationGate';
import { useDirtyGuard } from '@/hooks/useDirtyGuard';
import { EditorLayout, DirtyGuardDialog } from './shared';
import { ResourceYamlEditor } from '@/components/monaco';

export function AgentEditorPage() {
  const { projectId, agentId } = useParams();
  const navigate = useNavigate();
  const { fetchContent, updateContent } = useContent();
  const { validateBeforeSave } = useValidationGate();

  const isNew = !agentId || agentId === 'new';
  // When editing, agentId is the full ARN (URL-encoded) passed from the catalog.
  // When creating, we construct a new ARN with project scope.
  const arn = isNew
    ? `arn:local:project/${projectId}:agent/new`
    : decodeURIComponent(agentId);

  const defaultYaml = isNew
    ? `apiVersion: workflows.local/v1
kind: Agent
metadata:
  name: new-agent
  scope: project/${projectId}
spec:
  description: ""
  model: openai/gpt-4
  skills: []
  prompts: []
  tools: []
  temperature: 0.7
`
    : '';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yamlContent, setYamlContent] = useState(defaultYaml);
  const [originalContent, setOriginalContent] = useState(defaultYaml);
  // Ref to Monaco editor instance — used to read fresh content on save, avoiding stale React state
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Dirty guard: prevent data loss when navigating away with unsaved changes
  const { isDirty, markClean, confirmNavigation, cancelNavigation, blockerState } =
    useDirtyGuard(originalContent, yamlContent);

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
      setOriginalContent(content);
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
  const handleSave = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);

    try {
      // Read fresh content directly from Monaco model to avoid stale React state
      const content = editorRef.current?.getValue() ?? yamlContent;

      // Validate content before saving
      const gate = await validateBeforeSave(arn, content);
      if (!gate.allowed) {
        const errorMessages = gate.diagnostics
          .filter((d) => d.severity === 'error')
          .map((d) => d.message)
          .join('; ');
        setError(`Validation errors: ${errorMessages}`);
        setSaving(false);
        return false;
      }

      const success = await updateContent(arn, content);
      if (!success) {
        throw new Error('Failed to save agent content');
      }
      markClean(content);
      toast.success('Agent saved');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save agent';
      setError(msg);
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [arn, yamlContent, updateContent, validateBeforeSave, markClean]);

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
    <>
      {blockerState === 'blocked' && (
        <DirtyGuardDialog
          onStay={cancelNavigation}
          onDiscard={confirmNavigation}
          onSaveAndLeave={async () => {
            if (await handleSave()) {
              confirmNavigation();
            }
          }}
        />
      )}
      <EditorLayout
        backLabel="Agents"
        backPath={`/studio/projects/${projectId}/design/agents`}
        resourceName={isNew ? 'New Agent' : 'Agent'}
        isNew={isNew}
        onSave={handleSave}
        saving={saving}
        error={error}
        onDelete={!isNew ? handleDelete : undefined}
        isDirty={isDirty}
      >
        <div className="flex-1 min-h-[500px] flex flex-col">
          <ResourceYamlEditor
            arn={arn}
            cardTitle="Agent Definition"
            cardBadge="YAML Configuration"
            initialValue={yamlContent}
            onChange={(value) => setYamlContent(value)}
            editorRef={editorRef}
            onSave={() => handleSave()}
          />
        </div>
      </EditorLayout>
    </>
  );
}
