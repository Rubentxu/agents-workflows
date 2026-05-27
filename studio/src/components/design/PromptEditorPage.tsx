/**
 * PromptEditorPage — /studio/projects/:projectId/design/prompts/:promptId/editor
 * Full-page prompt editor with Monaco as the single editing surface (ADR-0016).
 * All edits happen directly in Monaco; no form tabs.
 * Uses MarkdownResourceEditor for YAML frontmatter + Markdown body.
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

export function PromptEditorPage() {
  const { projectId, promptId } = useParams();
  const { fetchContent, updateContent } = useContent();
  const { validateBeforeSave } = useValidationGate();

  const isNew = !promptId || promptId === 'new';
  // When editing, promptId is the full ARN (URL-encoded) passed from the catalog.
  // When creating, we construct a new ARN.
  const arn = isNew
    ? `arn:local:global:prompt/new`
    : decodeURIComponent(promptId);

  const defaultContent = isNew
    ? `---
apiVersion: workflows.local/v1
kind: Prompt
metadata:
  name: new-prompt
  scope: global
spec:
  description: ""
  template: |
    You are a helpful assistant.
---

# New Prompt

Describe the purpose of this prompt, when it should be used, and which agent or workflow consumes it.

## Context

Explain the expected context and inputs.

## Instructions

Write the prompt instructions here. Define the role, tone, and expected behavior.

## Output Format

Describe the expected output format and any constraints.
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
      setOriginalContent(transformed);
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

      const yamlConfig = markdownToYamlConfig(content, 'Prompt');

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
        throw new Error('Failed to save prompt content');
      }
      // Read the actual content that was saved to reset dirty state
      const savedContent = editors.length >= 2
        ? `---\n${editors[0]?.getModel?.()?.getValue?.() ?? ''}\n---\n${editors[1]?.getModel?.()?.getValue?.() ?? ''}`
        : content;
      markClean(savedContent);
      toast.success('Prompt saved');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save prompt';
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
          Loading prompt...
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
        backLabel="Prompts"
        backPath={`/studio/projects/${projectId}/design/prompts`}
        resourceName={isNew ? 'New Prompt' : 'Prompt'}
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
            cardTitle="Prompt Definition"
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
