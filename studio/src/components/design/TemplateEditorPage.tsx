/**
 * TemplateEditorPage — /studio/projects/:projectId/design/templates/:templateId/editor
 * Full-page template editor with the unified Template data model (ADR-0013).
 * Manages: configuration, content, variables, and YAML preview.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { restApiUrl } from '@/lib/apiBase';
import { EditorLayout, FormField } from './shared';
import { MarkdownResourceEditor } from '@/components/monaco';

// ============================================================================
// Tab definitions
// ============================================================================

type TabId = 'config' | 'content' | 'variables' | 'yaml';

const TABS: { key: string; label: string }[] = [
  { key: 'config', label: 'Configuration' },
  { key: 'content', label: 'Content' },
  { key: 'variables', label: 'Variables' },
  { key: 'yaml', label: 'YAML Preview' },
];

// ============================================================================
// Template data model
// ============================================================================

type TemplateFormat = 'markdown' | 'json' | 'yaml' | 'text';
type TargetKind = 'prompt' | 'agent' | 'skill' | 'tool' | 'any';

interface TemplateData {
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
  required: boolean;
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

    let type = 'string';
    let required = true;

    if (match[1] === '#if') {
      type = 'boolean';
    } else if (match[1] === '#each') {
      type = 'array';
    }

    // Check for default values like {{variable|default}}
    const afterMatch = content.substring(match.index + match[0].length);
    if (afterMatch.startsWith('|')) {
      required = false;
    }

    variables.push({ name, type, required });
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
// Format placeholders
// ============================================================================

const FORMAT_PLACEHOLDERS: Record<TemplateFormat, string> = {
  markdown: `# Template Name\n\nDescription of this template.\n\n{{variable_name}} - description\n`,
  json: `{\n  "key": "{{value}}"\n}`,
  yaml: `key: {{value}}\n`,
  text: `Template content with {{variable}} placeholders`,
};

// ============================================================================
// Main component
// ============================================================================

export function TemplateEditorPage() {
  const { projectId, templateId } = useParams();
  const navigate = useNavigate();

  const isNew = !templateId || templateId === 'new';
  const scope = 'global';
  const arn = isNew
    ? `arn:local:${scope}:template/new`
    : `arn:local:${scope}:template/${templateId}`;

  const [activeTab, setActiveTab] = useState<TabId>('config');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template spec state
  const [name, setName] = useState('New Template');
  const [description, setDescription] = useState('');
  const [contentPath, setContentPath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [format, setFormat] = useState<TemplateFormat>('markdown');
  const [targetKind, setTargetKind] = useState<TargetKind>('prompt');
  const [markdownContent, setMarkdownContent] = useState('');

  // Load existing template
  const fetchTemplate = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${restApiUrl('')}/templates/${encodeURIComponent(arn)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load template: HTTP ${response.status}`);
      }

      const data = (await response.json()) as TemplateData;

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
      setFileContent((spec.content as string) ?? '');
      setFormat((spec.format as TemplateFormat) ?? 'markdown');
      setTargetKind((spec.target_kind as TargetKind) ?? 'prompt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load template');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  // Detect variables from content
  const detectedVariables = useMemo(() => {
    return detectVariables(fileContent);
  }, [fileContent]);

  // Save handler
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name,
        description: description || '',
        content_path: contentPath || null,
        format,
        target_kind: targetKind,
        scope,
      };

      const url = isNew
        ? `${restApiUrl('')}/templates`
        : `${restApiUrl('')}/templates/${encodeURIComponent(arn)}`;

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
        navigate(`/studio/projects/${projectId}/design/templates`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }, [
    isNew,
    arn,
    name,
    description,
    contentPath,
    format,
    targetKind,
    scope,
    projectId,
    navigate,
  ]);

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
    <EditorLayout
      backLabel="Templates"
      backPath={`/studio/projects/${projectId}/design/templates`}
      resourceName={isNew ? 'New Template' : name}
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

          <div className="grid grid-cols-2 gap-6">
            <FormField
              label="Format"
              description="The format of this template file"
            >
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as TemplateFormat)}
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              >
                <option value="markdown">Markdown</option>
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
                <option value="text">Plain Text</option>
              </select>
            </FormField>

            <FormField
              label="Target Kind"
              description="What type of resource uses this template"
            >
              <select
                value={targetKind}
                onChange={(e) => setTargetKind(e.target.value as TargetKind)}
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              >
                <option value="prompt">Prompt</option>
                <option value="agent">Agent</option>
                <option value="skill">Skill</option>
                <option value="tool">Tool</option>
                <option value="any">Any</option>
              </select>
            </FormField>
          </div>
        </div>
      )}

      {/* Tab 2: Content */}
      {activeTab === 'content' && (
        <div className="max-w-3xl space-y-6">
          <FormField
            label="Content Path"
            description="Path to the template file (e.g. templates/my-template.md)"
          >
            <input
              type="text"
              value={contentPath}
              onChange={(e) => setContentPath(e.target.value)}
              placeholder="templates/my-template.md"
              className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary font-mono"
            />
          </FormField>

          <FormField
            label="File Content Preview"
            description="Actual template content (read-only preview, use file system to edit)"
          >
            <textarea
              value={fileContent || FORMAT_PLACEHOLDERS[format]}
              readOnly
              rows={20}
              placeholder={FORMAT_PLACEHOLDERS[format]}
              className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none font-mono"
            />
          </FormField>

          <div className="text-xs text-secondary">
            <p>
              <strong>Note:</strong> Template content is managed via the file system.
              Edit the file at <code className="px-1 py-0.5 bg-surface-container rounded">{contentPath || 'content_path'}</code> directly.
            </p>
          </div>
        </div>
      )}

      {/* Tab 3: Variables */}
      {activeTab === 'variables' && (
        <div className="max-w-3xl space-y-6">
          <FormField
            label="Detected Variables"
            description="Variables automatically inferred from template content (read-only)"
          >
            {detectedVariables.length > 0 ? (
              <div className="border border-outline-variant rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-secondary">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-secondary">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-secondary">Required</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {detectedVariables.map((v) => (
                      <tr key={v.name}>
                        <td className="px-3 py-2 font-mono text-sm text-on-surface">{`{{${v.name}}}`}</td>
                        <td className="px-3 py-2 text-sm text-secondary">{v.type}</td>
                        <td className="px-3 py-2 text-sm">
                          {v.required ? (
                            <span className="text-primary">Required</span>
                          ) : (
                            <span className="text-secondary">Optional</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 bg-surface-container/30 border border-outline-variant rounded-lg">
                <p className="text-xs text-secondary text-center">
                  No variables detected. Use <code className="px-1 py-0.5 bg-surface-container rounded">{"{{variable}}"}</code> syntax in your template content.
                </p>
              </div>
            )}
          </FormField>

          <div className="text-xs text-secondary space-y-2">
            <p>
              <strong>Variable Syntax:</strong>
            </p>
            <pre className="mt-1 p-2 bg-surface-container rounded overflow-auto">
{`{{variable_name}}           - required string
{{#if condition}}...{{/if}}  - conditional block
{{#each items}}...{{/each}}  - iteration block
{{variable|default}}         - optional with default`}
            </pre>
          </div>
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
              const lines = value.split('\n');
              const frontmatterLines: string[] = [];
              let bodyLines: string[] = [];
              let inFrontmatter = false;

              for (const line of lines) {
                if (line.trim() === '---') {
                  if (!inFrontmatter) {
                    inFrontmatter = true;
                    continue;
                  } else {
                    break;
                  }
                }
                if (inFrontmatter) {
                  frontmatterLines.push(line);
                } else {
                  bodyLines.push(line);
                }
              }

              const frontmatter: Record<string, unknown> = {};
              for (const fl of frontmatterLines) {
                const match = fl.match(/^(\w+):\s*(.*)$/);
                if (match) {
                  const [, key, val] = match;
                  frontmatter[key] = val;
                }
              }

              if (frontmatter.name !== undefined) setName(frontmatter.name as string);
              if (frontmatter.description !== undefined) setDescription(frontmatter.description as string);
              if (frontmatter.format !== undefined) setFormat(frontmatter.format as TemplateFormat);
              if (frontmatter.target_kind !== undefined) setTargetKind(frontmatter.target_kind as TargetKind);

              setFileContent(bodyLines.join('\n').trim());
              setActiveTab('config');
            }}
          />
        </div>
      )}
    </EditorLayout>
  );
}
