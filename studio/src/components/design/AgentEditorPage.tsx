/**
 * AgentEditorPage — /studio/projects/:projectId/design/agents/:agentId/editor
 * Full-page agent editor with the unified Agent data model (ADR-0010).
 * Manages: config, resources (prompt/skills/tools), permissions, and YAML preview.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import yaml from 'js-yaml';
import { restApiUrl } from '@/lib/apiBase';
import { useContent } from '@/hooks/useContent';
import {
  EditorLayout,
  FormField,
  TagInput,
  ArnSelector,
  ToolMapEditor,
} from './shared';
import { ResourceYamlEditor } from '@/components/monaco';

// ============================================================================
// Agent data model
// ============================================================================

type AgentMode = 'primary' | 'subagent' | 'all';

interface AgentSpec {
  name: string;
  description?: string;
  model?: string;
  prompt?: string;
  skills?: string[];
  tools?: Record<string, boolean>;
  permission?: Record<string, unknown>;
  temperature?: number;
  top_p?: number | null;
  steps?: number;
  mode?: AgentMode;
  hidden?: boolean;
  color?: string;
  variant?: string | null;
  options?: Record<string, unknown>;
}

// ============================================================================
// Color swatches
// ============================================================================

const THEME_COLORS = [
  { name: 'primary', value: '#6366f1' },
  { name: 'secondary', value: '#8b5cf6' },
  { name: 'accent', value: '#ec4899' },
  { name: 'success', value: '#22c55e' },
  { name: 'warning', value: '#f59e0b' },
  { name: 'error', value: '#ef4444' },
  { name: 'info', value: '#06b6d4' },
];

// ============================================================================
// Tab definitions
// ============================================================================

type TabId = 'config' | 'resources' | 'permissions' | 'yaml';

const TABS: { key: string; label: string }[] = [
  { key: 'yaml', label: 'YAML Preview' },
  { key: 'config', label: 'Configuration' },
  { key: 'resources', label: 'Resources' },
  { key: 'permissions', label: 'Permissions' },
];

// ============================================================================
// Mini dependency graph
// ============================================================================

interface MiniDependencyGraphProps {
  agent: AgentSpec;
}

function MiniDependencyGraph({ agent }: MiniDependencyGraphProps) {
  const nodes: { id: string; type: 'prompt' | 'skill' | 'tool'; label: string }[] = [];

  if (agent.prompt) {
    nodes.push({
      id: 'prompt',
      type: 'prompt',
      label: agent.prompt.split('/').pop() ?? 'Prompt',
    });
  }

  (agent.skills ?? []).forEach((skill, i) => {
    nodes.push({
      id: `skill-${i}`,
      type: 'skill',
      label: skill.split('/').pop() ?? 'Skill',
    });
  });

  const toolEntries = Object.entries(agent.tools ?? {}).filter(([, v]) => v);
  toolEntries.forEach(([tool], i) => {
    nodes.push({
      id: `tool-${i}`,
      type: 'tool',
      label: tool,
    });
  });

  if (nodes.length === 0) {
    return (
      <div className="text-xs text-secondary text-center py-4">
        No resources bound
      </div>
    );
  }

  const typeStyles = {
    prompt: 'bg-primary/10 border-primary/30 text-primary',
    skill: 'bg-success/10 border-success/30 text-success',
    tool: 'bg-warning/10 border-warning/30 text-warning',
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Agent node */}
      <div className="flex items-center gap-2">
        <div className="px-3 py-2 bg-surface border-2 border-primary/50 rounded text-xs font-medium text-primary">
          {agent.name || 'Agent'}
        </div>
      </div>

      {/* Dependency nodes */}
      <div className="flex flex-wrap gap-3 items-center">
        {nodes.map((node) => (
          <div key={node.id} className="flex items-center gap-2">
            <div className="w-4 h-px bg-border-subtle" />
            <span
              className={`px-2 py-1 rounded text-xs font-mono border ${typeStyles[node.type]}`}
            >
              {node.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function AgentEditorPage() {
  const { projectId, agentId } = useParams();
  const navigate = useNavigate();
  const { updateContent } = useContent();

  const isNew = !agentId || agentId === 'new';
  const arn = isNew
    ? `arn:local:project/${projectId}:agent/new`
    : `arn:local:project/${projectId}:agent/${agentId}`;

  const [activeTab, setActiveTab] = useState<TabId>('yaml');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agent spec state
  const [name, setName] = useState('New Agent');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('anthropic/claude-3-5-sonnet');
  const [prompt, setPrompt] = useState<string>('');
  const [skills, setSkills] = useState<string[]>([]);
  const [tools, setTools] = useState<Record<string, boolean>>({
    bash: true,
    read: true,
    edit: true,
  });
  const [permission, setPermission] = useState<Record<string, unknown>>({});
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState<number | null>(null);
  const [steps, setSteps] = useState(50);
  const [mode, setMode] = useState<AgentMode>('primary');
  const [hidden, setHidden] = useState(false);
  const [color, setColor] = useState('primary');
  const [variant, setVariant] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [scope] = useState('global');
  const [yamlContent, setYamlContent] = useState('');

  // Load existing agent
  const fetchAgent = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${restApiUrl('')}/agents/${encodeURIComponent(arn)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to load agent: HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        id: string;
        name: string;
        namespace: string;
        scope: string;
        config: string;
      };

      // Parse YAML config to extract spec fields
      let spec: Record<string, unknown> = {};
      try {
        // Try JSON first (some configs might be JSON)
        spec = JSON.parse(data.config);
      } catch {
        // Simple YAML extraction for known fields
        // In production, use js-yaml or similar
        spec = extractYamlSpec(data.config);
      }

      // Set raw YAML content for Monaco editor
      setYamlContent(data.config);

      // Populate form state from spec
      setName(spec.name as string ?? data.name);
      setDescription((spec.description as string) ?? '');
      setModel((spec.model as string) ?? '');
      setPrompt((spec.prompt as string) ?? '');
      setSkills((spec.skills as string[]) ?? []);
      setTools((spec.tools as Record<string, boolean>) ?? {});
      setPermission((spec.permission as Record<string, unknown>) ?? {});
      setTemperature((spec.temperature as number) ?? 0.7);
      setTopP(spec.top_p as number | null ?? null);
      setSteps((spec.steps as number) ?? 50);
      setMode((spec.mode as AgentMode) ?? 'primary');
      setHidden((spec.hidden as boolean) ?? false);
      setColor((spec.color as string) ?? 'primary');
      setVariant(spec.variant as string | null ?? null);
      setOptions((spec.options as Record<string, unknown>) ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  }, [isNew, arn]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  // F-004 fix: When switching to config tab, derive form state from YAML content
  useEffect(() => {
    if (activeTab !== 'config' || !yamlContent) return;
    try {
      const parsed = yaml.load(yamlContent) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return;
      // Extract spec from parsed YAML (handles both direct spec and wrapped format)
      const spec = (parsed.spec as Record<string, unknown>) ?? parsed;
      if (spec.name !== undefined) setName(spec.name as string);
      if (spec.description !== undefined) setDescription(spec.description as string);
      if (spec.model !== undefined) setModel(spec.model as string);
      if (spec.prompt !== undefined) setPrompt(spec.prompt as string);
      if (spec.skills !== undefined) setSkills(spec.skills as string[]);
      if (spec.tools !== undefined) setTools(spec.tools as Record<string, boolean>);
      if (spec.permission !== undefined) setPermission(spec.permission as Record<string, unknown>);
      if (spec.temperature !== undefined) setTemperature(spec.temperature as number);
      if (spec.top_p !== undefined) setTopP(spec.top_p as number | null);
      if (spec.steps !== undefined) setSteps(spec.steps as number);
      if (spec.mode !== undefined) setMode(spec.mode as AgentMode);
      if (spec.hidden !== undefined) setHidden(spec.hidden as boolean);
      if (spec.color !== undefined) setColor(spec.color as string);
      if (spec.variant !== undefined) setVariant(spec.variant as string | null);
      if (spec.options !== undefined) setOptions(spec.options as Record<string, unknown>);
    } catch {
      // Ignore parse errors - form state is already valid
    }
  }, [activeTab, yamlContent]);

  // Build current spec from form state
  const buildSpec = useCallback((): AgentSpec => {
    return {
      name,
      description: description || undefined,
      model: model || undefined,
      prompt: prompt || undefined,
      skills: skills.length > 0 ? skills : undefined,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      permission: Object.keys(permission).length > 0 ? permission : undefined,
      temperature: temperature !== 0.7 ? temperature : undefined,
      top_p: topP,
      steps: steps !== 50 ? steps : undefined,
      mode: mode !== 'primary' ? mode : undefined,
      hidden: hidden !== false ? hidden : undefined,
      color: color !== 'primary' ? color : undefined,
      variant: variant ?? undefined,
      options: Object.keys(options).length > 0 ? options : undefined,
    };
  }, [
    name,
    description,
    model,
    prompt,
    skills,
    tools,
    permission,
    temperature,
    topP,
    steps,
    mode,
    hidden,
    color,
    variant,
    options,
  ]);

  // Save handler
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name,
        description: description || '',
        model: model || 'anthropic/claude-3-5-sonnet',
        prompt: prompt || '',
        skills: skills.length > 0 ? skills : [],
        tools,
        permission,
        temperature,
        top_p: topP,
        steps,
        mode,
        hidden,
        color,
        variant: variant ?? null,
        options,
      };

      if (isNew) {
        body.scope = scope;
      }

      const url = isNew
        ? `${restApiUrl('')}/agents`
        : `${restApiUrl('')}/agents/${encodeURIComponent(arn)}`;

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

      // On successful create, navigate back
      if (isNew) {
        navigate(`/studio/projects/${projectId}/design/agents`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  }, [
    buildSpec,
    isNew,
    arn,
    name,
    description,
    model,
    prompt,
    skills,
    tools,
    permission,
    temperature,
    topP,
    steps,
    mode,
    hidden,
    color,
    variant,
    options,
    scope,
    projectId,
    navigate,
  ]);

  // Permission JSON editor
  const [permissionJson, setPermissionJson] = useState('');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Sync permission state with JSON textarea
  useEffect(() => {
    setPermissionJson(JSON.stringify(permission, null, 2));
  }, [permission]);

  const handlePermissionChange = (val: string) => {
    setPermissionJson(val);
    try {
      const parsed = JSON.parse(val);
      setPermission(parsed);
      setPermissionError(null);
    } catch {
      setPermissionError('Invalid JSON');
    }
  };

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

  const currentSpec = buildSpec();

  return (
    <EditorLayout
      backLabel="Agents"
      backPath={`/studio/projects/${projectId}/design/agents`}
      resourceName={isNew ? 'New Agent' : name}
      onResourceNameChange={isNew ? setName : undefined}
      isNew={isNew}
      scope={isNew ? undefined : scope}
      onSave={handleSave}
      saving={saving}
      error={error}
      onDelete={!isNew ? handleDelete : undefined}
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

          <FormField label="Model" description="Provider and model ID (e.g. anthropic/claude-3-5-sonnet)">
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="provider/model-id"
              className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary font-mono"
            />
          </FormField>

          <div className="grid grid-cols-3 gap-6">
            <FormField label="Mode">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as AgentMode)}
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              >
                <option value="primary">Primary</option>
                <option value="subagent">Subagent</option>
                <option value="all">All</option>
              </select>
            </FormField>

            <FormField label="Temperature">
              <input
                type="number"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                min={0}
                max={2}
                step={0.1}
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              />
            </FormField>

            <FormField label="Top P">
              <input
                type="number"
                value={topP ?? ''}
                onChange={(e) =>
                  setTopP(e.target.value ? parseFloat(e.target.value) : null)
                }
                min={0}
                max={1}
                step={0.1}
                placeholder="null"
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <FormField label="Steps" description="Maximum iterations">
              <input
                type="number"
                value={steps}
                onChange={(e) => setSteps(parseInt(e.target.value) || 50)}
                min={1}
                max={1000}
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              />
            </FormField>

            <FormField label="Variant" description="Optional variant identifier">
              <input
                type="text"
                value={variant ?? ''}
                onChange={(e) =>
                  setVariant(e.target.value || null)
                }
                placeholder="e.g. fast, balanced"
                className="w-full text-sm bg-surface border border-outline-variant rounded px-3 py-2 text-on-surface outline-none focus:border-primary"
              />
            </FormField>
          </div>

          <FormField label="Color" description="Theme color for the agent">
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                {THEME_COLORS.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => setColor(c.name)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      color === c.name
                        ? 'border-on-surface scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
              <span className="text-xs text-secondary font-mono">{color}</span>
            </div>
          </FormField>

          <FormField label="Hidden" description="Hide this agent from the UI">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
                className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
              />
              <span className="text-sm text-on-surface">
                {hidden ? 'Hidden' : 'Visible'}
              </span>
            </label>
          </FormField>
        </div>
      )}

      {/* Tab 2: Resources */}
      {activeTab === 'resources' && (
        <div className="max-w-3xl space-y-8">
          {/* Prompt */}
          <FormField
            label="Prompt Reference"
            description="The prompt ARN that defines this agent's behavior"
          >
            <ArnSelector
              resourceKind="prompt"
              value={prompt || null}
              onChange={(arn) => setPrompt(arn ?? '')}
              placeholder="arn:local:global:prompt/my-prompt"
            />
          </FormField>

          {/* Skills */}
          <FormField
            label="Skills"
            description="ARN references to skills this agent can use"
          >
            <TagInput
              tags={skills}
              onChange={setSkills}
              placeholder="arn:local:global:skill/skill-name"
            />
          </FormField>

          {/* Tools */}
          <FormField
            label="Tools"
            description="Toggle which tools this agent can access"
          >
            <ToolMapEditor tools={tools} onChange={setTools} />
          </FormField>

          {/* Mini dependency graph */}
          <FormField
            label="Dependency Graph"
            description="Visual representation of agent's resource dependencies"
          >
            <div className="p-4 bg-surface-container/30 border border-outline-variant rounded-lg">
              <MiniDependencyGraph agent={currentSpec} />
            </div>
          </FormField>
        </div>
      )}

      {/* Tab 3: Permissions */}
      {activeTab === 'permissions' && (
        <div className="max-w-3xl space-y-6">
          <FormField
            label="Permission Configuration"
            description="JSON object defining task permissions with glob patterns"
          >
            <textarea
              value={permissionJson}
              onChange={(e) => handlePermissionChange(e.target.value)}
              rows={12}
              className={`w-full text-sm font-mono bg-surface border rounded px-3 py-2 text-on-surface outline-none focus:border-primary resize-none ${
                permissionError ? 'border-error' : 'border-outline-variant'
              }`}
            />
            {permissionError && (
              <p className="mt-1 text-xs text-error">{permissionError}</p>
            )}
          </FormField>

          <div className="text-xs text-secondary space-y-1">
            <p>
              <strong>Permission format:</strong>
            </p>
            <pre className="mt-1 p-2 bg-surface-container rounded overflow-auto">
{`{
  "task": {
    "*": "deny",
    "sdd-*": "allow"
  }
}`}
            </pre>
            <p className="mt-2">
              Actions: <code>allow</code>, <code>ask</code>, <code>deny</code>
            </p>
          </div>
        </div>
      )}

      {/* Tab 4: YAML Editor */}
      {activeTab === 'yaml' && (
        <div className="h-full min-h-[500px]">
          <ResourceYamlEditor
            arn={arn}
            initialValue={yamlContent}
            onChange={(value) => setYamlContent(value)}
            onSave={async (value) => {
              await updateContent(arn, value);
            }}
          />
        </div>
      )}
    </EditorLayout>
  );
}

// ============================================================================
// YAML spec extraction utility
// ============================================================================

/**
 * Extract spec fields from YAML config string.
 * Handles simple flat YAML with known fields.
 * In production, use js-yaml or similar.
 */
function extractYamlSpec(config: string): Record<string, unknown> {
  const spec: Record<string, unknown> = {};
  const lines = config.split('\n');

  for (const line of lines) {
    // Match key: value patterns (simple YAML)
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.trim();

    // Parse value types
    let parsedValue: unknown = value;
    if (value === '' || value === '~' || value === 'null') {
      parsedValue = null;
    } else if (value === 'true') {
      parsedValue = true;
    } else if (value === 'false') {
      parsedValue = false;
    } else if (!isNaN(Number(value)) && value !== '') {
      parsedValue = Number(value);
    } else if (value.startsWith('"') || value.startsWith("'")) {
      parsedValue = value.slice(1, -1);
    }

    // Handle nested keys (e.g., spec.model, spec.temperature)
    const parts = key.split('.');
    if (parts.length === 2 && parts[0] === 'spec') {
      spec[parts[1]] = parsedValue;
    } else if (parts.length === 1) {
      spec[key] = parsedValue;
    }
  }

  return spec;
}
