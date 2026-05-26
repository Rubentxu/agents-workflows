/**
 * SkillEditorPage — /studio/projects/:projectId/design/skills/:skillId/editor
 * Full-page skill editor with Monaco as the single editing surface (ADR-0016).
 * All edits happen directly in Monaco; no form tabs.
 * Uses MarkdownResourceEditor for YAML frontmatter + Markdown body.
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import type * as Monaco from 'monaco-editor';
import { useContent } from '@/hooks/useContent';
import { useDirtyGuard } from '@/hooks/useDirtyGuard';
import { EditorLayout, DirtyGuardDialog } from './shared';
import { MarkdownResourceEditor } from '@/components/monaco';
import { isYamlConfigFormat, yamlConfigToMarkdown, markdownToYamlConfig } from '@/lib/contentTransform';

export function SkillEditorPage() {
  const { projectId, skillId } = useParams();
  const { fetchContent, updateContent, validateContent } = useContent();

  const isNew = !skillId || skillId === 'new';
  const scope = 'global';
  const arn = isNew
    ? `arn:local:${scope}:skill/new`
    : `arn:local:${scope}:skill/${skillId}`;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdownContent, setMarkdownContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
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
        throw new Error('Failed to save skill content');
      }
      // Read the actual content that was saved (may differ from input due to transform)
      const savedContent = editors.length >= 2
        ? `---\n${editors[0]?.getModel?.()?.getValue?.() ?? ''}\n---\n${editors[1]?.getModel?.()?.getValue?.() ?? ''}`
        : content;
      markClean(savedContent);
      toast.success('Skill saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save skill';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [arn, markdownContent, updateContent, validateContent]);

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
            await handleSave();
            confirmNavigation();
          }}
        />
      )}
      <EditorLayout
        backLabel="Skills"
        backPath={`/studio/projects/${projectId}/design/skills`}
        resourceName={isNew ? 'New Skill' : 'Skill'}
        isNew={isNew}
        onSave={handleSave}
        saving={saving}
        error={error}
        isDirty={isDirty}
      >
        <div className="h-full min-h-[500px]">
          <MarkdownResourceEditor
            arn={arn}
            initialValue={markdownContent}
            onChange={(value) => setMarkdownContent(value)}
            editorRef={editorRef}
            onSave={async (value) => {
              // Transform markdown format to YAML config before saving
              const yamlConfig = markdownToYamlConfig(value, 'Skill');
              await updateContent(arn, yamlConfig);
              markClean(value);
            }}
          />
        </div>
      </EditorLayout>
    </>
  );
}
