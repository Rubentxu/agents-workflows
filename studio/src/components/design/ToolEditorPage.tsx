/**
 * ToolEditorPage — /studio/projects/:projectId/design/tools/:toolId/editor
 * Full-page tool editor with Monaco as the single editing surface (ADR-0016).
 * All edits happen directly in Monaco; no form tabs.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import type * as Monaco from 'monaco-editor';
import { useContent } from '@/hooks/useContent';
import { useValidationGate } from '@/hooks/useValidationGate';
import { useDirtyGuard } from '@/hooks/useDirtyGuard';
import { EditorLayout, DirtyGuardDialog } from './shared';
import { ResourceYamlEditor } from '@/components/monaco';
import { KIND_TO_API_VERSION } from '@/types';

export function ToolEditorPage() {
  const { projectId, toolId } = useParams();
  const { fetchContent, updateContent } = useContent();
  const { validateBeforeSave } = useValidationGate();

  const isNew = !toolId || toolId === 'new';
  // When editing, toolId is the full ARN (URL-encoded) passed from the catalog.
  // When creating, we construct a new ARN with project scope.
  const arn = isNew
    ? `arn:local:project/${projectId}:tool/new`
    : decodeURIComponent(toolId);

  const defaultYaml = isNew
    ? `apiVersion: ${KIND_TO_API_VERSION.Tool}
kind: Tool
metadata:
  name: new-tool
  scope: project/${projectId}
spec:
  description: ""
  capabilities: []
  input_schema:
    type: object
    properties: {}
    required: []
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
      setOriginalContent(content);
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
        throw new Error('Failed to save tool content');
      }
      markClean(content);
      toast.success('Tool saved');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save tool';
      setError(msg);
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [arn, yamlContent, updateContent, validateBeforeSave, markClean]);

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
        backLabel="Tools"
        backPath={`/studio/projects/${projectId}/design/tools`}
        resourceName={isNew ? 'New Tool' : 'Tool'}
        isNew={isNew}
        onSave={handleSave}
        saving={saving}
        error={error}
        isDirty={isDirty}
      >
        <div className="flex-1 min-h-[500px] flex flex-col">
          <ResourceYamlEditor
            arn={arn}
            cardTitle="Tool Definition"
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
