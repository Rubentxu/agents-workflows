/**
 * SkillEditorPage — /studio/projects/:projectId/design/skills/:skillId/editor
 * Full-page skill editor with Monaco as the single editing surface (ADR-0016).
 * All edits happen directly in Monaco; no form tabs.
 * Uses MarkdownResourceEditor with UnifiedEditor shell for YAML frontmatter + Markdown body.
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

export function SkillEditorPage() {
  const { projectId, skillId } = useParams();
  const { fetchContent, updateContent } = useContent();
  const { validateBeforeSave } = useValidationGate();

  const isNew = !skillId || skillId === 'new';
  // When editing, skillId is the full ARN (URL-encoded) passed from the catalog.
  // When creating, we construct a new ARN.
  const arn = isNew
    ? `arn:local:global:skill/new`
    : decodeURIComponent(skillId);

  const defaultContent = isNew
    ? `---
apiVersion: workflows.local/v1
kind: Skill
metadata:
  name: new-skill
  scope: global
spec:
  description: ""
  triggers:
    - example trigger
  instructions: |
    Write your skill instructions here.
---

# New Skill

Describe what this skill does, how it works, and when to use it.

## Inputs
- \`input_name\` (string): Description of the input.

## Outputs
- \`output_name\` (string): Description of the output.

## Instructions

Write the skill instructions here. Be specific about the expected behavior, edge cases, and error handling.
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

  // Load existing skill
  const fetchSkill = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const content = await fetchContent(arn);
      if (content == null) {
        throw new Error('Failed to load skill content');
      }
      // Transform YAML config format to markdown with frontmatter for the editor
      const transformed = isYamlConfigFormat(content)
        ? yamlConfigToMarkdown(content)
        : content;
      setMarkdownContent(transformed);
      setOriginalContent(transformed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skill');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn, fetchContent]);

  useEffect(() => {
    fetchSkill();
  }, [fetchSkill]);

  // Save handler — Monaco is the single source of truth
  const handleSave = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);

    try {
      // Read fresh content directly from Monaco model(s) to avoid stale React state.
      const editors = (window as any).monaco?.editor?.getEditors?.() ?? [];
      let content: string;
      if (editors.length >= 2) {
        const fmContent = editors[0]?.getModel?.()?.getValue?.() ?? '';
        const bodyContent = editors[1]?.getModel?.()?.getValue?.() ?? '';
        content = `---\n${fmContent}\n---\n${bodyContent}`;
      } else {
        content = editors[0]?.getModel?.()?.getValue?.() ?? markdownContent;
      }
      const yamlConfig = markdownToYamlConfig(content, 'Skill');

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
        throw new Error('Failed to save skill content');
      }
      const savedContent = editors.length >= 2
        ? `---\n${editors[0]?.getModel?.()?.getValue?.() ?? ''}\n---\n${editors[1]?.getModel?.()?.getValue?.() ?? ''}`
        : content;
      markClean(savedContent);
      toast.success('Skill saved');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save skill';
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
          Loading skill...
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
        backLabel="Skills"
        backPath={`/studio/projects/${projectId}/design/skills`}
        resourceName={isNew ? 'New Skill' : 'Skill'}
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
            cardTitle="Skill Definition"
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
