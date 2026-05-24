/**
 * PromptEditorPage — /studio/projects/:projectId/design/prompts/:promptId/editor
 * Full-page prompt editor with the unified Prompt data model (ADR-0012).
 * Manages: configuration, content, template reference, and YAML preview.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import yaml from 'js-yaml';
import { restApiUrl } from '@/lib/apiBase';
import { useContent } from '@/hooks/useContent';
import { EditorLayout, FormField, ArnSelector } from './shared';
import { MarkdownResourceEditor } from '@/components/monaco';

// ============================================================================
// Tab definitions
// ============================================================================

type TabId = 'config' | 'content' | 'template' | 'yaml';

const TABS: { key: string; label: string }[] = [
  { key: 'yaml', label: 'YAML Preview' },
  { key: 'config', label: 'Configuration' },
  { key: 'content', label: 'Content' },
  { key: 'template', label: 'Template' },
];

// ============================================================================
// Prompt data model
// ============================================================================

type PromptKind = 'system' | 'user' | 'template';

interface PromptData {
  id: string;
  name: string;
  namespace: string;
  scope: string;
  config: string;
}

// ============================================================================
// Variable detection
// ============================================================================

interface DetectedVariable {
  name: string;
  type: string;
}

function detectVariables(content: string): DetectedVariable[] {
  const regex = /\{\{(#if\s+|#each\s+)?(\w+)\}\}/g;
  const variables: DetectedVariable[] = [];
  const seen = new Set<string>();
  let match;

  while ((match = regex.exec(content)) !== null) {
    const name = match[2];
    if (seen.has(name)) continue;
    seen.add(name);

    // Infer type from context
    let type = 'string';
    const afterMatch = content.substring(match.index + match[0].length);
    if (match[1] === '#if') {
      type = 'boolean';
    } else if (match[1] === '#each') {
      type = 'array';
    } else if (afterMatch.includes('| length') || afterMatch.includes('| size')) {
      type = 'number';
    }

    variables.push({ name, type });
  }

  return variables;
}

// ============================================================================
// YAML spec extraction utility
// ============================================================================

function extractYamlSpec(config: string): Record<string, unknown> {
  const spec: Record<string, unknown> = {};
  const lines = config.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim();

    let parsedValue: unknown = value;
    if (value === '' || value === '~' || value === 'null') {
      parsedValue = null;
    } else if (value === 'true') {
      parsedValue = true;
    } else if (value === 'false') {
      parsedValue = false;
    } else if (!isNaN(Number(value)) && value !== '') {
      parsedValue = Number(value);
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      parsedValue = value.slice(1, -1);
    }

    const parts = key.split('.');
    if (parts.length === 2 && parts[0] === 'spec') {
      spec[parts[1]] = parsedValue;
    } else if (parts.length === 1) {
      spec[key] = parsedValue;
    }
  }

  return spec;
}

// ============================================================================
// Main component
// ============================================================================

export function PromptEditorPage() {
  const { projectId, promptId } = useParams();
  const navigate = useNavigate();
  const { updateContent } = useContent();

  const isNew = !promptId || promptId === 'new';
  const scope = 'global';
  const arn = isNew
    ? `arn:local:${scope}:prompt/new`
    : `arn:local:${scope}:prompt/${promptId}`;

  const [activeTab, setActiveTab] = useState<TabId>('yaml');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prompt spec state
  const [name, setName] = useState('New Prompt');
  const [description, setDescription] = useState('');
  const [contentPath, setContentPath] = useState('');
  const [inlineContent, setInlineContent] = useState('');
  const [useInlineContent, setUseInlineContent] = useState(false);
  const [kind, setKind] = useState<PromptKind>('system');
  const [template, setTemplate] = useState<string>('');
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

      const data = (await response.json()) as PromptData;

      let spec: Record<string, unknown> = {};
      try {
        spec = JSON.parse(data.config);
      } catch {
        spec = extractYamlSpec(data.config);
      }

      // Set raw markdown content for Monaco editor
      setMarkdownContent(data.config);

      setName(spec.name as string ?? data.name);
      setDescription((spec.description as string) ?? '');
      setContentPath((spec.content_path as string) ?? '');
      setInlineContent((spec.content as string) ?? '');
      setKind((spec.kind as PromptKind) ?? 'system');
      setTemplate((spec.template as string) ?? '');
      setUseInlineContent(!spec.content_path && !!spec.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompt');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn]);

  useEffect(() => {
    fetchPrompt();
  }, [fetchPrompt]);

  // F-004 fix: When switching to config/content/template tabs, derive form state from markdown content
  useEffect(() => {
    if (activeTab === 'yaml' || !markdownContent) return;
    try {
      const lines = markdownContent.split('\n');
      if (lines[0]?.trim() !== '---') return;
      const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
      if (endIndex === -1) return;
      const frontmatter = lines.slice(1, endIndex + 1).join('\n');
      const parsed = yaml.load(frontmatter) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return;
      if (parsed.name !== undefined) setName(parsed.name as string);
      if (parsed.description !== undefined) setDescription(parsed.description as string);
      if (parsed.content_path !== undefined) setContentPath(parsed.content_path as string);
      if (parsed.content !== undefined) setInlineContent(parsed.content as string);
      if (parsed.kind !== undefined) setKind(parsed.kind as PromptKind);
      if (parsed.template !== undefined) setTemplate(parsed.template as string);
      setUseInlineContent(!parsed.content_path && !!parsed.content);
    } catch {
      // Ignore parse errors
    }
  }, [activeTab, markdownContent]);

  // Detect variables from content
  const detectedVariables = useMemo(() => {
    const content = useInlineContent ? inlineContent : '';
    return detectVariables(content);
  }, [inlineContent, useInlineContent]);

  // Save handler
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name,
        description: description || '',
        content_path: useInlineContent ? null : contentPath || null,
        content: useInlineContent ? inlineContent : null,
        scope,
        kind,
        template: template || null,
      };

      const url = isNew
        ? `${restApiUrl('')}/prompts`
        : `${restApiUrl('')}/prompts/${encodeURIComponent(arn)}`;

      const method = isNew ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          (errData as { message?: string }).message ?? `Failed to save: HTTP ${response.status}`
        );
      }

      if (isNew) {
        navigate(`/studio/projects/${projectId}/design/prompts`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompt');
    } finally {
      setSaving(false);
    }
  }, [
    isNew,
    arn,
    name,
    description,
    contentPath,
    inlineContent,
    useInlineContent,
    kind,
    template,
    scope,
    projectId,
    navigate,
  ]);

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
      resourceName={isNew ? 'New Prompt' : name}
      onResourceNameChange={isNew ? setName : undefined}
      isNew={isNew}
      scope={isNew ? undefined : scope}
      onSave={handleSave}
      saving={saving}
      error={error}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={(t) => setActiveTab(t as TabId)}
    >
      {/* Tab 1: Configuration */}
      {activeTab === 'config' && (
        <div className="max-w-3xl space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <FormField label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              />
            </FormField>

            <FormField label="Scope">
              <div className="px-3 py-2 bg-surface-container text-secondary text-sm rounded border border-outline-variant font-mono">
                {scope}
              </div>
            </FormField>
          </div>

          <FormField label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none"
            />
          </FormField>

          <FormField label="Kind" description="Classification of this prompt">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as PromptKind)}
              className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
            >
              <option value="system">System</option>
              <option value="user">User</option>
              <option value="template">Template</option>
            </select>
          </FormField>
        </div>
      )}

      {/* Tab 2: Content */}
      {activeTab === 'content' && (
        <div className="max-w-3xl space-y-6">
          <FormField
            label="Content Mode"
            description="Choose between file reference or inline content"
          >
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!useInlineContent}
                  onChange={() => setUseInlineContent(false)}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                <span className="text-sm text-on-surface">File Reference</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={useInlineContent}
                  onChange={() => setUseInlineContent(true)}
                  className="w-4 h-4 text-primary focus:ring-primary"
                />
                <span className="text-sm text-on-surface">Inline Content (legacy)</span>
              </label>
            </div>
          </FormField>

          {useInlineContent ? (
            <>
              <FormField
                label="Inline Content"
                description="Prompt text with {{variable}} placeholders"
              >
                <textarea
                  value={inlineContent}
                  onChange={(e) => setInlineContent(e.target.value)}
                  rows={20}
                  placeholder="You are a helpful assistant. {{user_name}} is asking about {{topic}}."
                  className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none font-mono"
                />
              </FormField>

              {detectedVariables.length > 0 && (
                <FormField
                  label="Detected Variables"
                  description="Variables automatically inferred from content"
                >
                  <div className="border border-outline-variant rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-container/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-secondary">Name</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-secondary">Inferred Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {detectedVariables.map((v) => (
                          <tr key={v.name}>
                            <td className="px-3 py-2 font-mono text-sm text-on-surface">{`{{${v.name}}}`}</td>
                            <td className="px-3 py-2 text-sm text-secondary">{v.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </FormField>
              )}
            </>
          ) : (
            <FormField
              label="Content Path"
              description="Path to the prompt file (e.g. prompts/my-prompt.md)"
            >
              <input
                type="text"
                value={contentPath}
                onChange={(e) => setContentPath(e.target.value)}
                placeholder="prompts/my-prompt.md"
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary font-mono"
              />
            </FormField>
          )}
        </div>
      )}

      {/* Tab 3: Template */}
      {activeTab === 'template' && (
        <div className="max-w-3xl space-y-6">
          <FormField
            label="Template ARN Reference"
            description="Optional ARN reference to a template for output formatting"
          >
            <ArnSelector
              resourceKind="template"
              value={template || null}
              onChange={(arn) => setTemplate(arn ?? '')}
              placeholder="arn:local:global:template/output-format"
            />
          </FormField>

          {template && (
            <div className="p-4 bg-surface-container/30 border border-outline-variant rounded-lg">
              <p className="text-xs text-secondary">
                Template connected: <span className="font-mono">{template}</span>
              </p>
            </div>
          )}

          {!template && (
            <div className="p-4 bg-surface-container/30 border border-outline-variant rounded-lg">
              <p className="text-xs text-secondary text-center">
                No template connected. Output will be raw text.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Markdown Editor */}
      {activeTab === 'yaml' && (
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
      )}
    </EditorLayout>
  );
}
