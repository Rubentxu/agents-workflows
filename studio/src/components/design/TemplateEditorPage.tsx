/**
 * TemplateEditorPage — /studio/projects/:projectId/design/templates/:templateId/editor
 * Full-page template editor with Monaco as the single editing surface (ADR-0016).
 * All edits happen directly in Monaco; no form tabs.
 * Uses MarkdownResourceEditor for format-adaptive editing.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import type * as Monaco from 'monaco-editor';
import { useContent } from '@/hooks/useContent';
import { useValidationGate } from '@/hooks/useValidationGate';
import { useDirtyGuard } from '@/hooks/useDirtyGuard';
import { EditorLayout, DirtyGuardDialog } from './shared';
import { MarkdownResourceEditor } from '@/components/monaco';
import { isYamlConfigFormat, yamlConfigToMarkdown, markdownToYamlConfig } from '@/lib/contentTransform';

export function TemplateEditorPage() {
  const { projectId, templateId } = useParams();
  const { fetchContent, updateContent } = useContent();
  const { validateBeforeSave } = useValidationGate();

  const isNew = !templateId || templateId === 'new';
  // When editing, templateId is the full ARN (URL-encoded) passed from the catalog.
  // When creating, we construct a new ARN.
  const arn = isNew
    ? `arn:local:global:template/new`
    : decodeURIComponent(templateId);

  const defaultContent = isNew
    ? `---
apiVersion: workflows.local/v1
kind: Template
metadata:
  name: new-template
  scope: global
spec:
  description: ""
  targetKind: Workflow
  parameters:
    - name: example
      type: string
      description: "Example parameter"
      required: true
  manifest:
    apiVersion: workflows.local/v1
    kind: Workflow
    metadata:
      name: "{{name}}"
      scope: "{{scope}}"
    spec:
      stages: []
---

# New Template

Describe what this template generates, which resources it creates, and when to use it.

## Parameters

- \`name\` (string, required): The name of the generated resource.
- \`scope\` (string, required): The scope for the generated resource.
- \`example\` (string, required): Example parameter description.

## Usage

Explain how to use this template and what outputs to expect.
`
    : '';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdownContent, setMarkdownContent] = useState(defaultContent);
  const [originalContent, setOriginalContent] = useState(defaultContent);
  // Ref to Monaco editor instance — used to read fresh content on save, avoiding stale React state
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Dirty guard: prevent data loss when navigating away with unsaved changes
  const { isDirty, markClean, confirmNavigation, cancelNavigation, blockerState } =
    useDirtyGuard(originalContent, markdownContent);

  // Load existing template
  const fetchTemplate = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const content = await fetchContent(arn);
      if (content == null) {
        throw new Error('Failed to load template content');
      }
      // Transform YAML config format to markdown with frontmatter for the editor
      const transformed = isYamlConfigFormat(content)
        ? yamlConfigToMarkdown(content)
        : content;
      setMarkdownContent(transformed);
      setOriginalContent(transformed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load template');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn, fetchContent]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  // Save handler — Monaco is the single source of truth
  const handleSave = useCallback(async (): Promise<boolean> => {
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

      const yamlConfig = markdownToYamlConfig(content, 'Template');

      // Validate content before saving
      const gate = await validateBeforeSave(arn, yamlConfig);
      if (!gate.allowed) {
        const errorMessages = gate.diagnostics
          .filter((d) => d.severity === 'error')
          .map((d) => d.message)
          .join('; ');
        setError(`Validation errors: ${errorMessages}`);
        setSaving(false);
        return false;
      }

      const success = await updateContent(arn, yamlConfig);
      if (!success) {
        throw new Error('Failed to save template content');
      }
      // Read the actual content that was saved to reset dirty state
      const savedContent = editors.length >= 2
        ? `---\n${editors[0]?.getModel?.()?.getValue?.() ?? ''}\n---\n${editors[1]?.getModel?.()?.getValue?.() ?? ''}`
        : content;
      markClean(savedContent);
      toast.success('Template saved');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save template';
      setError(msg);
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }, [arn, markdownContent, updateContent, validateBeforeSave, markClean]);

  // Loading state
  if (loading && !isNew) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-secondary text-sm animate-pulse">
          Loading template...
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
        backLabel="Templates"
        backPath={`/studio/projects/${projectId}/design/templates`}
        resourceName={isNew ? 'New Template' : 'Template'}
        isNew={isNew}
        arn={arn}
        onSave={handleSave}
        saving={saving}
        error={error}
        isDirty={isDirty}
      >
        <div className="flex-1 min-h-0 flex flex-col">
          <MarkdownResourceEditor
            arn={arn}
            cardTitle="Template Definition"
            cardBadge="YAML + Markdown"
            initialValue={markdownContent}
            onChange={(value) => setMarkdownContent(value)}
            editorRef={editorRef}
            onSave={() => handleSave()}
          />
        </div>
      </EditorLayout>
    </>
  );
}
