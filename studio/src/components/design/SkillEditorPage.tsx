/**
 * SkillEditorPage — /studio/projects/:projectId/design/skills/:skillId/editor
 * Full-page skill editor with the unified Skill data model (ADR-0011).
 * Manages: configuration, content, references, and YAML preview.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { restApiUrl } from '@/lib/apiBase';
import { EditorLayout, FormField, TagInput } from './shared';
import { MarkdownResourceEditor } from '@/components/monaco';

// ============================================================================
// Tab definitions
// ============================================================================

type TabId = 'config' | 'content' | 'tools' | 'yaml';

const TABS: { key: string; label: string }[] = [
  { key: 'config', label: 'Configuration' },
  { key: 'content', label: 'Content' },
  { key: 'tools', label: 'Tools & References' },
  { key: 'yaml', label: 'YAML Preview' },
];

// ============================================================================
// Skill data model
// ============================================================================

interface SkillData {
  id: string;
  name: string;
  namespace: string;
  scope: string;
  config: string;
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

export function SkillEditorPage() {
  const { projectId, skillId } = useParams();
  const navigate = useNavigate();

  const isNew = !skillId || skillId === 'new';
  const scope = 'global';
  const arn = isNew
    ? `arn:local:${scope}:skill/new`
    : `arn:local:${scope}:skill/${skillId}`;

  const [activeTab, setActiveTab] = useState<TabId>('config');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skill spec state
  const [name, setName] = useState('New Skill');
  const [description, setDescription] = useState('');
  const [contentPath, setContentPath] = useState('');
  const [inlineContent, setInlineContent] = useState('');
  const [useInlineContent, setUseInlineContent] = useState(false);
  const [version, setVersion] = useState('1.0.0');
  const [author, setAuthor] = useState('');
  const [license, setLicense] = useState('MIT');
  const [requiredTools, setRequiredTools] = useState<string[]>([]);
  const [references, setReferences] = useState<string[]>([]);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [markdownContent, setMarkdownContent] = useState('');

  // Load existing skill
  const fetchSkill = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${restApiUrl('')}/skills/${encodeURIComponent(arn)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load skill: HTTP ${response.status}`);
      }

      const data = (await response.json()) as SkillData;

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
      setVersion((spec.version as string) ?? '1.0.0');
      setAuthor((spec.author as string) ?? '');
      setLicense((spec.license as string) ?? 'MIT');
      setRequiredTools((spec.required_tools as string[]) ?? []);
      setReferences((spec.references as string[]) ?? []);
      setTriggers((spec.triggers as string[]) ?? []);
      setUseInlineContent(!spec.content_path && !!spec.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skill');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn]);

  useEffect(() => {
    fetchSkill();
  }, [fetchSkill]);

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
        triggers,
        scope,
        version,
        author: author || '',
        license,
        references,
        required_tools: requiredTools,
      };

      const url = isNew
        ? `${restApiUrl('')}/skills`
        : `${restApiUrl('')}/skills/${encodeURIComponent(arn)}`;

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
        navigate(`/studio/projects/${projectId}/design/skills`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skill');
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
    triggers,
    version,
    author,
    license,
    references,
    requiredTools,
    scope,
    projectId,
    navigate,
  ]);

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
    <EditorLayout
      backLabel="Skills"
      backPath={`/studio/projects/${projectId}/design/skills`}
      resourceName={isNew ? 'New Skill' : name}
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

          <FormField
            label="Description"
            description="Use when you need to... (Mattpock format, max 1024 chars)"
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1024}
              className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none"
            />
          </FormField>

          <div className="grid grid-cols-3 gap-6">
            <FormField label="Version">
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary font-mono"
              />
            </FormField>

            <FormField label="Author">
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author name"
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              />
            </FormField>

            <FormField label="License">
              <input
                type="text"
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                placeholder="MIT"
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              />
            </FormField>
          </div>
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
            <FormField
              label="Inline Content"
              description="Skill instructions and documentation"
            >
              <textarea
                value={inlineContent}
                onChange={(e) => setInlineContent(e.target.value)}
                rows={20}
                placeholder="# Skill Name&#10;&#10;Describe the skill's purpose and usage..."
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none font-mono"
              />
            </FormField>
          ) : (
            <FormField
              label="Content Path"
              description="Path to the skill file (e.g. skills/my-skill/SKILL.md)"
            >
              <input
                type="text"
                value={contentPath}
                onChange={(e) => setContentPath(e.target.value)}
                placeholder="skills/my-skill/SKILL.md"
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary font-mono"
              />
            </FormField>
          )}
        </div>
      )}

      {/* Tab 3: Tools & References */}
      {activeTab === 'tools' && (
        <div className="max-w-3xl space-y-6">
          <FormField
            label="Required Tools"
            description="Tool names this skill depends on (e.g. bash, read, cognicode_build_graph)"
          >
            <TagInput
              tags={requiredTools}
              onChange={setRequiredTools}
              placeholder="Type tool name and press Enter..."
            />
          </FormField>

          <FormField
            label="References"
            description="ARN references to other skills this skill uses"
          >
            <TagInput
              tags={references}
              onChange={setReferences}
              placeholder="arn:local:global:skill/other-skill"
            />
          </FormField>

          <FormField
            label="Triggers"
            description="Phrases that activate this skill"
          >
            <TagInput
              tags={triggers}
              onChange={setTriggers}
              placeholder="Type trigger phrase and press Enter..."
            />
          </FormField>
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
              // For skills, the entire file is markdown with frontmatter
              // The frontmatter fields need to be synced to form state
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

              // Parse frontmatter
              const frontmatter: Record<string, unknown> = {};
              for (const fl of frontmatterLines) {
                const match = fl.match(/^(\w+):\s*(.*)$/);
                if (match) {
                  const [, key, val] = match;
                  frontmatter[key] = val;
                }
              }

              // Update form state from frontmatter
              if (frontmatter.name !== undefined) setName(frontmatter.name as string);
              if (frontmatter.description !== undefined) setDescription(frontmatter.description as string);
              if (frontmatter.version !== undefined) setVersion(frontmatter.version as string);
              if (frontmatter.author !== undefined) setAuthor(frontmatter.author as string);
              if (frontmatter.license !== undefined) setLicense(frontmatter.license as string);
              if (frontmatter.triggers !== undefined) {
                const triggers = String(frontmatter.triggers).split(',').map((t: string) => t.trim());
                setTriggers(triggers);
              }
              if (frontmatter.required_tools !== undefined) {
                const tools = String(frontmatter.required_tools).split(',').map((t: string) => t.trim());
                setRequiredTools(tools);
              }
              if (frontmatter.references !== undefined) {
                const refs = String(frontmatter.references).split(',').map((t: string) => t.trim());
                setReferences(refs);
              }

              // Content goes to inlineContent if using inline
              setInlineContent(bodyLines.join('\n').trim());
              setUseInlineContent(true);

              setActiveTab('config');
            }}
          />
        </div>
      )}
    </EditorLayout>
  );
}
